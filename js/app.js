// app.js — state, networking flow, events. Rendering lives in screens.js.
import { createNet, createLocalNet, isFirebaseConfigured, hasLocalSave, clearLocalSave } from './net.js';
import * as E from './engine.js';
import { t, setLang, initLang, getLang } from './i18n.js';
import { sound, toggleSfx, $, paletteHTML, theme, fmt } from './ui.js';
import * as V from './screens.js';
import { lampLit, morseState, bookChapters } from './senses.js';
import { createVoice, voiceSupported } from './voice.js';

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const toastEl = document.getElementById('toast');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};
const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};

const S = {
  net: null, uid: null, local: false,
  code: null, room: null, unsub: null, leaving: false,
  screen: 'home', skel: '', regions: {},
  name: store.get('fuse-name') || '', codeIn: '', err: '',
  role: null, mpage: 'toc', flip: null, ptab: 'colors', gflag: 0, gnoteT: undefined, gnoteRoom: null,
  bombKey: '', bomb: null,
  prevRound: null, prevStrikes: 0, prevCur: 0, endSounded: false, shakeUntil: 0, lastSec: -1,
  installEvt: null, wakeLock: null,
  voice: null, vs: { supported: voiceSupported(), joined: false }, voiceAuto: false,
  dlg: null,
};

// ---------------------------------------------------------------- small utils
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.remove('hidden');
  clearTimeout(toast.h); toast.h = setTimeout(() => toastEl.classList.add('hidden'), 2200);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const sortedIds = (players) => Object.keys(players || {}).sort((a, b) => players[a].joinedAt - players[b].joinedAt);
const gameFrom = (g) => ({
  status: 'playing', strikes: 0, cur: 0, p: 0, ...g, e: String((g && g.e) ?? ''), x: String((g && g.x) ?? ''),
});
const listOf = (obj) => Object.values(obj || {}).sort((a, b) => a.t - b.t);
const keyedList = (obj) => Object.entries(obj || {}).map(([k, v]) => ({ ...v, k })).sort((a, b) => a.t - b.t);

// levels: the highest unlocked level is remembered on this device and travels with the room (the host writes it there)
const progress = () => Math.min(E.LEVEL_COUNT, Math.max(1, parseInt(store.get('fuse-progress'), 10) || 1));
const saveProgress = (n) => { if (n > progress()) store.set('fuse-progress', String(Math.min(E.LEVEL_COUNT, n))); };
const unlockedOf = (room) => Math.min(E.LEVEL_COUNT, Math.max(1, (room && room.unlocked) || 1));
const levelOf = (room) => Math.min(unlockedOf(room), Math.max(1, (room && room.level) || unlockedOf(room)));

// "I went offline / my voice is gone" writes the server performs when this page disconnects. They must be cancelled when
// I leave the room on purpose, or the server would re-create a ghost player in a room I already left.
const armed = new Set();
function armDisconnect(path, val) { S.net.onDisconnectSet(path, val); armed.add(path); }
function disarmDisconnect() {
  for (const p of armed) { try { S.net.onDisconnectCancel(p); } catch (e) { /* ignore */ } }
  armed.clear();
}

// the room I am in: remembered per tab (a refresh) and per browser (reopening the installed app)
function saveRoom(code) { session.set('fuse-room', code); store.set('fuse-room', code); }

// the bits of the screen a refresh should not reset (manual page, signal tab, which of my roles is open)
function saveUi() { session.set('fuse-ui', JSON.stringify({ mpage: S.mpage, ptab: S.ptab, role: S.role })); }
function loadUi() {
  try { const u = JSON.parse(session.get('fuse-ui')); if (u) { S.mpage = u.mpage || S.mpage; S.ptab = u.ptab || S.ptab; S.role = u.role || null; } } catch (e) { /* ignore */ }
}

function getBomb(round) {
  const key = `${round.seed}:${round.level}`;
  if (S.bombKey !== key) { S.bomb = E.buildBomb(round.seed, round.level); S.bombKey = key; }
  return S.bomb;
}
function cur() {
  const r = S.room && S.room.round;
  if (!r) return null;
  const now = S.net.now();
  return { r, bomb: getBomb(r), game: E.effectiveGame(gameFrom(r.game), now), now };
}

