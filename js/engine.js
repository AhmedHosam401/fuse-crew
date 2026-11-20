// engine.js — pure game logic (no DOM, no network). Same code runs on every player's device,
// so a shared `seed` is enough for everyone to rebuild the same bomb and the same manual.

export const COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'black'];
export const CODE_COLORS = ['red', 'blue', 'yellow', 'green'];
export const COLOR_HEX = {
  red: '#ef4444', blue: '#3b82f6', yellow: '#facc15',
  green: '#22c55e', white: '#f1f5f9', black: '#1e293b',
};
export const SYMBOLS = ['★', '◆', '●', '▲', '■', '♥', '✚', '☾'];

export const MAX_STRIKES = 3;
export const PENALTY_MS = 15000;
export const ROLES = ['mute', 'deaf', 'blind'];

// ---------- puzzle types and levels ----------
// The first three puzzles are the "warm-up" ones, the next three arrive one by one in levels 4, 5 and 6.
export const MODULE_TYPES = ['wires', 'symbols', 'code', 'lamps', 'button', 'morse'];
export const LAMP_COLORS = ['red', 'blue', 'yellow', 'green'];          // lamp 1..4
export const BTN_BODIES = ['red', 'blue', 'yellow', 'white'];
export const BTN_STRIPS = ['red', 'blue', 'yellow', 'green', 'white'];
export const HOLD_MS = 500;                                              // a press at least this long counts as "hold"
export const LEVEL_COUNT = 10;
const SECS = { wires: 45, symbols: 50, code: 60, lamps: 90, button: 60, morse: 80 };   // time budget per puzzle, seconds
// mods = the puzzles of the level; strikes = how many mistakes blow the bomb; timeX = time multiplier; fog = the bomb
// disappears from the Deaf's screen every few seconds; tag = what makes the level special (shown in the level list)
export const LEVELS = [
  null,
  { mods: ['wires'] },
  { mods: ['wires', 'symbols'] },
  { mods: ['wires', 'symbols', 'code'] },
  { mods: ['lamps'] },
  { mods: ['lamps', 'button'] },
  { mods: ['lamps', 'button', 'morse'] },
  { mods: MODULE_TYPES, timeX: 0.7, tag: 'race' },
  { mods: MODULE_TYPES, strikes: 2, timeX: 0.95, tag: 'sudden' },
  { mods: MODULE_TYPES, fog: true, tag: 'fog' },
  { mods: [...MODULE_TYPES, 'lamps', 'morse'], strikes: 2, fog: true, timeX: 0.85, tag: 'finale' },
];
export const levelDef = (level) => LEVELS[Math.max(1, Math.min(LEVEL_COUNT, (level | 0) || 1))];

// ---------- helpers ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

// ---------- manual (what the mute player reads) ----------
export function makeManual(seed) {
  const rnd = mulberry32((seed ^ 0x9e3779b1) >>> 0);
  const wires = {};
  for (const k of [3, 4, 5]) {
    const [a, b] = shuffle(COLORS, rnd);
    wires[k] = { a, b };
  }
  const symbols = shuffle(SYMBOLS, rnd); // index 0 = press first
  const pool = shuffle([
    { t: 'add', k: 1 }, { t: 'add', k: 3 }, { t: 'add', k: 5 }, { t: 'add', k: 7 },
    { t: 'mul', k: 3 }, { t: 'mul', k: 7 }, { t: 'sub9' }, { t: 'same' },
  ], rnd);
  const code = {};
  CODE_COLORS.forEach((c, i) => { code[c] = pool[i]; });
  // lamps[s][n-1] = the button to press when lamp n flashed and the bomb already has s mistakes (s = 0, 1, 2+)
  const lamps = [0, 1, 2].map(() => shuffle([1, 2, 3, 4], rnd));
  // button: the body color says tap or hold; for a hold, the strip color says which digit must be in the seconds
  const bodies = shuffle(BTN_BODIES, rnd);
  const act = {}; bodies.forEach((b, i) => { act[b] = i < 2 ? 'tap' : 'hold'; });
  const digits = shuffle([1, 2, 3, 4, 5], rnd);
  const hold = {}; BTN_STRIPS.forEach((c, i) => { hold[c] = digits[i]; });
  // morse[i] = the digit for the flash group whose short(0)/long(1) pattern read as a binary number is i
  const morse = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rnd).slice(0, 8);
  return { wires, symbols, code, lamps, button: { act, hold }, morse };
}

export const lampTarget = (manual, m, strikes, p) => manual.lamps[Math.min(strikes, 2)][m.data.flashes[p] - 1];
export const morseIndex = (bits) => bits.reduce((a, b) => a * 2 + b, 0);
// the seconds part of the timer as the players read it ("0:07" -> "07")
export function secondsText(game, now) {
  const s = Math.ceil(Math.max(0, remainingMs(game, now)) / 1000);
  return String(s % 60).padStart(2, '0');
}
export function buttonOk(m, held, game, now) {
  const long = held >= HOLD_MS;
  if (m.solution.mode === 'tap') return !long;
  return long && secondsText(game, now).includes(String(m.solution.digit));
}

