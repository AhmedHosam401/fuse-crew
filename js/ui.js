// ui.js — drawing helpers: avatars, bomb + manual renderers, gestures, sounds.
import { COLOR_HEX, SYMBOLS, CODE_COLORS } from './engine.js';
import { t, colorName, opText } from './i18n.js';

export const ROLE_COLOR = { mute: '#2dd4bf', blind: '#fb923c', deaf: '#a78bfa', none: '#fbbf24' };
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
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><circle cx="50" cy="54" r="34" fill="${c}"/><ellipse cx="38" cy="38" rx="9" ry="5" fill="#fff" opacity=".28" transform="rotate(-30 38 38)"/>${eyes}${mouth}${blind}${muffs}${fuse}</svg>`;
}

// ---------- deaf: the bomb ----------
export function bombHTML(mod) {
  if (mod.type === 'wires') {
    return `<div class="wires">${mod.data.wires.map((c, i) =>
      `<div class="wire ${c}" style="background:${COLOR_HEX[c]}"><span class="n">${i + 1}</span></div>`).join('')}</div>`;
  }
  if (mod.type === 'symbols') {
    return `<div class="syms">${mod.data.symbols.map((s, i) =>
      `<div class="symcard">${s}<small>${i + 1}</small></div>`).join('')}</div>`;
  }
  return `<div class="codecards">${mod.data.digits.map((d, i) => {
    const c = mod.data.colors[i];
    return `<div class="codecard" style="background:${COLOR_HEX[c]};color:${c === 'yellow' ? '#1a1400' : '#fff'}">${d}</div>`;
  }).join('')}</div>`;
}

// ---------- mute: the manual ----------
const sw = (c) => `<b><i class="sw" style="background:${COLOR_HEX[c]}"></i>${colorName(c)}</b>`;

export function manualHTML(manual, page) {
  if (page === 'wires') {
    return `<div class="mpage"><h3>${t('manualWires')}</h3>${[3, 4, 5].map((k) =>
      `<div class="rulebox"><b>${t('wiresCount', { n: k })}</b><br>${t('ruleWires', { a: sw(manual.wires[k].a), b: sw(manual.wires[k].b) })}</div>`).join('')}</div>`;
  }
  if (page === 'symbols') {
    return `<div class="mpage"><h3>${t('manualSymbols')}</h3><div class="rulebox">${t('ruleSymbols')}</div>
      <div class="rank">${manual.symbols.map((s, i) => `<span>${s}<small>${i + 1}</small></span>`).join('')}</div></div>`;
  }
  return `<div class="mpage"><h3>${t('manualCode')}</h3><div class="rulebox">${t('ruleCode')}</div>
    <div class="optable">${CODE_COLORS.map((c) => `<div>${sw(c)}<span>${opText(manual.code[c])}</span></div>`).join('')}</div></div>`;
}

// ---------- gestures ----------
export const SIGNALS = { yes: '✅', no: '❌', ask: '❓', stop: '✋', again: '🔁' };
export function gestureChip(g, isNew) {
  const [k, v] = g.split(':');
  const cls = `gchip${isNew ? ' new' : ''}`;
  if (k === 'c') return `<span class="${cls}" style="background:${COLOR_HEX[v]};color:${v === 'white' || v === 'yellow' ? '#111' : '#fff'}" title="${colorName(v)}"></span>`;
  if (k === 'x') return `<span class="${cls}">${SIGNALS[v] || '?'}</span>`;
  return `<span class="${cls}">${esc(v)}</span>`;
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
    <div class="pgrid">${grid}</div></div>`;
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