// ---------------------------------------------------------------- voice (mic + headphones)
const emptyVoice = () => ({ supported: voiceSupported(), joined: false });
function onVoice(st) {
  S.vs = { supported: true, ...st };
  if (S.screen === 'lobby') render(); else if (S.screen === 'play') renderPlay();
}
async function joinVoice() {
  if (!S.net || S.local || S.voice || !S.room || !voiceSupported()) return;
  S.vs = { supported: true, joined: false, connecting: true }; if (S.screen === 'lobby') render();
  try {
    S.voice = createVoice(S.net, S.code, S.uid, onVoice);
    await S.voice.join();                  // mic AND headphones start on; the game's rules lock them per role
    armDisconnect(`rooms/${S.code}/players/${S.uid}/voice`, false);
    await S.net.set(`rooms/${S.code}/players/${S.uid}/voice`, true);
    S.voice.sync(S.room.players);
  } catch (e) { console.error(e); S.voice = null; S.vs = emptyVoice(); toast(t('errNet')); render(); }
}
async function leaveVoice() {
  const v = S.voice; if (!v) return;
  S.voice = null; S.vs = emptyVoice();
  await v.leave();
  try { if (S.net && S.code && !S.leaving) await S.net.set(`rooms/${S.code}/players/${S.uid}/voice`, false); } catch (e) { /* room gone */ }
}
async function rejoinVoice() { await leaveVoice(); await joinVoice(); }   // e.g. the mic permission was refused the first time

function toggleMic() {
  const v = S.voice; if (!v) return;
  const st = v.status();
  if (!st.speak) return toast(`${t('micTitle')}: ${t('micLocked')}`);
  if (!st.micOk) return rejoinVoice();
  v.setUserMuted(!st.userMuted);
}
function toggleEar() {
  const v = S.voice; if (!v) return;
  const st = v.status();
  if (!st.hear) return toast(`${t('earTitle')}: ${t('earLocked')}`);
  v.setUserDeaf(!st.userDeaf);
}
const myRoles = () => (S.room && S.room.round ? E.ROLES.filter((x) => S.room.round.roles[x] === S.uid) : []);

// ---------------------------------------------------------------- rendering
// The Blind's screen is black (in both themes); every other screen follows the theme
function applySense() {
  const want = S.screen === 'play' && S.role === 'blind' ? 'blind' : '';
  const root = document.documentElement;
  document.body.classList.toggle('playing', S.screen === 'play');
  document.body.classList.toggle('mute', S.screen === 'play' && S.role === 'mute');   // the Mute's screen is locked to the display
  if ((root.dataset.sense || '') === want) return;
  if (want) root.dataset.sense = want; else delete root.dataset.sense;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', want ? '#000000' : (theme.get() === 'light' ? '#f4f1ec' : '#14161f'));
}

function render() {
  applySense();
  if (S.screen === 'boot') return renderBoot();
  if (S.screen === 'home') return renderHome();
  if (S.screen === 'lobby') return renderLobby();
  return renderPlay();
}

function renderBoot() {
  S.skel = 'boot';
  app.innerHTML = V.bootHTML();
}
function renderHome() {
  S.skel = 'home';
  app.innerHTML = V.homeHTML({
    name: S.name, code: S.codeIn, err: S.err, mode: isFirebaseConfigured() ? 'firebase' : 'demo',
    canInstall: !!S.installEvt && !isStandalone(), ios: isIOS() && !isStandalone(),
  });
}
function renderLobby() {
  S.skel = 'lobby';
  if (S.voice) S.voice.setRules({ speak: true, hear: true });     // between rounds everybody can talk and hear
  app.innerHTML = V.lobbyHTML(S.room, S.code, S.uid, S.local, S.vs);
}

function region(id, html, key) {
  const k = key === undefined ? html : key;
  if (S.regions[id] === k) return false;
  S.regions[id] = k;
  const el = document.getElementById('r-' + id);
  if (el) el.innerHTML = html;
  return true;
}