export function applyOp(op, n) {
  switch (op.t) {
    case 'add': return (n + op.k) % 10;
    case 'mul': return (n * op.k) % 10;
    case 'sub9': return 9 - n;
    default: return n;
  }
}

// ---------- modules ----------
export function solveWires(manual, wires) {
  const rule = manual.wires[wires.length];
  const countA = wires.filter((c) => c === rule.a).length;
  if (countA >= 2) return wires.lastIndexOf(rule.a);
  const ib = wires.indexOf(rule.b);
  if (ib >= 0) return ib;
  return wires.length - 1;
}

export const moduleCount = (level) => levelDef(level).mods.length;
export function timeFor(level) {
  const def = levelDef(level);
  const secs = 40 + def.mods.reduce((a, m) => a + SECS[m], 0);
  return Math.round(secs * (def.timeX || 1)) * 1000;
}

function buildModule(type, manual, rnd) {
  if (type === 'wires') {
    const k = pick([3, 4, 5], rnd);
    const wires = Array.from({ length: k }, () => pick(COLORS, rnd));
    return { type, data: { wires }, solution: solveWires(manual, wires) };
  }
  if (type === 'symbols') {
    const symbols = shuffle(SYMBOLS, rnd).slice(0, 4);
    const order = [0, 1, 2, 3].sort((i, j) => manual.symbols.indexOf(symbols[i]) - manual.symbols.indexOf(symbols[j]));
    return { type, data: { symbols }, solution: order };
  }
  if (type === 'code') {
    const digits = Array.from({ length: 3 }, () => Math.floor(rnd() * 10));
    const colors = Array.from({ length: 3 }, () => pick(CODE_COLORS, rnd));
    return { type, data: { digits, colors }, solution: digits.map((d, i) => applyOp(manual.code[colors[i]], d)) };
  }
  if (type === 'lamps') {
    const flashes = [];
    while (flashes.length < 4) { const n = 1 + Math.floor(rnd() * 4); if (n !== flashes[flashes.length - 1]) flashes.push(n); }
    const m = { type, data: { flashes } };
    m.solution = flashes.map((_, p) => lampTarget(manual, m, 0, p));      // the answer while the bomb has no mistakes yet
    return m;
  }
  if (type === 'button') {
    const body = pick(BTN_BODIES, rnd); const strip = pick(BTN_STRIPS, rnd);
    const mode = manual.button.act[body];
    return { type, data: { body, strip }, solution: { mode, digit: mode === 'hold' ? manual.button.hold[strip] : null } };
  }
  // morse: three groups of three flashes, each short (0) or long (1); the three groups are all different
  const idx = shuffle([0, 1, 2, 3, 4, 5, 6, 7], rnd).slice(0, 3);
  const groups = idx.map((i) => [i >> 2 & 1, i >> 1 & 1, i & 1]);
  return { type: 'morse', data: { groups }, solution: idx.map((i) => manual.morse[i]) };
}

export function buildBomb(seed, level) {
  const manual = makeManual(seed);
  const rnd = mulberry32(((seed ^ 0x51ed270b) + level * 7919) >>> 0);
  const def = levelDef(level);
  const modules = shuffle(def.mods, rnd).map((type) => buildModule(type, manual, rnd));
  return {
    manual, modules, seed, level, durationMs: timeFor(level), maxStrikes: def.strikes || MAX_STRIKES,
    fog: !!def.fog, tag: def.tag || null, types: MODULE_TYPES.filter((ty) => modules.some((m) => m.type === ty)),
  };
}

// ---------- game state ----------
export function freshGame(bomb, startedAt) {
  return {
    status: 'playing', startedAt, durationMs: bomb.durationMs, maxStrikes: bomb.maxStrikes || MAX_STRIKES,
    strikes: 0, cur: 0, p: 0, e: '', x: '',
  };
}

export function remainingMs(game, now) {
  return game.startedAt + game.durationMs - game.strikes * PENALTY_MS - now;
}

// If the clock ran out, every device derives the same "lost by time" state — nobody has to write it.
export function effectiveGame(game, now) {
  if (game && game.status === 'playing' && now >= game.startedAt && remainingMs(game, now) <= 0) {
    return { ...game, status: 'lost', reason: 'time', endedAt: game.startedAt + game.durationMs - game.strikes * PENALTY_MS };
  }
  return game;
}

