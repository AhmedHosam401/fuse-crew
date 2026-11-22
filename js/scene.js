// scene.js — what the 3D world (world3d.js) is told about the game, and the mood logic it uses.
//
// Two ways to play (each player picks their own, in the lobby or with the little button during a round):
//   ui — the plain interface (nothing here is used)
//   3d — a world you are INSIDE: the bomb, the manual and the controls are objects in it (world3d.js, Three.js; loaded only when
//        somebody picks it)
//
// The world is a VIEW of the shared game state: it never decides anything and respects the senses —
//   Deaf  gets the bomb's current module (what he sees); Blind gets only what can be felt (how many wires / keys, which pads
//   are done), never a colour or a solution; Mute gets no module at all (his bomb is under a cloth, he has the manual).
// Everything is derived from the shared state, so all phones agree and nothing extra is written to the database.
import { remainingMs, MAX_STRIKES } from './engine.js';

export const VIEWS = ['ui', '3d'];
export const ROLE_HEX = { blind: '#fb9250', mute: '#4fd1c1', deaf: '#a99cf7' };     // same hues as the CSS --c-* tokens (dark theme)

// what the world needs to know, from the current game (c = { r, bomb, game, now })
export function sceneModel(c, role, ev) {
  const g = c.game;
  return {
    role, blind: role === 'blind', status: g.status, strikes: g.strikes, max: g.maxStrikes || MAX_STRIKES,
    cur: g.cur, n: c.bomb.modules.length, total: c.bomb.durationMs, round: c.r.id, ev: ev || null,
    started: c.now >= g.startedAt,
    rem: Math.max(0, remainingMs(g, Math.max(c.now, g.startedAt))), reason: g.reason || '',
  };
}

// + the module, cut down to what THIS role may perceive
export function worldModel(c, role, ev) {
  const g = c.game; const bomb = c.bomb;
  const m = bomb.modules[Math.min(g.cur, bomb.modules.length - 1)];
  let mod = null; let game = { x: '', e: '', p: 0 };
  if (role === 'deaf') mod = { type: m.type, data: m.data };
  else if (role === 'blind') {
    mod = {
      type: m.type, n: m.type === 'wires' ? m.data.wires.length : 0, need: Array.isArray(m.solution) ? m.solution.length : 0,
      done: m.type === 'symbols' ? m.solution.slice(0, g.p) : [],
    };
    game = { x: g.x || '', e: g.e || '', p: g.p || 0 };
  }
  const base = sceneModel(c, role, ev);
  if (role === 'blind') base.rem = 0;                        // the Blind has no clock: the world is not even told the time
  return { ...base, mod, game, fog: !!bomb.fog };
}

// calm | tense | hit | cheer | win | lose
export function moodOf(m, now = Date.now()) {
  if (m.status === 'won') return 'win';
  if (m.status === 'lost') return 'lose';
  if (m.ev && now - m.ev.at < (m.ev.k === 'strike' ? 900 : 1400)) return m.ev.k === 'strike' ? 'hit' : 'cheer';
  if (m.strikes > 0 && m.strikes >= m.max - 1) return 'tense';
  if (!m.blind && m.rem <= 20000) return 'tense';            // the Blind has no clock, so the clock cannot change the mood he sees
  return 'calm';
}