function renderPlay() {
  const c = cur();
  if (!c) return;
  if (S.skel !== 'play') { app.innerHTML = V.playSkeleton(); S.skel = 'play'; S.regions = {}; requestWake(); }
  const roles = myRoles();
  if (!roles.includes(S.role)) S.role = roles[0];
  const role = S.role;
  const players = S.room.players || {};
  const gestures = keyedList(S.room.gestures);
  const chat = listOf(S.room.chat);
  applySense();
  const countdown = c.now < c.game.startedAt ? Math.ceil((c.game.startedAt - c.now) / 1000) : 0;

  const shaking = Date.now() < S.shakeUntil;
  region('top', V.topHTML(c.game, c.r, c.bomb, c.now, shaking, role), `${c.r.id}|${c.game.strikes}|${c.game.cur}|${shaking}|${role}`);
  updateClock(c);
  region('role', V.roleHTML(roles, role));
  // the Mute's book is redrawn only when the page / the mistakes / the round change, so a page flip plays once
  region('main', V.mainHTML(role, c.bomb, c.game, S.mpage, S.flip), role === 'mute' ? `book|${c.r.id}|${S.mpage}|${Math.min(c.game.strikes, 2)}` : undefined);
  S.flip = null;
  const restricted = c.game.status === 'playing';
  if (S.voice) S.voice.setRules({ speak: !restricted || E.CAPS[role].speaks, hear: !restricted || E.CAPS[role].hears });
  region('voice', S.local ? '' : V.voiceBarHTML(S.vs, role, restricted));
  region('pal', role === 'mute' ? paletteHTML(S.ptab) : '');
  const flagged = role === 'deaf' && Date.now() < S.gflag;       // the Mute changed the signals a moment ago
  if (region('gest', role === 'mute' || role === 'deaf' ? V.gestHTML(role, gestures, { flagged }) : '') && role === 'mute') {
    const gs = document.getElementById('gstrip'); if (gs) gs.scrollLeft = gs.scrollWidth;      // the newest signal is always in view
  }
  // online with a working mic people TALK: the typed-message box is only for practice (one phone) or when the voice is not available
  const talking = !S.local && !!S.vs.joined && S.vs.micOk !== false;
  region('log', role === 'deaf' ? V.deafHTML() : talking || (role === 'mute' && !chat.length) ? '' : V.logHTML(chat, players));
  region('say', role === 'mute' ? V.muteHTML() : talking ? V.speakHTML() : V.sayHTML());
  // The 5-second "get ready" sheet is drawn ONCE per round (its key has no digits) and only the number is patched in place;
  // redrawing it every second restarted its fade-in and made the whole sheet blink.
  region('over', V.overHTML({ count: countdown, roles, game: c.game, isHost: S.room.host === S.uid, level: c.r.level, local: S.local }),
    countdown > 0 ? `deal|${c.r.id}|${roles.join(',')}` : undefined);
  const cd = document.getElementById('cd');
  if (cd && cd.textContent !== String(countdown)) cd.textContent = String(countdown);
  const box = document.getElementById('logbox');
  if (box) box.scrollTop = box.scrollHeight;
  fx(c);
}

// timer digits / bar are patched in place, so the pulse animation is not restarted every second
function updateClock(c) {
  const rem = Math.max(0, E.remainingMs(c.game, Math.max(c.now, c.game.startedAt)));
  const timer = document.getElementById('timer');
  if (!timer || timer.classList.contains('hide')) return;          // the Blind has no clock
  const txt = V.fmtTime(rem);
  if (timer.textContent !== txt) timer.textContent = txt;
  timer.classList.toggle('low', rem <= 15000 && c.game.status === 'playing');
  const bar = document.getElementById('barfill');
  if (bar) bar.style.width = `${Math.min(100, (rem / c.bomb.durationMs) * 100)}%`;
}

// sounds + shake for every player, driven by state changes
function fx(c) {
  const g = c.game;
  if (S.prevRound !== c.r.id) {
    Object.assign(S, { prevRound: c.r.id, prevStrikes: g.strikes, prevCur: g.cur, endSounded: false, lastSec: -1 });
    return;
  }
  if (g.status === 'playing') {
    if (g.strikes > S.prevStrikes) {
      sound.strike(); S.shakeUntil = Date.now() + 450;
      app.classList.remove('flash-red'); void app.offsetWidth; app.classList.add('flash-red');
    } else if (g.cur > S.prevCur) sound.ok();
  }
  S.prevStrikes = g.strikes; S.prevCur = g.cur;
  if (g.status !== 'playing' && !S.endSounded) {
    S.endSounded = true;
    if (g.status === 'won') {
      sound.win();
      const nxt = Math.min(E.LEVEL_COUNT, c.r.level + 1);
      if (!S.local) {                                   // practice never changes the progress
        saveProgress(nxt);
        // the host opens the next level for the whole room and pre-selects it for the level list
        if (S.room.host === S.uid && unlockedOf(S.room) < nxt) S.net.update(`rooms/${S.code}`, { unlocked: nxt, level: nxt });
      }
    } else sound.boom();
    releaseWake();
  }
  const rem = E.remainingMs(g, c.now);
  if (g.status === 'playing' && rem <= 10000 && rem > 0) {
    const sec = Math.ceil(rem / 1000);
    if (sec !== S.lastSec) { S.lastSec = sec; sound.tick(); }
  }
}

async function requestWake() {
  try { if ('wakeLock' in navigator && !S.wakeLock) S.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed */ }
}
function releaseWake() { try { S.wakeLock && S.wakeLock.release(); } catch (e) { /* ignore */ } S.wakeLock = null; }

// ---------------------------------------------------------------- dialogs + system back button
// A confirmation dialog that resolves true (ok) / false (cancel). The system back button closes it like "cancel".
function openDialog(d) {
  if (S.dlg) return Promise.resolve(false);
  return new Promise((resolve) => {
    S.dlg = { resolve };
    modal.innerHTML = V.dialogHTML(d);
    const first = modal.querySelector('.btn:not(.danger)'); if (first) first.focus();
  });
}
function closeDialog(result) {
  if (!S.dlg) return;
  const { resolve } = S.dlg;
  S.dlg = null; modal.innerHTML = '';
  resolve(result);
}

