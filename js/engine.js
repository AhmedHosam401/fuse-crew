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
  return { wires, symbols, code };
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

export function moduleCount(level) { return Math.min(2 + level, 6); }
export function timeFor(count) { return (50 + 55 * count) * 1000; }

export function buildBomb(seed, level) {
  const manual = makeManual(seed);
  const rnd = mulberry32(((seed ^ 0x51ed270b) + level * 7919) >>> 0);
  const count = moduleCount(level);

  let types = [];
  while (types.length < count) types = types.concat(shuffle(['wires', 'symbols', 'code'], rnd));
  types = types.slice(0, count);

  const modules = types.map((type) => {
    if (type === 'wires') {
      const k = pick([3, 4, 5], rnd);
      const wires = Array.from({ length: k }, () => pick(COLORS, rnd));
      return { type, data: { wires }, solution: solveWires(manual, wires) };
    }
    if (type === 'symbols') {
      const symbols = shuffle(SYMBOLS, rnd).slice(0, 4);
      const order = [0, 1, 2, 3].sort(
        (i, j) => manual.symbols.indexOf(symbols[i]) - manual.symbols.indexOf(symbols[j]),
      );
      return { type, data: { symbols }, solution: order };
    }
    const digits = Array.from({ length: 3 }, () => Math.floor(rnd() * 10));
    const colors = Array.from({ length: 3 }, () => pick(CODE_COLORS, rnd));
    const solution = digits.map((d, i) => applyOp(manual.code[colors[i]], d));
    return { type: 'code', data: { digits, colors }, solution };
  });

  return { manual, modules, durationMs: timeFor(count), seed, level };
}

// ---------- game state ----------
export function freshGame(bomb, startedAt) {
  return {
    status: 'playing', startedAt, durationMs: bomb.durationMs,
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
  } else if (m.type === 'code' && action.type === 'key') {
    if (action.d === m.solution[g.e.length]) {
      good = true; g.e += String(action.d);
      if (g.e.length >= m.solution.length) done = true;
    }
  } else {
    return { game, result: 'ignored' };
  }

  if (!good) {
    g.strikes += 1;
    if (g.strikes >= MAX_STRIKES) {
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

// Roles rotate every round so everybody tries every sense. `r` = round number.
export function rotateRoles(playerIds, r) {
  const n = playerIds.length;
  const roles = {};
  ROLES.forEach((role, j) => { roles[role] = playerIds[(j + r) % n]; });
  return roles;
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
