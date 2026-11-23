// senses.js — what each player's screen shows for the six puzzle types.
//   Deaf  = SEES the bomb: a real-looking device with clearly colored wires, lamps, a big button ...
//   Blind = SEES NOTHING: a black screen, only thin outlines to feel for; numbers are in braille; a long press reveals the digit.
//   Mute  = holds the MANUAL: a book with a contents page and one chapter per puzzle type, flipped page by page.
import { COLOR_HEX, CODE_COLORS, LAMP_COLORS, BTN_BODIES, BTN_STRIPS } from './engine.js';
import { t, colorName, opText } from './i18n.js';
import { esc, icon } from './ui.js';

const modName = (type) => t('mod_' + type);
const hex = (c) => COLOR_HEX[c];

// ---------------------------------------------------------------- braille (numbers)
// dots: 1 2 3 down the left column, 4 5 6 down the right column. A number is "number sign" + one cell per digit.
export const BR = { 1: [1], 2: [1, 2], 3: [1, 4], 4: [1, 4, 5], 5: [1, 5], 6: [1, 2, 4], 7: [1, 2, 4, 5], 8: [1, 2, 5], 9: [2, 4], 0: [2, 4, 5] };
const DOT = { 1: [4, 4], 2: [4, 11], 3: [4, 18], 4: [10, 4], 5: [10, 11], 6: [10, 18] };
const cell = (on) => `<svg class="brc" viewBox="0 0 14 22" width="14" height="22" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map((n) =>
  `<circle cx="${DOT[n][0]}" cy="${DOT[n][1]}" r="${on.includes(n) ? 2.2 : 0.9}" class="${on.includes(n) ? 'on' : ''}"/>`).join('')}</svg>`;
export const braille = (n) => `<span class="braille" aria-hidden="true">${cell([3, 4, 5, 6])}${String(n).split('').map((d) => cell(BR[d])).join('')}</span>`;

// ---------------------------------------------------------------- timing of the flashing lamps (pure: same input, same picture)
const LAMP_ON = 650; const LAMP_OFF = 280; const LAMP_PAUSE = 1900;
// which lamp (1-4) is lit at time `ms` while the sequence loops, 0 = none
export function lampLit(flashes, ms) {
  const step = LAMP_ON + LAMP_OFF; const cycle = flashes.length * step + LAMP_PAUSE;
  const ph = ((ms % cycle) + cycle) % cycle; const i = Math.floor(ph / step);
  return i < flashes.length && ph - i * step < LAMP_ON ? flashes[i] : 0;
}
const SHORT = 360; const LONG = 1080; const GAP = 360; const GROUP_GAP = 1500; const MORSE_PAUSE = 2600;
// { on, group } for the morse lamp at time `ms`; group = index of the group being shown (or -1 in the final pause)
export function morseState(groups, ms) {
  const segs = [];
  groups.forEach((g, gi) => {
    g.forEach((b, i) => { segs.push({ on: true, d: b ? LONG : SHORT, gi }); segs.push({ on: false, d: i === g.length - 1 ? (gi === groups.length - 1 ? MORSE_PAUSE : GROUP_GAP) : GAP, gi: i === g.length - 1 && gi === groups.length - 1 ? -1 : gi }); });
  });
  const cycle = segs.reduce((a, s) => a + s.d, 0); let ph = ((ms % cycle) + cycle) % cycle;
  for (const s of segs) { if (ph < s.d) return { on: s.on, group: s.gi }; ph -= s.d; }
  return { on: false, group: -1 };
}

// ---------------------------------------------------------------- DEAF: the bomb
const metal = '<linearGradient id="mt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8a90a6"/><stop offset="1" stop-color="#4b5167"/></linearGradient>';