async function askExitApp() {
  if (await openDialog({ title: t('dlgExitTitle'), body: t('dlgExitBody'), ok: t('dlgExitOk'), cancel: t('dlgStay') })) exitApp();
}
// "leave the room / the game": warns that room, round and progress are lost
async function askLeave() {
  if (S.screen !== 'lobby' && S.screen !== 'play') return;
  const c = S.screen === 'play' ? cur() : null;
  const live = !!c && c.game.status === 'playing';
  const body = S.local ? t('dlgLeaveSolo') : t(live ? 'dlgLeavePlay' : 'dlgLeaveLobby', { code: S.code });
  if (await openDialog({ title: t('dlgLeaveTitle'), body, ok: t('dlgLeaveOk'), cancel: t('dlgStay') })) await leaveRoom();
}

// The page keeps two history entries — [base, app] — and always sits on "app". A back press lands on "base", we put
// "app" back at once and decide what the press means in the game: close a dialog, or ask before leaving the room/the app.
// So the system back button never leaves the game by itself, and a refresh keeps both entries.
const nav = { hasPrev: false, exiting: false };
function pushGuard() { history.pushState({ fuse: 'app' }, ''); }
function initNav() {
  const st = history.state;
  if (st && st.fuse === 'app') nav.hasPrev = history.length > 2;
  else { nav.hasPrev = history.length > 1; history.replaceState({ fuse: 'base' }, ''); pushGuard(); }
  window.addEventListener('popstate', () => {
    if (nav.exiting) return;
    if (!(history.state && history.state.fuse === 'app')) pushGuard();
    onBack();
  });
}
function onBack() {
  if (S.dlg) return closeDialog(false);
  if (modal.innerHTML.trim()) { modal.innerHTML = ''; return undefined; }    // the "how to play" sheet
  if (S.screen === 'boot') return undefined;
  if (S.screen === 'home') return askExitApp();
  return askLeave();
}
function exitApp() {
  nav.exiting = true;
  if (nav.hasPrev) {
    history.go(-2);                       // back to the page that opened the game
    setTimeout(() => { nav.exiting = false; }, 1500);
    return;
  }
  history.go(-1);                         // nothing before us: the next system back press closes the app by itself
  toast(t('exitAgain'));
  try { window.close(); } catch (e) { /* not allowed */ }
  setTimeout(() => { nav.exiting = false; if (!(history.state && history.state.fuse === 'app')) pushGuard(); }, 2500);
}

// ---------------------------------------------------------------- connection / rooms
async function connect() {
  if (S.net && !S.local) return;
  S.err = t('connecting'); setErr(S.err);
  try {
    S.net = await createNet(); S.uid = S.net.uid; S.local = false;
  } catch (e) {
    console.error(e); S.net = null; throw new Error('errNet');
  }
}
function setErr(msg) { S.err = msg || ''; const el = document.getElementById('err'); if (el) el.textContent = S.err; }
const fail = (key) => { setErr(t(key)); };

function readName() {
  const n = ($('#name') ? $('#name').value : S.name).trim().slice(0, 14);
  S.name = n; store.set('fuse-name', n);
  if (!n) { fail('errName'); return null; }
  return n;
}

async function enter(code) {
  S.code = code; S.leaving = false; S.room = null; S.regions = {};
  S.voiceAuto = !S.local && voiceSupported();       // mic + headphones open by default, no extra tap
  if (!S.local) saveRoom(code);
  armDisconnect(`rooms/${code}/players/${S.uid}/online`, false);
  S.unsub = S.net.on(`rooms/${code}`, onRoom);
}

// players without a name are leftovers (a late "disconnect" write for someone who already left): never show or count them
function cleanRoom(room) {
  if (!room) return room;
  const players = {};
  for (const [id, p] of Object.entries(room.players || {})) if (p && p.name) players[id] = p;
  return { ...room, players };
}

function onRoom(raw) {
  if (S.leaving) return;
  const room = cleanRoom(raw);
  if (!room || !(room.players && room.players[S.uid])) {
    toast(t('roomClosed')); resetToHome(); return;
  }
  S.room = room;
  syncLevels(room);
  watchSignals(room);
  if (S.voice) S.voice.sync(room.players);
  if (room.players[S.uid].online === false) S.net.set(`rooms/${S.code}/players/${S.uid}/online`, true);
  // a reload (or a late "disconnect" from the old page) can clear our voice flag: put it back, others look at it
  if (S.voice && S.vs.joined && room.players[S.uid].voice !== true) S.net.set(`rooms/${S.code}/players/${S.uid}/voice`, true);
  if (S.voiceAuto && !S.voice && !S.vs.connecting) { S.voiceAuto = false; joinVoice(); }
  S.screen = room.phase === 'play' && room.round ? 'play' : 'lobby';
  render();
}

