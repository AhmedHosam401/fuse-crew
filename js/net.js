// net.js — one tiny database API with two backends:
//   • Firebase Realtime Database (real online play) when firebase-config.js is filled in
//   • a "demo" backend (localStorage + BroadcastChannel) so you can test with several tabs, no setup
//
// API: init() → { mode, uid, now(), get(path), set(path,val), update(path,obj), push(path,val),
//                 remove(path), on(path,cb) → unsubscribe, onDisconnectSet(path,val) }
import { FIREBASE_CONFIG } from '../firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';

export function isFirebaseConfigured() {
  return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL
    && !String(FIREBASE_CONFIG.apiKey).startsWith('YOUR'));
}

// Online play: Firebase when configured, otherwise the multi-tab demo backend.
export async function createNet() {
  return isFirebaseConfigured() ? createFirebaseNet() : createDemoNet(false);
}

// One-phone / offline play: pure in-memory, no storage, no network.
export function createLocalNet() { return createDemoNet(true); }

// ---------------------------------------------------------------- Firebase
async function createFirebaseNet() {
  const [{ initializeApp }, { getAuth, signInAnonymously }, db] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-database.js'),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  const database = db.getDatabase(app);

  let offset = 0;
  db.onValue(db.ref(database, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  const r = (p) => db.ref(database, p);

  return {
    mode: 'firebase',
    uid: auth.currentUser.uid,
    now: () => Date.now() + offset,
    async get(path) { return (await db.get(r(path))).val(); },
    set: (path, val) => db.set(r(path), val),
    update: (path, obj) => db.update(r(path), obj),
    async push(path, val) { const ref = db.push(r(path)); await db.set(ref, val); return ref.key; },
    remove: (path) => db.remove(r(path)),
    on(path, cb) { return db.onValue(r(path), (s) => cb(s.val())); },
    onDisconnectSet(path, val) { db.onDisconnect(r(path)).set(val); },
  };
}

// ---------------------------------------------------------------- Demo (same browser, many tabs)
function createDemoNet(memoryOnly) {
  const KEY = 'fuse-demo-db';
  const bc = !memoryOnly && 'BroadcastChannel' in window ? new BroadcastChannel('fuse-demo') : null;
  let uid = null;
  try { uid = sessionStorage.getItem('fuse-uid'); } catch (e) { /* ignore */ }
  if (!uid) {
    uid = 'u' + Math.random().toString(36).slice(2, 10);
    try { sessionStorage.setItem('fuse-uid', uid); } catch (e) { /* ignore */ }
  }

  let mem = {};
  const load = () => {
    if (memoryOnly) return mem;
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  };
  let tree = load();
  const listeners = [];
  const parts = (p) => p.split('/').filter(Boolean);
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

  function getAt(path) {
    let n = tree;
    for (const k of parts(path)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
    return n === undefined ? null : n;
  }
  function setAt(path, val) {
    const ks = parts(path);
    if (!ks.length) { tree = val || {}; return; }
    let n = tree;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof n[ks[i]] !== 'object' || n[ks[i]] === null) n[ks[i]] = {};
      n = n[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (val === null || val === undefined) delete n[last]; else n[last] = clone(val);
  }
  function notify() {
    for (const l of listeners) {
      const v = getAt(l.path);
      const s = JSON.stringify(v);
      if (s !== l.last) { l.last = s; l.cb(clone(v)); }
    }
  }
  function commit() {
    if (memoryOnly) mem = tree;
    else { try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch (e) { /* ignore */ } }
    if (bc) bc.postMessage('changed');
    queueMicrotask(notify);
  }
  if (bc) bc.onmessage = () => { tree = load(); notify(); };
  if (!memoryOnly) window.addEventListener('storage', (e) => { if (e.key === KEY) { tree = load(); notify(); } });

  // Several tabs read-modify-write the same localStorage key. Without a lock, simultaneous writes (voice signaling!)
  // overwrite each other. Web Locks makes each mutation atomic across tabs. Firebase has no such problem.
  const locked = (mutate) => {
    const run = () => { tree = load(); mutate(); commit(); };
    if (!memoryOnly && navigator.locks) return navigator.locks.request(KEY, run);
    return Promise.resolve().then(run);
  };

  const disconnect = [];
  if (!memoryOnly) window.addEventListener('pagehide', () => {
    tree = load();
    disconnect.forEach((d) => setAt(d.path, d.val));
    try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch (e) { /* ignore */ }
    if (bc) bc.postMessage('changed');
  });

  return {
    mode: memoryOnly ? 'local' : 'demo',
    uid,
    now: () => Date.now(),
    async get(path) { tree = load(); return clone(getAt(path)); },
    set: (path, val) => locked(() => { setAt(path, val); }),
    update: (path, obj) => locked(() => { for (const k in obj) setAt(path + '/' + k, obj[k]); }),
    push: (path, val) => {
      const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      return locked(() => { setAt(path + '/' + key, val); }).then(() => key);
    },
    remove: (path) => locked(() => { setAt(path, null); }),
    on(path, cb) {
      const l = { path, cb, last: undefined };
      listeners.push(l);
      queueMicrotask(() => { const v = getAt(path); l.last = JSON.stringify(v); cb(clone(v)); });
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    },
    onDisconnectSet(path, val) { disconnect.push({ path, val }); },
  };
}