function wiresArt(wires) {
  const n = wires.length; const H = 24 + n * 46;
  const body = wires.map((c, i) => {
    const y = 34 + i * 46; const w = i % 2 ? 15 : -15;
    const d = `M 40 ${y} C 105 ${y + w}, 195 ${y - w}, 260 ${y}`;
    const main = c === 'black' ? '#262c3f' : hex(c);
    const rim = c === 'black' ? `<path d="${d}" stroke="#7b84ad" stroke-width="13" fill="none" stroke-linecap="round"/>` : '';
    const light = c === 'black' ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.42)';
    return `<g>
      <path d="${d}" stroke="rgba(0,0,0,.55)" stroke-width="13" fill="none" stroke-linecap="round" transform="translate(0 4)"/>
      ${rim}<path d="${d}" stroke="${main}" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="${d}" stroke="${light}" stroke-width="2.6" fill="none" stroke-linecap="round" transform="translate(0 -2.4)"/>
      <g transform="translate(52 ${y - 11})"><rect width="22" height="22" rx="6" fill="#0b0d14" stroke="#aab0c8" stroke-width="1.2"/><text x="11" y="16.5" text-anchor="middle" font-size="14" font-weight="800" fill="#fff" font-family="inherit">${i + 1}</text></g>
    </g>`;
  }).join('');
  const post = (x, y) => `<g><rect x="${x}" y="${y - 17}" width="30" height="34" rx="7" fill="url(#mt)" stroke="#2a2f40" stroke-width="1.5"/><circle cx="${x + 15}" cy="${y}" r="6" fill="#2a2f40"/><path d="M${x + 11} ${y - 3}l8 6M${x + 19} ${y - 3}l-8 6" stroke="#8a90a6" stroke-width="1.6" stroke-linecap="round"/></g>`;
  const posts = wires.map((_, i) => post(10, 34 + i * 46) + post(260, 34 + i * 46)).join('');
  return `<svg class="wiresvg" viewBox="0 0 300 ${H}" role="img" aria-label="${t('mod_wires')}"><defs>${metal}</defs>${posts}${body}</svg>`;
}

function lampsArt(flashes) {
  const lamp = (n) => `<div class="lamp" data-n="${n}" style="--lc:${hex(LAMP_COLORS[n - 1])}"><i></i><b>${n}</b></div>`;
  return `<div class="lamps" data-lamps="${flashes.join(',')}">${[1, 2, 3, 4].map(lamp).join('')}</div><div class="hint">${t('lampsHint')}</div>`;
}

function buttonArt(body, strip) {
  return `<div class="btnpanel"><div class="bigbtn" style="--bc:${hex(body)}"><i></i></div>
    <div class="stripbox"><div class="strip" style="--sc:${hex(strip)}"></div></div></div>
    <div class="hint">${t('btnHintDeaf', { body: colorName(body), strip: colorName(strip) })}</div>`;
}

function morseArt(groups) {
  return `<div class="morse" data-morse="${groups.map((g) => g.join('')).join('|')}"><div class="mlamp"><i></i></div>
    <div class="mgroups">${groups.map((_, i) => `<span data-g="${i}">${i + 1}</span>`).join('')}</div></div><div class="hint">${t('morseHint')}</div>`;
}

const symbolsArt = (symbols) => `<div class="keycaps">${symbols.map((s, i) => `<div class="keycap"><span class="glyph">${s}</span><small>${i + 1}</small></div>`).join('')}</div>`;
const codeArt = (digits, colors) => `<div class="lcds">${digits.map((d, i) => `<div class="lcd" style="--lc:${hex(colors[i])}"><span class="bezel"></span><b>${d}</b><small>${colorName(colors[i])}</small></div>`).join('')}</div>`;