// level progress: every device remembers the highest unlocked level; an old room without one gets it from its host
function syncLevels(room) {
  if (S.local) return;                                       // practice: all levels open, progress untouched
  if (room.unlocked) saveProgress(room.unlocked);
  else if (room.host === S.uid) S.net.set(`rooms/${S.code}/unlocked`, progress());
}
// The Mute removed a signal: the others get a notice (the signals box is highlighted for a few seconds)
function watchSignals(room) {
  const gn = room.gnote && room.gnote.t ? room.gnote.t : 0;
  if (S.gnoteRoom !== S.code || S.gnoteT === undefined) { S.gnoteRoom = S.code; S.gnoteT = gn; return; }   // first look at this room: no alert
  if (!gn) { S.gnoteT = 0; return; }
  if (gn === S.gnoteT) return;
  S.gnoteT = gn;
  if (room.gnote.by === S.uid && !S.local) return;                   // I did it myself
  S.gflag = Date.now() + 7000;
  sound.tick(); try { navigator.vibrate && navigator.vibrate([40, 60, 40]); } catch (e) { /* ignore */ }
  if (S.role !== 'mute') toast(t('gChangedToast'));
}

function resetToHome() {
  if (S.unsub) S.unsub();
  if (S.net && !S.local) disarmDisconnect();
  if (S.voice) { S.voice.leave(); S.voice = null; }
  S.vs = emptyVoice(); S.voiceAuto = false;
  releaseWake();
  if (S.local) clearLocalSave();
  Object.assign(S, { unsub: null, code: null, room: null, screen: 'home', skel: '', regions: {}, prevRound: null, gnoteT: undefined, gnoteRoom: null, gflag: 0 });
  if (S.local) { S.net = null; S.local = false; }
  saveRoom(null);
  render();
}

async function createRoom() {
  const name = readName(); if (!name) return;
  try {
    await connect();
    for (let i = 0; i < 6; i++) {
      const code = E.randomCode();
      if (await S.net.get('rooms/' + code)) continue;
      await S.net.set('rooms/' + code, {
        host: S.uid, phase: 'lobby', roundNo: 0, createdAt: S.net.now(), roleMode: 'random', unlocked: progress(), level: progress(),
        players: { [S.uid]: { name, joinedAt: S.net.now(), online: true } },
      });
      return enter(code);
    }
    fail('errNet');
  } catch (e) { fail('errNet'); }
}

async function joinRoom() {
  const name = readName(); if (!name) return;
  const code = ($('#code').value || '').trim().toUpperCase();
  S.codeIn = code;
  if (!/^[A-Z]{4}$/.test(code)) return fail('errCode');
  try {
    await connect();
    const room = await S.net.get('rooms/' + code);
    if (!room) return fail('errNotFound');
    const players = cleanRoom(room).players;
    if (!players[S.uid]) {
      if (Object.keys(players).length >= 3) return fail('errFull');
      if (room.phase === 'play') return fail('errStarted');
      await S.net.set(`rooms/${code}/players/${S.uid}`, { name, joinedAt: S.net.now(), online: true });
    }
    enter(code);
  } catch (e) { fail('errNet'); }
}

async function startLocal() {
  const name = ($('#name') && $('#name').value.trim().slice(0, 14)) || S.name || (getLang() === 'ar' ? 'أنا' : 'Me');
  S.net = createLocalNet({ restore: false }); S.uid = S.net.uid; S.local = true;
  // practice is free: every level is open, in any order, and nothing here touches the saved progress
  await S.net.set('rooms/SOLO', { host: S.uid, phase: 'lobby', roundNo: 0, createdAt: Date.now(), unlocked: E.LEVEL_COUNT, level: 1, players: { [S.uid]: { name, joinedAt: Date.now(), online: true } } });
  await enter('SOLO');                    // the practice lobby: pick a level, then start
}

async function leaveRoom() {
  const { net, code, room, uid } = S;
  S.leaving = true;
  if (S.unsub) S.unsub();
  if (S.net && !S.local) disarmDisconnect();
  if (S.voice) { await S.voice.leave(); S.voice = null; }
  try {
    if (!S.local && net && code && room) {
      const others = sortedIds(room.players).filter((id) => id !== uid);
      if (!others.length) await net.remove('rooms/' + code);
      else {
        const drop = {};
        for (const r of E.ROLES) if (room.picks && room.picks[r] === uid) drop[r] = null;
        if (Object.keys(drop).length) await net.update(`rooms/${code}/picks`, drop);
        await net.remove(`rooms/${code}/players/${uid}`);
        if (room.host === uid) await net.set(`rooms/${code}/host`, others[0]);
      }
    }
  } catch (e) { /* best effort */ }
  S.leaving = false;
  resetToHome();
}

