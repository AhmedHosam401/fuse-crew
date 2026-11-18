// app.js — state, networking flow, events. Rendering lives in screens.js.
import { createNet, createLocalNet, isFirebaseConfigured } from './net.js';
import * as E from './engine.js';
import { t, setLang, initLang, getLang } from './i18n.js';
import { sound, toggleSfx, $, paletteHTML } from './ui.js';
import * as V from './screens.js';
import { createVoice, voiceSupported } from './voice.js';

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const toastEl = document.getElementById('toast');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

const S = {
  net: null, uid: null, local: false,
  code: null, room: null, unsub: null, leaving: false,
  screen: 'home', skel: '', regions: {},
  name: store.get('fuse-name') || '', codeIn: '', err: '',
  role: null, mpage: 'wires', ptab: 'colors',
  bombKey: '', bomb: null,
  prevRound: null, prevStrikes: 0, prevCur: 0, endSounded: false, shakeUntil: 0, lastSec: -1,
  installEvt: null, wakeLock: null,
  voice: null, vs: { supported: voiceSupported(), joined: false },
};

// ---------------------------------------------------------------- small utils
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.remove('hidden');
  clearTimeout(toast.h); toast.h = setTimeout(() => toastEl.classList.add('hidden'), 2200);
}
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const sortedIds = (players) => Object.keys(players || {}).sort((a, b) => players[a].joinedAt - players[b].joinedAt);
const gameFrom = (g) => ({
  status: 'playing', strikes: 0, cur: 0, p: 0, ...g, e: String((g && g.e) ?? ''), x: String((g && g.x) ?? ''),
});
const listOf = (obj) => Object.values(obj || {}).sort((a, b) => a.t - b.t);

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
const emptyVoice = () => ({ supported: voiceSupported(), joined: false });
function onVoice(st) {
  S.vs = { supported: true, ...st };
  if (S.screen === 'lobby') render(); else if (S.screen === 'play') renderPlay();
}
async function joinVoice() {
  if (!S.net || S.local || S.voice || !S.room) return;
  try {
    S.voice = createVoice(S.net, S.code, S.uid, onVoice);
    await S.voice.join();
    S.net.onDisconnectSet(`rooms/${S.code}/players/${S.uid}/voice`, false);
    await S.net.set(`rooms/${S.code}/players/${S.uid}/voice`, true);
    S.voice.sync(S.room.players);
  } catch (e) { console.error(e); S.voice = null; S.vs = emptyVoice(); toast(t('errNet')); render(); }
}
async function leaveVoice() {
  const v = S.voice; if (!v) return;
  S.voice = null; S.vs = emptyVoice();
  await v.leave();
  try { if (S.net && S.code && !S.leaving) await S.net.set(`rooms/${S.code}/players/${S.uid}/voice`, false); } catch (e) { /* room gone */ }
  render();
}
const myRoles = () => (S.room && S.room.round ? E.ROLES.filter((x) => S.room.round.roles[x] === S.uid) : []);

// ---------------------------------------------------------------- rendering
function render() {
  if (S.screen === 'home') return renderHome();
  if (S.screen === 'lobby') return renderLobby();
  return renderPlay();
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
  app.innerHTML = V.lobbyHTML(S.room, S.code, S.uid, S.local, S.vs);
}

function region(id, html, key) {
  const k = key === undefined ? html : key;
  if (S.regions[id] === k) return;
  S.regions[id] = k;
  const el = document.getElementById('r-' + id);
  if (el) el.innerHTML = html;
}

