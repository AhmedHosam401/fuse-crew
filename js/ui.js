// ui.js — drawing helpers: avatars, bomb + manual renderers, gestures, sounds.
import { COLOR_HEX, SYMBOLS } from './engine.js';
import { t, colorName } from './i18n.js';

// Role colors live in CSS variables so they can be tuned separately for the light and the dark theme.
export const ROLE_COLOR = { mute: 'var(--c-mute)', blind: 'var(--c-blind)', deaf: 'var(--c-deaf)', none: 'var(--c-none)' };

// ---------- icons (24x24 line icons, colored by the text color around them) ----------
const ICONS = {
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  slash: '<path d="M3 3l18 18"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
  pick: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19.5A2 2 0 0 1 6 18h13"/><path d="M9 7h6"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 4.2a4 4 0 0 1 0 7.6"/><path d="M22 21v-1a6 6 0 0 0-4-5.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  finger: '<path d="M12 11a2 2 0 0 0-2 2c0 3 .5 5.5 1.5 8"/><path d="M16 13c0 3-.5 5-1.5 7.5"/><path d="M8 14.5c0 1.2-.1 2.4-.4 3.5"/><path d="M5.5 9a7 7 0 0 1 13 3c0 1.3-.1 2.7-.4 4"/><path d="M3 13c0-1.5.2-3 .8-4.4"/><path d="M8 5.2A7 7 0 0 1 12 4"/>',
  lock2: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
// `off` draws a diagonal slash over the icon (a muted mic, silenced headphones, ...)
export function icon(name, { size = 22, off = false } = {}) {
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}${off ? ICONS.slash : ''}</svg>`;
}

// ---------- theme: light / dark ----------
const THEME_COLOR = { dark: '#14161f', light: '#f4f1ec' };
export const theme = {
  get() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; },
  apply(th) {
    document.documentElement.dataset.theme = th;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', THEME_COLOR[th]);
  },
  init() {
    let saved = null;
    try { saved = localStorage.getItem('fuse-theme'); } catch (e) { /* private mode */ }
    const sys = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    this.apply(saved === 'light' || saved === 'dark' ? saved : sys);
  },
  toggle() {
    const next = this.get() === 'dark' ? 'light' : 'dark';
    this.apply(next);
    try { localStorage.setItem('fuse-theme', next); } catch (e) { /* ignore */ }
    return next;
  },
};
export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Little round bomb-head characters. Blindfold = Blind, tape over mouth = Mute, earmuffs = Deaf.
export function avatar(role, size = 56) {
  const c = ROLE_COLOR[role] || ROLE_COLOR.none;
  const eyes = role === 'blind' ? '' :
    '<circle cx="38" cy="50" r="7" fill="#fff"/><circle cx="62" cy="50" r="7" fill="#fff"/><circle cx="39" cy="51" r="3.4" fill="#111827"/><circle cx="63" cy="51" r="3.4" fill="#111827"/>';
  const mouth = role === 'mute'
    ? '<rect x="33" y="64" width="34" height="14" rx="4" fill="#e5e7eb"/><path d="M40 67l20 8M60 67l-20 8" stroke="#6b7280" stroke-width="2.5" stroke-linecap="round"/>'
    : '<path d="M40 68q10 9 20 0" stroke="#111827" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
  const blind = role === 'blind'
    ? '<rect x="14" y="40" width="72" height="19" rx="7" fill="#1f2937"/><path d="M14 46l-8-4M14 54l-8 4" stroke="#1f2937" stroke-width="4" stroke-linecap="round"/>' : '';
  const muffs = role === 'deaf'
    ? '<path d="M18 52Q50 2 82 52" stroke="#374151" stroke-width="7" fill="none"/><rect x="8" y="42" width="16" height="26" rx="8" fill="#374151"/><rect x="76" y="42" width="16" height="26" rx="8" fill="#374151"/>' : '';
  const fuse = '<path d="M50 20q4-12 15-12" stroke="#a16207" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="66" cy="8" r="5" fill="#fde047"/><circle cx="66" cy="8" r="2.5" fill="#fb923c"/>';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><circle cx="50" cy="54" r="34" style="fill:${c}"/><ellipse cx="38" cy="38" rx="9" ry="5" fill="#fff" opacity=".28" transform="rotate(-30 38 38)"/>${eyes}${mouth}${blind}${muffs}${fuse}</svg>`;
}