// ctx = { strikes, max, idx, total, fog }
export function bombHTML(mod, ctx) {
  const art = {
    wires: () => wiresArt(mod.data.wires),
    symbols: () => symbolsArt(mod.data.symbols),
    code: () => codeArt(mod.data.digits, mod.data.colors),
    lamps: () => lampsArt(mod.data.flashes),
    button: () => buttonArt(mod.data.body, mod.data.strip),
    morse: () => morseArt(mod.data.groups),
  }[mod.type]();
  const leds = Array.from({ length: ctx.max }, (_, i) => `<i class="led${i < ctx.strikes ? ' on' : ''}"></i>`).join('');
  return `<div class="bomb"><span class="screw s1"></span><span class="screw s2"></span>
    <div class="bomb-hd"><span class="leds" title="${t('strikesUsed')}">${leds}</span><span class="bomb-id">${ctx.idx}/${ctx.total}</span><i class="led blink"></i></div>
    <div class="plate${ctx.fog ? ' fog' : ''}">${art}</div><div class="hazard"></div></div>`;
}

// ---------------------------------------------------------------- BLIND: black screen, outlines, braille
const tact = (act, cls, attrs, reveal, inner, label) =>
  `<button class="tact ${cls}" data-tact="${act}" ${attrs} data-reveal="${reveal}" aria-label="${esc(label)}">${inner}</button>`;

export function controlsHTML(mod, game) {
  if (mod.type === 'wires') {
    const cut = game.x ? game.x.split(',').map(Number) : [];
    return `<div class="tw">${mod.data.wires.map((_, i) => tact('cut', `twire${cut.includes(i) ? ' cut' : ''}`, `data-i="${i}"`, i + 1, braille(i + 1), t('wire', { n: i + 1 }))).join('')}</div>`;
  }
  if (mod.type === 'symbols') {
    const done = mod.solution.slice(0, game.p);
    return `<div class="tgrid c4">${[0, 1, 2, 3].map((i) => tact('pad', `tsq${done.includes(i) ? ' done' : ''}`, `data-i="${i}"`, i + 1, braille(i + 1), String(i + 1))).join('')}</div>`;
  }
  if (mod.type === 'lamps') {
    return `<div class="tgrid c2">${[1, 2, 3, 4].map((n) => tact('lamp', 'tcirc', `data-i="${n}"`, n, braille(n), String(n))).join('')}</div>`;
  }
  if (mod.type === 'button') {
    return `<div class="tbigwrap">${tact('btn', 'tbig', '', '', '<span class="tring"></span>', t('mod_button'))}<div class="thint">${t('btnHintBlind')}</div></div>`;
  }
  // code and morse: type the digits on a keypad
  const n = mod.solution.length;
  const boxes = Array.from({ length: n }, (_, i) => `<b class="${i < game.e.length ? 'f' : ''}">${i < game.e.length ? '•' : ''}</b>`).join('');
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => tact('key', `tkey${d === 0 ? ' k0' : ''}`, `data-d="${d}"`, d, braille(d), String(d))).join('');
  return `<div class="tcode"><div class="thint">${t('codeNeeds', { n })}</div><div class="entered">${boxes}</div><div class="tgrid c3">${keys}</div></div>`;
}

// ---------------------------------------------------------------- MUTE: the manual as a book
const sw = (c) => `<b class="swb"><i class="sw" style="background:${hex(c)}"></i>${colorName(c)}</b>`;
const dots = (bits) => `<span class="mpat" dir="ltr">${bits.map((b) => `<i class="${b ? 'l' : 's'}"></i>`).join('')}</span>`;