function renderPlay() {
  const c = cur();
  if (!c) return;
  if (S.skel !== 'play') { app.innerHTML = V.playSkeleton(); S.skel = 'play'; S.regions = {}; requestWake(); }
  const roles = myRoles();
  if (!roles.includes(S.role)) S.role = roles[0];
  const role = S.role;
  const players = S.room.players || {};
  const gestures = listOf(S.room.gestures);
  const chat = listOf(S.room.chat);
  const countdown = c.now < c.game.startedAt ? Math.ceil((c.game.startedAt - c.now) / 1000) : 0;

  const shaking = Date.now() < S.shakeUntil;
  region('top', V.topHTML(c.game, c.r, c.bomb, c.now, shaking), `${c.r.id}|${c.game.strikes}|${c.game.cur}|${shaking}`);
  updateClock(c);
  region('role', V.roleHTML(roles, role));
  region('main', V.mainHTML(role, c.bomb, c.game, S.mpage));
  const restricted = c.game.status === 'playing';
  if (S.voice) S.voice.setRules({ speak: !restricted || E.CAPS[role].speaks, hear: !restricted || E.CAPS[role].hears });
  region('voice', S.local ? '' : V.voiceBarHTML(S.vs, role, restricted));
  region('pal', role === 'mute' ? paletteHTML(S.ptab) : '');
  region('gest', role === 'mute' || role === 'deaf' ? V.gestHTML(role, gestures) : '');
  region('log', role === 'deaf' ? V.deafHTML() : V.logHTML(chat, players));
  region('say', role === 'mute' ? V.muteHTML() : V.sayHTML());
  region('over', V.overHTML({ count: countdown, roles, game: c.game, isHost: S.room.host === S.uid, level: c.r.level }));
  const box = document.getElementById('logbox');
  if (box) box.scrollTop = box.scrollHeight;
  fx(c);
}

// timer digits / bar are patched in place, so the pulse animation is not restarted every second
function updateClock(c) {
  const rem = Math.max(0, E.remainingMs(c.game, Math.max(c.now, c.game.startedAt)));
  const timer = document.getElementById('timer');
  if (!timer) return;
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
    if (g.status === 'won') sound.win(); else sound.boom();
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
  if (!S.local) store.set('fuse-room', code);
  S.net.onDisconnectSet(`rooms/${code}/players/${S.uid}/online`, false);
  S.unsub = S.net.on(`rooms/${code}`, onRoom);
}

function onRoom(room) {
  if (S.leaving) return;
  if (!room || !(room.players && room.players[S.uid])) {
    toast(t('roomClosed')); resetToHome(); return;
  }
  S.room = room;
  if (S.voice) S.voice.sync(room.players);
  if (room.players[S.uid].online === false) S.net.set(`rooms/${S.code}/players/${S.uid}/online`, true);
  S.screen = room.phase === 'play' && room.round ? 'play' : 'lobby';
  render();
}

function resetToHome() {
  if (S.unsub) S.unsub();
  if (S.voice) { S.voice.leave(); S.voice = null; }
  S.vs = emptyVoice();
  releaseWake();
  Object.assign(S, { unsub: null, code: null, room: null, screen: 'home', skel: '', regions: {}, prevRound: null });
  if (S.local) { S.net = null; S.local = false; }
  store.set('fuse-room', null);
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
        host: S.uid, phase: 'lobby', roundNo: 0, createdAt: S.net.now(),
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
    const players = room.players || {};
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
  S.net = createLocalNet(); S.uid = S.net.uid; S.local = true;
  await S.net.set('rooms/SOLO', { host: S.uid, phase: 'lobby', roundNo: 0, createdAt: Date.now(), players: { [S.uid]: { name, joinedAt: Date.now(), online: true } } });
  await enter('SOLO');
  startRound(1);
}

async function leaveRoom() {
  if (S.screen === 'play' && !S.local && !confirm(t('leaveConfirm'))) return;
  const { net, code, room, uid } = S;
  S.leaving = true;
  if (S.unsub) S.unsub();
  if (S.voice) { await S.voice.leave(); S.voice = null; }
  try {
    if (!S.local && net && code && room) {
      const others = sortedIds(room.players).filter((id) => id !== uid);
      if (!others.length) await net.remove('rooms/' + code);
      else {
        await net.remove(`rooms/${code}/players/${uid}`);
        if (room.host === uid) await net.set(`rooms/${code}/host`, others[0]);
      }
    }
  } catch (e) { /* best effort */ }
  S.leaving = false;
  resetToHome();
}