// ---------------------------------------------------------------- role choice (lobby)
function setLevel(n) {
  const room = S.room;
  if (!room || room.host !== S.uid || room.phase === 'play') return;
  if (n < 1 || n > unlockedOf(room)) return;
  S.net.set(`rooms/${S.code}/level`, n);
}
function setRoleMode(mode) {
  if (!S.room || S.room.host !== S.uid || S.room.phase === 'play') return;
  S.net.set(`rooms/${S.code}/roleMode`, mode === 'pick' ? 'pick' : 'random');
}
// Picks are stored per role ({ role: uid }): when two players grab the same role at once the last write wins and
// everybody sees the same result.
function pickRole(role) {
  const room = S.room;
  if (!room || room.phase === 'play' || room.roleMode !== 'pick') return;
  const picked = V.pickedMap(room);
  const holder = picked[role];
  if (holder === S.uid) { S.net.update(`rooms/${S.code}/picks`, { [role]: null }); return; }   // tap again = give it back
  if (holder) { toast(t('pickTaken')); return; }
  const upd = { [role]: S.uid };
  for (const r of E.ROLES) if (picked[r] === S.uid) upd[r] = null;                              // one chosen role per player
  S.net.update(`rooms/${S.code}/picks`, upd);
}

// ---------------------------------------------------------------- rounds (host only)
async function startRound(level) {
  const room = S.room;
  if (!room || room.host !== S.uid) return;
  const ids = sortedIds(room.players).slice(0, 3);
  const pick = room.roleMode === 'pick' && !S.local;
  if (pick && !E.everyonePicked(ids, V.pickedMap(room))) return;
  const seed = ((Math.random() * 2147483646) >>> 0) + 1;
  const rn = (room.roundNo || 0) + 1;
  level = Math.max(1, Math.min(E.LEVEL_COUNT, level));
  const bomb = E.buildBomb(seed, level);
  const startedAt = S.net.now() + 5000;
  const roles = pick
    ? E.pickRoles(ids, V.pickedMap(room), room.host)
    : E.randomRoles(ids, E.mulberry32((seed ^ 0xa5a5a5a5) >>> 0), room.round && room.round.roles);
  level = Math.max(1, Math.min(E.LEVEL_COUNT, level));
  await S.net.update('rooms/' + S.code, {
    phase: 'play', roundNo: rn, gestures: null, chat: null, gnote: null,
    level, unlocked: Math.max(unlockedOf(room), level),
    round: { id: rn, seed, level, roles, startedAt, game: E.freshGame(bomb, startedAt) },
  });
}
function nextRound() {
  const c = cur(); if (!c) return;
  startRound(c.game.status === 'won' ? c.r.level + 1 : c.r.level);
}
function backToRoom() {
  if (!S.room || S.room.host !== S.uid) return;
  S.net.update('rooms/' + S.code, { phase: 'lobby' });
}

// ---------------------------------------------------------------- in-game actions
function doAction(action) {
  const c = cur();
  if (!c || S.role !== 'blind' || !myRoles().includes('blind')) return;
  const { game, result } = E.applyAction(c.bomb, c.game, { ...action, mod: c.game.cur }, c.now);
  if (result === 'ignored' || result === 'lost' && game.reason === 'time') { render(); return; }
  sound.blip();
  S.room.round.game = game;           // optimistic: next tap already sees the new state
  S.net.set(`rooms/${S.code}/round/game`, game);
  render();
}
function sendGesture(g) {
  if (S.role !== 'mute' || !myRoles().includes('mute')) return;
  sound.blip();
  S.net.push(`rooms/${S.code}/gestures`, { from: S.uid, g, t: S.net.now() });
}
// The Mute can take back a signal sent by mistake; a "gnote" tells the others that the signals changed
const iAmMute = () => S.role === 'mute' && myRoles().includes('mute');
function signalsChanged() {
  const n = (S.room.gnote && S.room.gnote.n) || 0;
  S.net.set(`rooms/${S.code}/gnote`, { t: S.net.now(), by: S.uid, n: n + 1 });
}
function delGesture(k) {
  if (!iAmMute() || !k || !(S.room.gestures && S.room.gestures[k])) return;
  sound.blip();
  S.net.remove(`rooms/${S.code}/gestures/${k}`);
  signalsChanged();
}
function undoGesture() {
  const list = keyedList(S.room.gestures);
  if (list.length) delGesture(list[list.length - 1].k);
}
function clearGestures() {
  if (!iAmMute() || !S.room.gestures) return;
  sound.blip();
  S.net.remove(`rooms/${S.code}/gestures`);
  signalsChanged();
}
function sendSay() {
  const input = document.getElementById('say');
  const text = input && input.value.trim();
  if (!text) return;
  input.value = '';
  S.net.push(`rooms/${S.code}/chat`, { from: S.uid, role: S.role, text, t: S.net.now() });
  if (S.role === 'deaf') toast(t('sent'));
}