function chapterHTML(k, bomb, strikes) {
  const man = bomb.manual;
  if (k === 'wires') {
    return `<p class="lead">${t('leadWires')}</p>${[3, 4, 5].map((n) =>
      `<div class="rule"><span class="rbadge">${n}</span><div><b>${t('wiresCount', { n })}</b><br>${t('ruleWires', { a: sw(man.wires[n].a), b: sw(man.wires[n].b) })}</div></div>`).join('')}`;
  }
  if (k === 'symbols') {
    return `<p class="lead">${t('ruleSymbols')}</p><div class="rank">${man.symbols.map((s, i) => `<span>${s}<small>${i + 1}</small></span>`).join('')}</div>`;
  }
  if (k === 'code') {
    return `<p class="lead">${t('ruleCode')}</p><div class="optable">${CODE_COLORS.map((c) => `<div>${sw(c)}<span>${opText(man.code[c])}</span></div>`).join('')}</div>`;
  }
  if (k === 'lamps') {
    const tables = [0, 1, 2].map((s) => `<div class="ltable" data-s="${s}"><div class="lt-h">${t(s === 2 ? 'lampsStrikes2' : 'lampsStrikes', { n: s })}<em>${t('tableNow')}</em></div>
      ${man.lamps[s].map((b, i) => `<div class="lt-r"><span class="lc" style="--lc:${hex(LAMP_COLORS[i])}">${i + 1}</span><span class="lt-w"></span><span class="lb">${b}</span></div>`).join('')}</div>`).join('');
    return `<p class="lead">${t('leadLamps')}</p><div class="legend"><span><i class="lc" style="--lc:#8a90a6">1</i>${t('legendLamp')}</span><span><i class="lb">1</i>${t('legendBtn')}</span></div><div class="ltables" data-strikes="${Math.min(strikes, 2)}">${tables}</div>`;
  }
  if (k === 'button') {
    const body = BTN_BODIES.map((c) => `<div>${sw(c)}<span class="tag ${man.button.act[c]}">${t(man.button.act[c] === 'tap' ? 'btnTap' : 'btnHold')}</span></div>`).join('');
    const strip = BTN_STRIPS.map((c) => `<div>${sw(c)}<span class="num">${man.button.hold[c]}</span></div>`).join('');
    return `<p class="lead">${t('leadButton')}</p><h4>${t('btnBodyHdr')}</h4><div class="optable">${body}</div>
      <h4>${t('btnStripHdr')}</h4><p class="lead small">${t('btnRelease')}</p><div class="optable">${strip}</div>`;
  }
  // morse
  const rows = man.morse.map((d, i) => `<div>${dots([i >> 2 & 1, i >> 1 & 1, i & 1])}<span class="num">${d}</span></div>`).join('');
  return `<p class="lead">${t('leadMorse')}</p><div class="optable morsetab">${rows}</div>`;
}

