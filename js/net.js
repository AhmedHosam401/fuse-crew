// net.js — one tiny database API with two backends:
//   • Firebase Realtime Database (real online play) when firebase-config.js is filled in
//   • a "demo" backend (localStorage + BroadcastChannel) so you can test with several tabs, no setup
//
// API: init() → { mode, uid, now(), get(path), set(path,val), update(path,obj), push(path,val),
//                 remove(path), on(path,cb) → unsubscribe, onDisconnectSet(path,val), onDisconnectCancel(path),
//                 account() → {uid,key} | null, signUp(name,code), signIn(name,code), signOut() }
// `uid` is a getter: it changes when the player signs in or out of an account.
import { FIREBASE_CONFIG } from '../firebase-config.js';
import { emailFor, nameKey, keyFromEmail, validCode, authError } from './account.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';

export function isFirebaseConfigured() {
  return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL
    && !String(FIREBASE_CONFIG.apiKey).startsWith('YOUR'));
}

// Online play: Firebase when configured, otherwise the multi-tab demo backend.
export async function createNet() {
  return isFirebaseConfigured() ? createFirebaseNet() : createDemoNet(false);
}

// One-phone / offline play: in memory, no network. The tree is mirrored into sessionStorage so a page refresh
// does not lose the practice round (restore:true picks it up again, otherwise any old copy is dropped).
const SOLO_KEY = 'fuse-solo-db';
export function createLocalNet(opts = {}) { return createDemoNet(true, opts); }
export function hasLocalSave() {
  try { const v = JSON.parse(sessionStorage.getItem(SOLO_KEY)); return !!(v && v.rooms && v.rooms.SOLO); } catch (e) { return false; }
}
export function clearLocalSave() { try { sessionStorage.removeItem(SOLO_KEY); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- Firebase
async function createFirebaseNet() {
  const [{ initializeApp }, A, db] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-database.js'),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  await auth.authStateReady();                      // a saved sign-in (account or guest) is restored here
  if (!auth.currentUser) await A.signInAnonymously(auth);
  const account = () => { const u = auth.currentUser; return u && !u.isAnonymous && u.email ? { uid: u.uid, key: keyFromEmail(u.email) } : null; };
  const wrap = (fn) => fn().catch((e) => { throw authError(e && e.code); });
  const database = db.getDatabase(app);

  let offset = 0;
  db.onValue(db.ref(database, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  const r = (p) => (p ? db.ref(database, p) : db.ref(database));   // '' = the root (multi-path updates)

  return {
    mode: 'firebase',
    get uid() { return auth.currentUser.uid; },
    now: () => Date.now() + offset,
    account,
    async signUp(name, code) { if (!validCode(code)) throw authError('weak-password'); await wrap(() => A.createUserWithEmailAndPassword(auth, emailFor(name), code)); return account(); },
    async signIn(name, code) { await wrap(() => A.signInWithEmailAndPassword(auth, emailFor(name), code)); return account(); },
    async signOut() { await A.signOut(auth); await A.signInAnonymously(auth); },
    async get(path) { return (await db.get(r(path))).val(); },
    set: (path, val) => db.set(r(path), val),
    update: (path, obj) => db.update(r(path), obj),
    async push(path, val) { const ref = db.push(r(path)); await db.set(ref, val); return ref.key; },
    remove: (path) => db.remove(r(path)),
    on(path, cb) { return db.onValue(r(path), (s) => cb(s.val())); },
    onDisconnectSet(path, val) { db.onDisconnect(r(path)).set(val); },
    onDisconnectCancel(path) { db.onDisconnect(r(path)).cancel(); },
  };
}

// ---------------------------------------------------------------- Demo (same browser, many tabs)
function createDemoNet(memoryOnly, opts = {}) {
  const KEY = 'fuse-demo-db';
  const bc = !memoryOnly && 'BroadcastChannel' in window ? new BroadcastChannel('fuse-demo') : null;
  // Demo accounts live in this browser only (name key -> {uid, code}); a tab keeps its sign-in like Firebase keeps one per browser.
  const AUTH_KEY = 'fuse-demo-auth';
  const authDb = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; } catch (e) { return {}; } };
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  let acct = null; try { acct = memoryOnly ? null : JSON.parse(ss.get('fuse-demo-acct')); } catch (e) { acct = null; }
  let uid = acct ? acct.uid : ss.get('fuse-uid');
  if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); ss.set('fuse-uid', uid); }
  const setAcct = (a, id) => { acct = a; uid = id; ss.set('fuse-demo-acct', a ? JSON.stringify(a) : null); if (!a) ss.set('fuse-uid', id); };

  let mem = {};
  if (memoryOnly) {
    try { if (opts.restore) mem = JSON.parse(sessionStorage.getItem(SOLO_KEY)) || {}; else sessionStorage.removeItem(SOLO_KEY); } catch (e) { mem = {}; }
  }
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
    if (val === null || val === undefined) {
      delete n[last];
      // like Firebase, a node with no children does not exist: drop the emptied parents too
      for (let i = ks.length - 2; i >= 0; i--) {
        let p = tree; for (let j = 0; j < i; j++) p = p[ks[j]];
        if (p[ks[i]] && typeof p[ks[i]] === 'object' && !Object.keys(p[ks[i]]).length) delete p[ks[i]]; else break;
      }
    } else n[last] = clone(val);
  }
  function notify() {
    for (const l of listeners) {
      const v = getAt(l.path);
      const s = JSON.stringify(v);
      if (s !== l.last) { l.last = s; l.cb(clone(v)); }
    }
  }
  function commit() {
    if (memoryOnly) { mem = tree; try { sessionStorage.setItem(SOLO_KEY, JSON.stringify(tree)); } catch (e) { /* ignore */ } }
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
    get uid() { return uid; },
    now: () => Date.now(),
    account: () => (acct ? { ...acct } : null),
    async signUp(name, code) {
      if (!validCode(code)) throw authError('weak-password');
      const k = nameKey(name); const db2 = authDb();
      if (db2[k]) throw authError('email-already-in-use');
      const id = 'a' + Math.random().toString(36).slice(2, 10);
      db2[k] = { uid: id, code };
      localStorage.setItem(AUTH_KEY, JSON.stringify(db2));
      setAcct({ uid: id, key: k }, id); return { ...acct };
    },
    async signIn(name, code) {
      const k = nameKey(name); const rec = authDb()[k];
      if (!rec || rec.code !== code) throw authError('invalid-credential');
      setAcct({ uid: rec.uid, key: k }, rec.uid); return { ...acct };
    },
    async signOut() { setAcct(null, 'u' + Math.random().toString(36).slice(2, 10)); },
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
    onDisconnectSet(path, val) { this.onDisconnectCancel(path); disconnect.push({ path, val }); },
    onDisconnectCancel(path) { for (let i = disconnect.length - 1; i >= 0; i--) if (disconnect[i].path === path) disconnect.splice(i, 1); },
  };
}