// ---------------------------------------------------------------- events
document.addEventListener('click', (e) => {
  // keyboard (Enter / Space) on the Blind's controls; real touches are handled by the pointer code below
  const tk = e.target.closest('[data-tact]');
  if (tk) { if (e.detail === 0) tactAction(tk, 120); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.classList.contains('overlay') && e.target.closest('[data-stop]')) return;
  const d = el.dataset;
  switch (d.act) {
    case 'lang': setLang(getLang() === 'ar' ? 'en' : 'ar'); S.skel = ''; S.regions = {}; render(); break;
    case 'sfx': toggleSfx(); S.skel = ''; S.regions = {}; render(); break;
    case 'theme': theme.toggle(); S.skel = ''; S.regions = {}; render(); break;
    case 'create': createRoom(); break;
    case 'join': joinRoom(); break;
    case 'local': startLocal(); break;
    case 'how': modal.innerHTML = V.howHTML(); break;
    case 'closemodal': modal.innerHTML = ''; break;
    case 'dlg-ok': closeDialog(true); break;
    case 'dlg-cancel': closeDialog(false); break;
    case 'skipboot': skipBoot(); break;
    case 'install': if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; render(); } break;
    case 'copy': {
      const text = `${t('appName')} — ${t('roomCode')}: ${S.code}\n${location.href.split('#')[0].split('?')[0]}`;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(t('copied')), () => toast(S.code));
      break;
    }
    case 'leave': askLeave(); break;
    case 'voicejoin': joinVoice(); break;
    case 'micmute': toggleMic(); break;
    case 'earmute': toggleEar(); break;
    case 'audioplay': if (S.voice) S.voice.resumeAudio(); break;
    case 'rolemode': setRoleMode(d.v); break;
    case 'pick': pickRole(d.v); break;
    case 'start': startRound(levelOf(S.room)); break;
    case 'level': setLevel(+d.v); break;
    case 'next': nextRound(); break;
    case 'toroom': backToRoom(); break;
    case 'role': S.role = d.v; S.regions = {}; S.flip = null; saveUi(); render(); break;
    case 'mflip': {
      const c = cur(); if (!c || !d.v) break;
      const order = bookChapters(c.bomb);
      S.flip = order.indexOf(d.v) >= order.indexOf(S.mpage) ? 'next' : 'prev';
      S.mpage = d.v; saveUi(); render(); break;
    }
    case 'gdel': delGesture(d.k); break;
    case 'gundo': undoGesture(); break;
    case 'gclear': clearGestures(); break;
    case 'gseen': S.gflag = 0; render(); break;
    case 'ptab': S.ptab = d.v; saveUi(); render(); break;
    case 'gest': sendGesture(d.g); break;
    case 'say': sendSay(); break;
    default: break;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'name') S.name = e.target.value;
  if (e.target.id === 'code') { e.target.value = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase(); S.codeIn = e.target.value; }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (S.dlg) closeDialog(false); else if (modal.innerHTML.trim()) modal.innerHTML = ''; return; }
  if (e.key !== 'Enter') return;
  if (e.target.id === 'say') sendSay();
  else if (e.target.id === 'code') joinRoom();
  else if (e.target.id === 'name') createRoom();
});
// after a reload the browser may refuse to start remote audio until the page is touched: the first touch does it
document.addEventListener('pointerdown', () => { if (S.voice && S.vs.blocked) S.voice.resumeAudio(); }, true);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (S.screen === 'home') render(); });
window.addEventListener('appinstalled', () => { S.installEvt = null; if (S.screen === 'home') render(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.screen === 'play') requestWake(); });

// ---------------------------------------------------------------- the Blind's touch screen
// A short tap does the thing. Holding a finger on an element for a moment does NOT do it: it shows the number the braille
// stands for (so you can check what you are touching). The big button is different: it reports how long it was held.
const LONG_PRESS = 450;
const tactState = { el: null, id: null, t0: 0, timer: 0, revealed: false };
let revealEl = null;
function showReveal(txt, wide) {
  if (!revealEl) { revealEl = document.createElement('div'); revealEl.className = 'reveal'; revealEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(revealEl); }
  revealEl.textContent = txt; revealEl.classList.toggle('time', !!wide); revealEl.classList.add('on');
}
function tactAction(el, held) {
  const d = el.dataset;
  switch (d.tact) {
    case 'cut': doAction({ type: 'cut', i: +d.i }); break;
    case 'pad': doAction({ type: 'pad', i: +d.i }); break;
    case 'lamp': doAction({ type: 'lamp', i: +d.i }); break;
    case 'key': doAction({ type: 'key', d: +d.d }); break;
    case 'btn': doAction({ type: 'btn', held }); break;
    default: break;
  }
}
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } };
function tactEnd(fire) {
  const { el, t0, revealed } = tactState;
  clearTimeout(tactState.timer);
  if (revealEl) revealEl.classList.remove('on');
  if (el) el.classList.remove('down', 'held');
  Object.assign(tactState, { el: null, id: null, revealed: false });
  if (fire && el && !revealed) tactAction(el, Date.now() - t0);
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-tact]');
  if (!el || e.button > 0) return;
  tactEnd(false);
  Object.assign(tactState, { el, id: e.pointerId, t0: Date.now(), revealed: false });
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (el.dataset.tact === 'btn') {
    el.classList.add('down');
    tactState.timer = setTimeout(() => { el.classList.add('held'); buzz(35); }, E.HOLD_MS);   // you feel the moment it counts as a "hold"
  } else if (el.dataset.reveal) {
    tactState.timer = setTimeout(() => { tactState.revealed = true; showReveal(el.dataset.reveal); buzz(20); }, LONG_PRESS);
  }
}, true);
document.addEventListener('pointerup', (e) => { if (tactState.el && e.pointerId === tactState.id) tactEnd(true); }, true);
document.addEventListener('pointercancel', (e) => { if (tactState.el && e.pointerId === tactState.id) tactEnd(false); }, true);
document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-tact], [data-clock]')) e.preventDefault(); });