// ---------------------------------------------------------------- the manual cut into blocks (for the real, paged book of the 3D world)
// Each block is a piece of a page that is never split; keep = "stay on the same page as the block after me" (a heading).
const blk = (html, keep = false) => ({ html, keep });
const one = (inner) => `<div class="optable one">${inner}</div>`;
export function chapterBlocks(k, bomb) {
  const man = bomb.manual;
  const head = blk(`<div class="bk-head"><h3>${t('mod_' + k)}</h3></div>`, true);
  if (k === 'wires') {
    return [head, blk(`<p class="lead">${t('leadWires')}</p>`, true), ...[3, 4, 5].map((n) =>
      blk(`<div class="rule"><span class="rbadge">${n}</span><div><b>${t('wiresCount', { n })}</b><br>${t('ruleWires', { a: sw(man.wires[n].a), b: sw(man.wires[n].b) })}</div></div>`))];
  }
  if (k === 'symbols') {
    return [head, blk(`<p class="lead">${t('ruleSymbols')}</p>`, true), blk(`<div class="rank">${man.symbols.map((s, i) => `<span>${s}<small>${i + 1}</small></span>`).join('')}</div>`)];
  }
  if (k === 'code') {
    return [head, blk(`<p class="lead">${t('ruleCode')}</p>`, true), ...CODE_COLORS.map((c) => blk(one(`<div>${sw(c)}<span>${opText(man.code[c])}</span></div>`)))];
  }
  if (k === 'lamps') {
    return [head, blk(`<p class="lead">${t('leadLamps')}</p><div class="legend"><span><i class="lc" style="--lc:#8a90a6">1</i>${t('legendLamp')}</span><span><i class="lb">1</i>${t('legendBtn')}</span></div>`, true),
      ...[0, 1, 2].map((s) => blk(`<div class="ltable" data-s="${s}"><div class="lt-h">${t(s === 2 ? 'lampsStrikes2' : 'lampsStrikes', { n: s })}<em>${t('tableNow')}</em></div>
        <div class="lt-rows">${man.lamps[s].map((b, i) => `<div class="lt-r"><span class="lc" style="--lc:${hex(LAMP_COLORS[i])}">${i + 1}</span><span class="lt-w"></span><span class="lb">${b}</span></div>`).join('')}</div></div>`))];
  }
  if (k === 'button') {
    return [head, blk(`<p class="lead">${t('leadButton')}</p>`, true), blk(`<h4>${t('btnBodyHdr')}</h4>`, true),
      ...BTN_BODIES.map((c) => blk(one(`<div>${sw(c)}<span class="tag ${man.button.act[c]}">${t(man.button.act[c] === 'tap' ? 'btnTap' : 'btnHold')}</span></div>`))),
      blk(`<h4>${t('btnStripHdr')}</h4><p class="lead small">${t('btnRelease')}</p>`, true),
      ...BTN_STRIPS.map((c) => blk(one(`<div>${sw(c)}<span class="num">${man.button.hold[c]}</span></div>`)))];
  }
  return [head, blk(`<p class="lead">${t('leadMorse')}</p>`, true), ...man.morse.map((d, i) => blk(one(`<div>${dots([i >> 2 & 1, i >> 1 & 1, i & 1])}<span class="num">${d}</span></div>`)))];
}

export function bookHTML(bomb, game, page, flip) {
  const chapters = ['toc', ...bomb.types];
  const cur = chapters.includes(page) ? page : 'toc';
  const at = chapters.indexOf(cur);
  const title = cur === 'toc' ? t('bookToc') : t('mod_' + cur);
  const tabs = chapters.map((k) => `<button class="bk-tab${k === cur ? ' on' : ''}" data-act="mflip" data-v="${k}" ${k === cur ? 'aria-current="page"' : ''}>${k === 'toc' ? icon('book', { size: 18 }) : t('mod_' + k)}</button>`).join('');
  let body;
  if (cur === 'toc') {
    body = `<p class="lead">${t('bookTocHint')}</p><div class="toc">${bomb.types.map((k, i) =>
      `<button class="toc-r" data-act="mflip" data-v="${k}"><span class="toc-n">${i + 1}</span><span class="toc-t"><b>${t('mod_' + k)}</b><small>${t('tocWhen_' + k)}</small></span><span class="toc-p">${i + 2}</span></button>`).join('')}</div>`;
  } else body = chapterHTML(cur, bomb, game.strikes);
  const prev = chapters[at - 1]; const next = chapters[at + 1];
  return `<div class="book">
    <div class="bk-tabs" role="tablist">${tabs}</div>
    <div class="bk-page${flip ? ' flip-' + flip : ''}" data-chapter="${cur}">
      <div class="bk-head"><h3>${title}</h3><span class="bk-no">${at + 1}</span></div>${body}
    </div>
    <div class="bk-nav">
      <button class="btn small bk-prev" data-act="mflip" data-v="${prev || ''}" ${prev ? '' : 'disabled'}>${icon('back', { size: 18 })}<span>${t('bookPrev')}</span></button>
      <span class="bk-count">${t('bookPage', { a: at + 1, b: chapters.length })}</span>
      <button class="btn small bk-next" data-act="mflip" data-v="${next || ''}" ${next ? '' : 'disabled'}><span>${t('bookNext')}</span>${icon('back', { size: 18 })}</button>
    </div></div>`;
}
export const bookChapters = (bomb) => ['toc', ...bomb.types];