// ---------------------------------------------------------------- rounds (host only)
async function startRound(level) {
  const room = S.room;
  if (!room || room.host !== S.uid) return;
  const ids = sortedIds(room.players).slice(0, 3);
  const seed = ((Math.random() * 2147483646) >>> 0) + 1;
  const rn = (room.roundNo || 0) + 1;
  const bomb = E.buildBomb(seed, level);
  const startedAt = S.net.now() + 5000;
  await S.net.update('rooms/' + S.code, {
    phase: 'play', roundNo: rn, gestures: null, chat: null,
    round: { id: rn, seed, level, roles: E.rotateRoles(ids, rn), startedAt, game: E.freshGame(bomb, startedAt) },
  });
}
function nextRound() {
  const c = cur(); if (!c) return;
  startRound(c.game.status === 'won' ? c.r.level + 1 : c.r.level);
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
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.classList.contains('overlay') && e.target.closest('[data-stop]')) return;
  const d = el.dataset;
  switch (d.act) {
    case 'lang': setLang(getLang() === 'ar' ? 'en' : 'ar'); render(); break;
    case 'sfx': toggleSfx(); S.skel = ''; render(); break;
    case 'create': createRoom(); break;
    case 'join': joinRoom(); break;
    case 'local': startLocal(); break;
    case 'how': modal.innerHTML = V.howHTML(); break;
    case 'closemodal': modal.innerHTML = ''; break;
    case 'install': if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; render(); } break;
    case 'copy': {
      const text = `${t('appName')} — ${t('roomCode')}: ${S.code}\n${location.href.split('#')[0]}`;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(t('copied')), () => toast(S.code));
      break;
    }
    case 'leave': leaveRoom(); break;
    case 'voicejoin': joinVoice(); break;
    case 'voiceleave': leaveVoice(); break;
    case 'micmute': if (S.voice) S.voice.setUserMuted(!S.vs.userMuted); break;
    case 'audioplay': if (S.voice) S.voice.resumeAudio(); break;
    case 'start': startRound(1); break;
    case 'next': nextRound(); break;
    case 'role': S.role = d.v; S.regions = {}; render(); break;
    case 'mpage': S.mpage = d.v; render(); break;
    case 'ptab': S.ptab = d.v; render(); break;
    case 'gest': sendGesture(d.g); break;
    case 'say': sendSay(); break;
    case 'cut': doAction({ type: 'cut', i: +d.i }); break;
    case 'pad': doAction({ type: 'pad', i: +d.i }); break;
    case 'key': doAction({ type: 'key', d: +d.d }); break;
    default: break;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'name') S.name = e.target.value;
  if (e.target.id === 'code') { e.target.value = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase(); S.codeIn = e.target.value; }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'say') sendSay();
  else if (e.target.id === 'code') joinRoom();
  else if (e.target.id === 'name') createRoom();
});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (S.screen === 'home') render(); });
window.addEventListener('appinstalled', () => { S.installEvt = null; if (S.screen === 'home') render(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.screen === 'play') requestWake(); });

// clock: countdown, timer, timeout — re-render is cheap because regions are diffed
setInterval(() => { if (S.screen === 'play' && S.room) renderPlay(); }, 250);

// ---------------------------------------------------------------- boot
async function boot() {
  initLang();
  render();
  const saved = store.get('fuse-room');
  if (saved && S.name) {
    try {
      await connect();
      const room = await S.net.get('rooms/' + saved);
      if (room && room.players && room.players[S.uid]) { await enter(saved); return; }
    } catch (e) { /* stay on home */ }
    store.set('fuse-room', null); setErr('');
  }
}
if (location.search.includes('debug')) window.__fuse = { S, E, cur, voice: () => S.voice };
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