// The Blind's clock is hidden. Holding a finger on it shows the time for as long as it is held (and a moment after).
const clockHold = { id: null, start: 0, iv: 0, off: 0, shown: false };
function clockText() {
  const c = cur();
  return c ? fmt(Math.max(0, E.remainingMs(c.game, Math.max(c.now, c.game.startedAt)))) : '--:--';
}
function clockStop() {
  clearTimeout(clockHold.start); clearInterval(clockHold.iv); clockHold.id = null;
  if (clockHold.shown) { clearTimeout(clockHold.off); clockHold.off = setTimeout(() => { if (revealEl && !tactState.el) revealEl.classList.remove('on'); clockHold.shown = false; }, 1500); }
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-clock]');
  if (!el || e.button > 0 || S.role !== 'blind') return;
  clearTimeout(clockHold.off); clockStop();
  clockHold.id = e.pointerId;
  clockHold.start = setTimeout(() => {
    clockHold.shown = true; buzz(20); showReveal(clockText(), true);
    clockHold.iv = setInterval(() => showReveal(clockText(), true), 200);
  }, LONG_PRESS);
}, true);
document.addEventListener('pointerup', (e) => { if (clockHold.id === e.pointerId) clockStop(); }, true);
document.addEventListener('pointercancel', (e) => { if (clockHold.id === e.pointerId) clockStop(); }, true);

// the Deaf's flashing lamps and morse lamp: drawn from the clock, so they loop on their own
setInterval(() => {
  if (S.screen !== 'play') return;
  const now = Date.now();
  const lamps = document.querySelector('[data-lamps]');
  if (lamps) {
    const lit = lampLit(lamps.dataset.lamps.split(',').map(Number), now);
    lamps.querySelectorAll('.lamp').forEach((l) => l.classList.toggle('lit', +l.dataset.n === lit));
  }
  const mo = document.querySelector('[data-morse]');
  if (mo) {
    const st = morseState(mo.dataset.morse.split('|').map((g) => g.split('').map(Number)), now);
    mo.querySelector('.mlamp').classList.toggle('lit', st.on);
    mo.querySelectorAll('.mgroups span').forEach((sp) => sp.classList.toggle('on', +sp.dataset.g === st.group));
  }
}, 50);

// clock: countdown, timer, timeout — re-render is cheap because regions are diffed
setInterval(() => { if (S.screen === 'play' && S.room) renderPlay(); }, 250);

// ---------------------------------------------------------------- boot (a refresh brings you back to exactly where you were)
function skipBoot() {
  if (S.screen === 'boot') { setErr(''); resetToHome(); }
}

async function restoreOnline(code) {
  S.screen = 'boot'; render();
  let netFailed = false;
  for (let i = 0; i < 5 && S.screen === 'boot'; i++) {
    try {
      await connect();
      const room = await S.net.get('rooms/' + code);
      if (S.screen !== 'boot') return;                 // the user skipped
      if (room && room.players && room.players[S.uid]) { await enter(code); return; }
      netFailed = false; break;                        // the room is gone, or we are no longer in it
    } catch (e) { netFailed = true; await sleep(1200); }
  }
  if (S.screen !== 'boot') return;
  if (!netFailed) saveRoom(null);        // keep it when it was only the network: the next reload tries again
  S.screen = 'home'; setErr(''); render();
  toast(t(netFailed ? 'errNet' : 'roomClosed'));
}

async function boot() {
  initLang();
  theme.init();
  initNav();
  loadUi();
  if (hasLocalSave()) {                                // one-phone practice survives a refresh
    S.net = createLocalNet({ restore: true }); S.uid = S.net.uid; S.local = true;
    S.screen = 'boot'; render();
    await enter('SOLO');
    return;
  }
  const saved = session.get('fuse-room') || store.get('fuse-room');
  if (saved) { await restoreOnline(saved); return; }
  render();
}
if (location.search.includes('debug')) window.__fuse = { S, E, cur, voice: () => S.voice, onBack, nav };
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