// ---------- gestures ----------
export const SIGNALS = { yes: '✅', no: '❌', ask: '❓', stop: '✋', again: '🔁' };
export function gestureChip(g, isNew, key) {
  const [k, v] = g.split(':');
  const cls = `gchip${isNew ? ' new' : ''}${key ? ' del' : ''}`;
  let style = ''; let inner = '';
  if (k === 'c') { style = ` style="background:${COLOR_HEX[v]};color:${v === 'white' || v === 'yellow' ? '#111' : '#fff'}" title="${colorName(v)}"`; }
  else if (k === 'x') inner = SIGNALS[v] || '?';
  else inner = esc(v);
  // the Mute's own chips are buttons: a tap removes that signal (the others see a "signals changed" notice)
  if (key) return `<button class="${cls}"${style} data-act="gdel" data-k="${esc(key)}" aria-label="${t('gDelOne')}">${inner}<i class="gx" aria-hidden="true">×</i></button>`;
  return `<span class="${cls}"${style}>${inner}</span>`;
}

export function paletteHTML(tab) {
  const tabs = ['colors', 'numbers', 'symbols', 'signals'];
  let grid = '';
  if (tab === 'colors') {
    grid = Object.keys(COLOR_HEX).map((c) =>
      `<button class="pbtn" data-act="gest" data-g="c:${c}" style="background:${COLOR_HEX[c]};color:${c === 'white' || c === 'yellow' ? '#111' : '#fff'}"><small style="color:inherit">${colorName(c)}</small></button>`).join('');
  } else if (tab === 'numbers') {
    grid = '0123456789'.split('').map((n) => `<button class="pbtn" data-act="gest" data-g="n:${n}">${n}</button>`).join('');
  } else if (tab === 'symbols') {
    grid = SYMBOLS.map((s) => `<button class="pbtn" data-act="gest" data-g="s:${s}">${s}</button>`).join('');
  } else {
    grid = Object.entries(SIGNALS).map(([k, e]) =>
      `<button class="pbtn" data-act="gest" data-g="x:${k}">${e}<small>${t('sig_' + k)}</small></button>`).join('');
  }
  return `<div class="palette"><div class="ptabs">${tabs.map((k) =>
    `<button class="ptab${k === tab ? ' on' : ''}" data-act="ptab" data-v="${k}">${t('sig_' + k)}</button>`).join('')}</div>
    <div class="pgrid g-${tab}">${grid}</div></div>`;
}

// ---------- sounds ----------
let ac = null;
export const sfx = { enabled: (() => { try { return localStorage.getItem('fuse-sfx') !== '0'; } catch (e) { return true; } })() };
function tone(freq, dur = 0.08, type = 'square', vol = 0.05, when = 0) {
  if (!sfx.enabled) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(ac.destination);
    const t0 = ac.currentTime + when;
    o.start(t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.stop(t0 + dur);
  } catch (e) { /* audio blocked */ }
}
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } };
export const sound = {
  tick: () => tone(1100, 0.03, 'square', 0.025),
  blip: () => tone(760, 0.06, 'sine', 0.06),
  ok: () => { tone(660, 0.09, 'sine', 0.08); tone(990, 0.14, 'sine', 0.08, 0.09); },
  strike: () => { tone(130, 0.4, 'sawtooth', 0.1); buzz(220); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, i * 0.12)),
  boom: () => { tone(70, 0.9, 'sawtooth', 0.14); tone(45, 1.1, 'square', 0.1, 0.05); buzz([200, 80, 400]); },
};
export function toggleSfx() {
  sfx.enabled = !sfx.enabled;
  try { localStorage.setItem('fuse-sfx', sfx.enabled ? '1' : '0'); } catch (e) { /* ignore */ }
}
