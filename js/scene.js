// scene.js — the "graphics" of the 2D view, plus the mood logic the 3D view shares.
//
// Three ways to play (each player picks their own, in the lobby or with the little button during a round):
//   ui  — the plain interface (nothing here is used)
//   2d  — an illustrated scene above the controls: the crew around the bomb, reacting to what happens
//   3d  — the same scene as a little 3D diorama (scene3d.js, Three.js, loaded only when somebody picks it)
//
// The scene is DECORATION: it never carries a puzzle clue, and it respects the senses —
//   the Blind sees a dark scene with no clock, no burning fuse and no time-based moods (the clock is what the others call out).
//
// Everything is derived from the shared game state, so all phones agree and nothing extra is written to the database.
import { remainingMs, MAX_STRIKES } from './engine.js';
import { fmt } from './ui.js';

export const VIEWS = ['ui', '2d', '3d'];
export const ROLE_HEX = { blind: '#fb9250', mute: '#4fd1c1', deaf: '#a99cf7' };     // same hues as the CSS --c-* tokens (dark theme)

// what the scene needs to know, from the current game (c = { r, bomb, game, now })
export function sceneModel(c, role, ev) {
  const g = c.game;
  return {
    role, blind: role === 'blind', status: g.status, strikes: g.strikes, max: g.maxStrikes || MAX_STRIKES,
    cur: g.cur, n: c.bomb.modules.length, total: c.bomb.durationMs, round: c.r.id, ev: ev || null,
    rem: Math.max(0, remainingMs(g, Math.max(c.now, g.startedAt))), reason: g.reason || '',
  };
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
// what changes the picture (the fuse and the LED are patched in place by tick2d, not redrawn)
export const sceneKey = (m, mood) => `2d|${m.round}|${m.role}|${mood}|${m.strikes}|${m.status}`;

// ---------------------------------------------------------------- the characters
// Same little bomb-heads as the rest of the app (ui.js avatar), drawn here with faces that follow the mood.
function eyes(role, mood) {
  if (role === 'blind') return '';
  const dark = '#111827';
  if (mood === 'hit') return `<path d="M31 43l11 7-11 7M69 43l-11 7 11 7" stroke="${dark}" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (mood === 'cheer' || mood === 'win') return `<path d="M30 54q8-11 16 0M54 54q8-11 16 0" stroke="${dark}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
  if (mood === 'lose') return `<path d="M31 44l13 12M44 44l-13 12M56 44l13 12M69 44l-13 12" stroke="${dark}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  if (mood === 'tense') return '<circle cx="37" cy="50" r="9" fill="#fff"/><circle cx="63" cy="50" r="9" fill="#fff"/><circle cx="35" cy="51" r="2.6" fill="#111827"/><circle cx="61" cy="51" r="2.6" fill="#111827"/>';
  return '<circle cx="38" cy="50" r="7" fill="#fff"/><circle cx="62" cy="50" r="7" fill="#fff"/><circle cx="39" cy="51" r="3.4" fill="#111827"/><circle cx="63" cy="51" r="3.4" fill="#111827"/>';
}
function mouth(role, mood) {
  if (role === 'mute') return '<rect x="33" y="63" width="34" height="15" rx="4" fill="#e5e7eb"/><path d="M40 66l20 9M60 66l-20 9" stroke="#6b7280" stroke-width="2.5" stroke-linecap="round"/>';
  if (mood === 'hit') return '<ellipse cx="50" cy="70" rx="6" ry="7.5" fill="#111827"/>';
  if (mood === 'cheer' || mood === 'win') return '<path d="M35 64q15 22 30 0z" fill="#111827"/><ellipse cx="50" cy="74" rx="6" ry="3.2" fill="#f87171"/>';
  if (mood === 'lose') return '<path d="M36 74q4-7 7 0t7 0t7 0t7 0" stroke="#111827" stroke-width="3.2" fill="none" stroke-linecap="round"/>';
  if (mood === 'tense') return '<path d="M38 71l6-4 6 4 6-4 6 4" stroke="#111827" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  return '<path d="M40 68q10 9 20 0" stroke="#111827" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
}
function arms(role, mood, c) {
  if (mood !== 'cheer' && mood !== 'win') return '';
  return `<path d="M20 74Q4 66 7 44M80 74Q96 66 93 44" stroke="${c}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
}
function character(role, mood) {
  const c = ROLE_HEX[role];
  const blind = role === 'blind'
    ? '<rect x="14" y="40" width="72" height="19" rx="7" fill="#1f2937"/><path d="M14 46l-8-4M14 54l-8 4" stroke="#1f2937" stroke-width="4" stroke-linecap="round"/>' : '';
  const muffs = role === 'deaf'
    ? '<path d="M18 52Q50 2 82 52" stroke="#374151" stroke-width="7" fill="none"/><rect x="8" y="42" width="16" height="26" rx="8" fill="#374151"/><rect x="76" y="42" width="16" height="26" rx="8" fill="#374151"/>' : '';
  const sweat = mood === 'tense' ? '<path d="M80 30q6 9 0 13q-6-4 0-13z" fill="#7dd3fc"/>' : '';
  const stars = mood === 'hit' ? '<path d="M24 22l3 6 6 3-6 3-3 6-3-6-6-3 6-3zM76 14l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fde047"/>' : '';
  const soot = mood === 'lose' ? '<ellipse cx="50" cy="54" rx="34" ry="34" fill="#000" opacity=".42"/><ellipse cx="34" cy="80" rx="10" ry="5" fill="#000" opacity=".4"/>' : '';
  const fuse = '<path d="M50 20q4-12 15-12" stroke="#a16207" stroke-width="4" fill="none" stroke-linecap="round"/>'
    + (mood === 'lose' ? '' : '<circle cx="66" cy="8" r="5" fill="#fde047"/><circle cx="66" cy="8" r="2.5" fill="#fb923c"/>');
  return `${arms(role, mood, c)}<circle cx="50" cy="54" r="34" fill="${c}"/><ellipse cx="38" cy="38" rx="9" ry="5" fill="#fff" opacity=".28" transform="rotate(-30 38 38)"/>`
    + `${eyes(role, mood)}${mouth(role, mood)}${blind}${muffs}${soot}${sweat}${stars}${fuse}`;
}

// where each character stands in the 360×160 picture, and how big
const SPOT = { blind: { x: 20, y: 66, s: 0.78 }, deaf: { x: 262, y: 66, s: 0.78 }, mute: { x: 139, y: 90, s: 0.62 } };

// ---------------------------------------------------------------- the bomb
export const FUSE = 'M0 -44C0 -58 16 -58 22 -66S34 -74 40 -66';
function bombArt(m, mood) {
  const lit = (i) => i < m.strikes;
  const lamps = [-13, 0, 13].map((x, i) => `<circle cx="${x}" cy="-20" r="4.4" fill="${lit(i) ? '#ff4d4d' : '#3a1a1f'}"${lit(i) ? ' filter="url(#sc-glow)"' : ''}/>`).join('');
  // cracks grow with every mistake
  const cracks = (m.strikes >= 1 ? '<path d="M-30 -10l9 7-5 7 8 6" stroke="#0b0d14" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : '')
    + (m.strikes >= 2 ? '<path d="M24 -22l-8 9 7 5-6 9" stroke="#0b0d14" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : '');
  const face = m.blind ? '<rect x="-24" y="-4" width="48" height="19" rx="5" fill="#10131c"/>'
    : `<rect x="-24" y="-4" width="48" height="19" rx="5" fill="#0d2417" stroke="#2f4f3a" stroke-width="1.5"/><text id="sc-led" x="0" y="11.4" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="14" font-weight="700" fill="${m.status === 'won' ? '#6ee7a1' : '#ff6b5e'}">${m.status === 'won' ? 'OK' : fmt(m.rem)}</text>`;
  const done = m.status === 'won';
  return `<g class="sc-bomb">
    <ellipse cx="0" cy="44" rx="34" ry="5" fill="#000" opacity=".28"/>
    <circle r="40" fill="url(#sc-metal)"/><ellipse cx="-14" cy="-20" rx="13" ry="7" fill="#fff" opacity=".13" transform="rotate(-30 -14 -20)"/>
    <path d="M-39 -9Q0 -16 39 -9L39 3Q0 -4 -39 3Z" fill="#555d7c"/>
    <rect x="-10" y="-50" width="20" height="11" rx="3" fill="#7a82a3"/>
    ${face}${lamps}${cracks}
    <path d="${FUSE}" stroke="#3b2f1e" stroke-width="4" fill="none" stroke-linecap="round" id="sc-fuse0"/>
    <path d="${FUSE}" stroke="#d9b46a" stroke-width="3.2" fill="none" stroke-linecap="round" id="sc-fuse"/>
    <g id="sc-spark"${done || mood === 'lose' ? ' style="display:none"' : ''}><circle r="7.5" fill="#fb923c" opacity=".35"/><circle r="4" fill="#fde047"/><circle r="1.8" fill="#fff"/></g>
  </g>`;
}

const CONFETTI = ['#fb9250', '#4fd1c1', '#a99cf7', '#fde047', '#f472b6', '#60a5fa'];
function confetti() {
  let out = '';
  for (let i = 0; i < 22; i++) {
    const x = 12 + ((i * 53) % 336); const d = (i % 7) * 0.12; const col = CONFETTI[i % CONFETTI.length];
    out += `<rect class="sc-conf" x="${x}" y="-8" width="6" height="9" rx="1.5" fill="${col}" style="animation-delay:${d}s;--dx:${(i % 5 - 2) * 10}px"/>`;
  }
  return `<g>${out}</g>`;
}
function boom() {
  return `<g class="sc-boom" transform="translate(180 76)">
    <polygon points="0,-62 12,-26 46,-44 28,-12 66,0 28,12 44,46 12,26 0,60 -12,26 -46,44 -28,12 -66,0 -28,-12 -44,-46 -12,-26" fill="#fb923c"/>
    <polygon points="0,-38 8,-16 28,-26 17,-6 40,0 17,6 26,28 8,16 0,36 -8,16 -26,28 -17,6 -40,0 -17,-6 -28,-26 -8,-16" fill="#fde047"/></g>
    <g class="sc-smoke"><circle cx="150" cy="60" r="14" fill="#9ca3af" opacity=".5"/><circle cx="184" cy="46" r="18" fill="#9ca3af" opacity=".45"/><circle cx="214" cy="64" r="12" fill="#9ca3af" opacity=".5"/></g>`;
}

// ---------------------------------------------------------------- the whole picture
export function scene2dHTML(m, mood) {
  const dark = m.blind;
  const chars = ['blind', 'deaf', 'mute'].map((r) => {
    const p = SPOT[r];
    const me = r === m.role;
    return `<g transform="translate(${p.x} ${p.y}) scale(${p.s})"${me ? ' class="sc-me"' : ''}>
      ${me ? `<ellipse cx="50" cy="104" rx="38" ry="7" fill="${ROLE_HEX[r]}" opacity=".5" class="sc-ring"/>` : '<ellipse cx="50" cy="104" rx="30" ry="5" fill="#000" opacity=".3"/>'}
      <g class="sc-char sc-${r}">${character(r, mood)}</g></g>`;
  }).join('');
  const bomb = mood === 'lose' ? '' : `<g transform="translate(180 72)" class="sc-bombwrap">${bombArt(m, mood)}</g>`;
  return `<svg class="sc m-${mood}${dark ? ' dark' : ''}" viewBox="0 0 360 160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <radialGradient id="sc-metal" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#5a6285"/><stop offset=".6" stop-color="#2d3350"/><stop offset="1" stop-color="#181b2b"/></radialGradient>
      <linearGradient id="sc-bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="160"><stop offset="0" stop-color="#2a2f4a"/><stop offset="1" stop-color="#171a2a"/></linearGradient>
      <filter id="sc-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.4"/></filter>
    </defs>
    <rect x="-600" y="-300" width="1560" height="760" fill="url(#sc-bg)"/>
    <ellipse cx="180" cy="146" rx="176" ry="22" fill="#10121d"/>
    ${bomb}${chars}${mood === 'lose' ? boom() : ''}${mood === 'win' ? confetti() : ''}
    <rect class="sc-flash" x="-600" y="-300" width="1560" height="760" fill="#ff2d2d"/>
  </svg>`;
}

// patched every tick: the LED digits and how much fuse is left. The Blind's fuse stays whole (it would give the time away).
export function tick2d(root, m) {
  const svg = root && root.querySelector('svg.sc');
  if (!svg) return;
  const led = svg.querySelector('#sc-led');
  if (led && m.status === 'playing') { const txt = fmt(m.rem); if (led.textContent !== txt) led.textContent = txt; }
  const path = svg.querySelector('#sc-fuse'); const spark = svg.querySelector('#sc-spark');
  if (!path || !spark) return;
  const L = +path.dataset.len || (path.dataset.len = path.getTotalLength());
  const f = m.blind || m.status !== 'playing' ? 1 : Math.max(0, Math.min(1, m.rem / m.total));
  const key = f.toFixed(3);
  if (svg.dataset.f === key) return;
  svg.dataset.f = key;
  path.style.strokeDasharray = `${L * f} ${L + 1}`;
  const pt = path.getPointAtLength(L * f);
  spark.setAttribute('transform', `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)}) scale(${(0.8 + 0.4 * (1 - f)).toFixed(2)})`);
  const tip = svg.querySelector('#sc-fuse0'); if (tip) tip.style.strokeDasharray = `${L} ${L + 1}`;
}