// Runs on the blind player's device (the only one who operates the bomb). Returns { game, result } where result is one of
// 'ok' | 'advance' | 'strike' | 'won' | 'lost' | 'ignored'.
export function applyAction(bomb, game, action, now) {
  if (game.status !== 'playing' || now < game.startedAt) return { game, result: 'ignored' };
  if (remainingMs(game, now) <= 0) return { game: effectiveGame(game, now), result: 'lost' };
  const m = bomb.modules[game.cur];
  if (!m || action.mod !== game.cur) return { game, result: 'ignored' };
  const g = { ...game };
  let good = false;
  let done = false;

  if (m.type === 'wires' && action.type === 'cut') {
    const already = g.x ? g.x.split(',').map(Number) : [];
    if (already.includes(action.i)) return { game, result: 'ignored' };
    if (action.i === m.solution) { good = true; done = true; }
    else { g.x = already.concat(action.i).join(','); }
  } else if (m.type === 'symbols' && action.type === 'pad') {
    if (action.i === m.solution[g.p]) {
      good = true; g.p += 1;
      if (g.p >= m.solution.length) done = true;
    }
  } else if (m.type === 'lamps' && action.type === 'lamp') {
    if (action.i === lampTarget(bomb.manual, m, g.strikes, g.p)) {
      good = true; g.p += 1;
      if (g.p >= m.data.flashes.length) done = true;
    }
  } else if (m.type === 'button' && action.type === 'btn') {
    if (buttonOk(m, action.held, game, now)) { good = true; done = true; }
  } else if ((m.type === 'code' || m.type === 'morse') && action.type === 'key') {
    if (action.d === m.solution[g.e.length]) {
      good = true; g.e += String(action.d);
      if (g.e.length >= m.solution.length) done = true;
    }
  } else {
    return { game, result: 'ignored' };
  }

  if (!good) {
    g.strikes += 1;
    if (g.strikes >= (g.maxStrikes || MAX_STRIKES)) {
      g.status = 'lost'; g.reason = 'strikes'; g.endedAt = now;
      return { game: g, result: 'lost' };
    }
    return { game: g, result: 'strike' };
  }
  if (!done) return { game: g, result: 'ok' };

  g.cur += 1; g.p = 0; g.e = ''; g.x = '';
  if (g.cur >= bomb.modules.length) {
    g.status = 'won'; g.endedAt = now;
    return { game: g, result: 'won' };
  }
  return { game: g, result: 'advance' };
}

// ---------- roles ----------
// Fewer than 3 players? Roles are dealt round-robin so one phone can hold several roles.
export function assignRoles(playerIds, rnd) {
  const order = shuffle(ROLES, rnd);
  const roles = {};
  order.forEach((role, i) => { roles[role] = playerIds[i % playerIds.length]; });
  return roles;
}

// Roles rotate every round so everybody tries every sense. `r` = round number. (kept for tests / one-phone play)
export function rotateRoles(playerIds, r) {
  const n = playerIds.length;
  const roles = {};
  ROLES.forEach((role, j) => { roles[role] = playerIds[(j + r) % n]; });
  return roles;
}

const sameRoles = (a, b) => !!a && !!b && ROLES.every((r) => a[r] === b[r]);

// Room mode "random": a fresh random deal every round. With a previous deal given, we try not to repeat it.
export function randomRoles(playerIds, rnd, prev) {
  let roles = assignRoles(playerIds, rnd);
  for (let i = 0; i < 8 && playerIds.length > 1 && sameRoles(roles, prev); i++) roles = assignRoles(playerIds, rnd);
  return roles;
}

// Room mode "pick": `picks` is { role: uid }. Picks of players who are not in the room are ignored.
// Roles nobody picked (rooms with fewer than 3 players) go to whoever holds the fewest roles, the host first.
export function pickRoles(playerIds, picks, hostId) {
  const order = hostId && playerIds.includes(hostId) ? [hostId, ...playerIds.filter((i) => i !== hostId)] : playerIds.slice();
  const load = {};
  order.forEach((id) => { load[id] = 0; });
  const roles = {};
  for (const role of ROLES) {
    const id = picks && picks[role];
    if (id && load[id] !== undefined) { roles[role] = id; load[id] += 1; }
  }
  for (const role of ROLES) {
    if (roles[role]) continue;
    const id = order.slice().sort((a, b) => (load[a] - load[b]) || (order.indexOf(a) - order.indexOf(b)))[0];
    roles[role] = id; load[id] += 1;
  }
  return roles;
}

// Pick mode can start once every player in the room holds a role of their own.
export function everyonePicked(playerIds, picks) {
  const held = new Set(ROLES.map((r) => picks && picks[r]).filter(Boolean));
  return playerIds.length > 0 && playerIds.every((id) => held.has(id));
}

// Who can see / do what (single source of truth for the UI and for the voice rules).
//   blind: cuts the wires / presses the buttons. Hears and speaks, sees neither bomb nor manual.
//   mute:  holds the manual. Hears, cannot speak: answers with signals.
//   deaf:  sees the bomb. Speaks, cannot hear, sees the mute's signals — the link between the other two.
export const CAPS = {
  blind: { seesBomb: false, seesManual: false, hears: true,  speaks: true,  seesSignals: false, sendsSignals: false, acts: true  },
  mute:  { seesBomb: false, seesManual: true,  hears: true,  speaks: false, seesSignals: false, sendsSignals: true,  acts: false },
  deaf:  { seesBomb: true,  seesManual: false, hears: false, speaks: true,  seesSignals: true,  sendsSignals: false, acts: false },
};

export function randomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}
