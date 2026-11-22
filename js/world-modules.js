// world-modules.js — the six puzzle types as OBJECTS in the 3D world.
//   see  (the Deaf): what is really on the bomb: coloured wires, key caps, LCDs, bulbs, the big button, the morse lamp.
//   feel (the Blind): the same puzzle as something to touch in the dark: faint outlines, braille, nothing coloured.
// Each builder returns { group, hits, tick(now) }. `hits` are invisible, generously sized meshes the player's finger can find;
// their userData says what a touch does ({ tact, i/d, reveal, visual }). The group is rebuilt whenever the state changes.
import * as THREE from '../vendor/three.module.min.js';
import { COLOR_HEX, LAMP_COLORS } from './engine.js';
import { lampLit, morseState } from './senses.js';
import { colorName } from './i18n.js';
import { labelTex, brailleTex, symbolTex, lcdTex, makeKit } from './world-art.js';

const hex = (c) => COLOR_HEX[c];
const metalCol = 0x8a90a6;

function mesh(kit, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(kit.geo(geometry), material); m.position.set(x, y, z); return m;
}
const box = (kit, w, h, d, mat, x, y, z) => mesh(kit, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
function quad(kit, w, h, map, o = {}) {
  const m = new THREE.Mesh(kit.geo(new THREE.PlaneGeometry(w, h)), kit.basic(0xffffff, { map, transparent: true, depthWrite: false, ...o }));
  return m;
}
const hitMat = (kit) => kit.basic(0xffffff, { transparent: true, opacity: 0, depthWrite: false });
const labelPlane = (kit, text, size, o) => quad(kit, size, size, kit.tex(labelTex(text, o)));
function braillePlane(kit, n, h, o) {
  const b = brailleTex(n, o); kit.tex(b.tex);
  return quad(kit, h * (b.w / b.h), h, b.tex);
}
// a thin rectangular frame made of four little boxes (a line would be one pixel wide)
function frame(kit, w, h, th, mat, z = 0) {
  const g = new THREE.Group();
  g.add(box(kit, w, th, th, mat, 0, h / 2, z), box(kit, w, th, th, mat, 0, -h / 2, z), box(kit, th, h, th, mat, -w / 2, 0, z), box(kit, th, h, th, mat, w / 2, 0, z));
  return g;
}
const ys = (n, top, bottom) => Array.from({ length: n }, (_, i) => (n === 1 ? (top + bottom) / 2 : top - (i * (top - bottom)) / (n - 1)));

// ================================================================= SEE (the Deaf)
// layout: x -1.05..1.05, y -0.55..0.5, z up from the panel
function seeWires(kit, mod) {
  const g = new THREE.Group(); const wires = mod.data.wires; const n = wires.length;
  const metal = kit.std(metalCol, { metalness: 0.7, roughness: 0.35 });
  ys(n, 0.4, -0.5).forEach((y, i) => {
    [-0.93, 0.93].forEach((x) => {
      g.add(box(kit, 0.2, 0.2, 0.16, metal, x, y, 0.08));
      g.add(mesh(kit, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), kit.std(0x2a2f40), x, y, 0.17).rotateX(Math.PI / 2));
    });
    const w = i % 2 ? 0.05 : -0.05;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.84, y, 0.1), new THREE.Vector3(-0.4, y + w, 0.15), new THREE.Vector3(0.4, y - w, 0.15), new THREE.Vector3(0.84, y, 0.1)]);
    const black = wires[i] === 'black';
    const color = new THREE.Color(hex(wires[i]));
    const tube = new THREE.Mesh(kit.geo(new THREE.TubeGeometry(curve, 28, 0.048, 8, false)), kit.std(color, { roughness: 0.4, emissive: black ? 0x30385c : color, emissiveIntensity: black ? 0.9 : 0.12 }));
    g.add(tube);
    if (black) g.add(new THREE.Mesh(kit.geo(new THREE.TubeGeometry(curve, 28, 0.066, 8, false)), kit.basic(0x7b84ad, { transparent: true, opacity: 0.55, depthWrite: false })));
    const tag = labelPlane(kit, i + 1, 0.2, { fg: '#fff', bg: '#0b0d14', stroke: '#aab0c8', size: 84 });
    tag.position.set(-0.64, y, 0.21); g.add(tag);
  });
  return { group: g, hits: [], tick() {} };
}

function seeSymbols(kit, mod) {
  const g = new THREE.Group();
  mod.data.symbols.forEach((s, i) => {
    const x = (i - 1.5) * 0.56;
    g.add(box(kit, 0.5, 0.5, 0.06, kit.std(0x2b3046, { metalness: 0.5 }), x, 0.02, 0.03));
    g.add(box(kit, 0.46, 0.46, 0.12, kit.std(0xe9e4d2, { roughness: 0.55 }), x, 0.02, 0.1));
    const face = quad(kit, 0.4, 0.4, kit.tex(symbolTex(s)), { transparent: false }); face.position.set(x, 0.02, 0.165); g.add(face);
    const num = labelPlane(kit, i + 1, 0.2, { fg: '#cfd4ea', size: 84 }); num.position.set(x, -0.34, 0.03); g.add(num);
  });
  return { group: g, hits: [], tick() {} };
}

function seeCode(kit, mod) {
  const g = new THREE.Group(); const { digits, colors } = mod.data; const n = digits.length;
  const step = Math.min(0.66, 2.0 / n); const w = step * 0.86;
  digits.forEach((d, i) => {
    const x = (i - (n - 1) / 2) * step; const col = new THREE.Color(hex(colors[i]));
    g.add(box(kit, w + 0.06, w * 1.34 + 0.06, 0.1, kit.std(col, { emissive: col, emissiveIntensity: 0.35 }), x, 0.0, 0.05));
    const scr = quad(kit, w, w * 1.34, kit.tex(lcdTex(d, colorName(colors[i]), hex(colors[i]))), { transparent: false }); scr.position.set(x, 0, 0.105); g.add(scr);
  });
  return { group: g, hits: [], tick() {} };
}

function seeLamps(kit, mod) {
  const g = new THREE.Group(); const bulbs = [];
  [1, 2, 3, 4].forEach((n, i) => {
    const x = (i - 1.5) * 0.56; const col = new THREE.Color(hex(LAMP_COLORS[i]));
    g.add(mesh(kit, new THREE.CylinderGeometry(0.2, 0.23, 0.1, 20), kit.std(0x2b3046, { metalness: 0.5 }), x, 0.06, 0.05).rotateX(Math.PI / 2));
    const m = kit.std(col, { emissive: col, emissiveIntensity: 0.05, roughness: 0.2 });
    const bulb = mesh(kit, new THREE.SphereGeometry(0.19, 20, 14), m, x, 0.06, 0.14);
    const glow = mesh(kit, new THREE.SphereGeometry(0.32, 16, 12), kit.basic(col, { transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), x, 0.06, 0.16);
    g.add(bulb, glow);
    const num = labelPlane(kit, n, 0.2, { fg: '#fff', size: 84 }); num.position.set(x, -0.3, 0.03); g.add(num);
    bulbs.push({ m, glow });
  });
  const flashes = mod.data.flashes;
  return { group: g, hits: [], tick(now) {
    const lit = lampLit(flashes, now);
    bulbs.forEach((b, i) => { const on = lit === i + 1; b.m.emissiveIntensity = on ? 2.4 : 0.05; b.glow.material.opacity = on ? 0.45 : 0; });
  } };
}

function seeButton(kit, mod) {
  const g = new THREE.Group(); const body = new THREE.Color(hex(mod.data.body)); const strip = new THREE.Color(hex(mod.data.strip));
  g.add(mesh(kit, new THREE.CylinderGeometry(0.56, 0.6, 0.08, 36), kit.std(0x2b3046, { metalness: 0.6, roughness: 0.35 }), -0.3, 0.0, 0.04).rotateX(Math.PI / 2));
  g.add(mesh(kit, new THREE.CylinderGeometry(0.46, 0.5, 0.16, 36), kit.std(body, { roughness: 0.3, emissive: body, emissiveIntensity: 0.18 }), -0.3, 0.0, 0.14).rotateX(Math.PI / 2));
  const dome = mesh(kit, new THREE.SphereGeometry(0.44, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), kit.std(body, { roughness: 0.25, emissive: body, emissiveIntensity: 0.22 }), -0.3, 0.0, 0.2); dome.rotation.x = Math.PI / 2; dome.scale.z = 0.35; g.add(dome);
  g.add(box(kit, 0.26, 1.0, 0.06, kit.std(0x1a1e2c), 0.78, 0, 0.03));
  g.add(box(kit, 0.16, 0.9, 0.05, kit.std(strip, { emissive: strip, emissiveIntensity: 0.9 }), 0.78, 0, 0.085));
  return { group: g, hits: [], tick() {} };
}

function seeMorse(kit, mod) {
  const g = new THREE.Group(); const groups = mod.data.groups;
  const m = kit.std(0xfff2c2, { emissive: 0xffd45a, emissiveIntensity: 0.05, roughness: 0.2 });
  g.add(mesh(kit, new THREE.CylinderGeometry(0.34, 0.38, 0.1, 28), kit.std(0x2b3046, { metalness: 0.5 }), 0, 0.14, 0.05).rotateX(Math.PI / 2));
  g.add(mesh(kit, new THREE.SphereGeometry(0.3, 24, 16), m, 0, 0.14, 0.16));
  const glow = mesh(kit, new THREE.SphereGeometry(0.52, 16, 12), kit.basic(0xffd45a, { transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.14, 0.18); g.add(glow);
  const dots = groups.map((_, i) => {
    const x = (i - (groups.length - 1) / 2) * 0.46;
    const mat = kit.basic(0x3a4166);
    const d = mesh(kit, new THREE.CylinderGeometry(0.09, 0.09, 0.04, 14), mat, x, -0.38, 0.03).rotateX(Math.PI / 2);
    const num = labelPlane(kit, i + 1, 0.16, { fg: '#cfd4ea', size: 84 }); num.position.set(x, -0.52, 0.03);
    g.add(d, num); return mat;
  });
  return { group: g, hits: [], tick(now) {
    const st = morseState(groups, now);
    m.emissiveIntensity = st.on ? 2.6 : 0.05; glow.material.opacity = st.on ? 0.5 : 0;
    dots.forEach((mt, i) => mt.color.set(i === st.group ? 0xffd45a : 0x3a4166));
  } };
}

export function buildSee(mod) {
  const kit = makeKit();
  const b = { wires: seeWires, symbols: seeSymbols, code: seeCode, lamps: seeLamps, button: seeButton, morse: seeMorse }[mod.type](kit, mod);
  b.kit = kit; return b;
}

// ================================================================= FEEL (the Blind)
// layout: x -1.2..1.2, y -1.1..1.05 (the whole screen is his: nothing else is in the dark)
const FEEL = 0xaab2d8;
function feelPad(kit, w, h, hitD, data, reveal, { round = false, label = null, done = false } = {}) {
  const g = new THREE.Group();
  const fillM = kit.basic(FEEL, { transparent: true, opacity: done ? 0.34 : 0.1, depthWrite: false });
  const edgeM = kit.basic(FEEL, { transparent: true, opacity: 0.75, depthWrite: false });
  if (round) {
    const r = w / 2;
    g.add(new THREE.Mesh(kit.geo(new THREE.CircleGeometry(r, 40)), fillM));
    g.add(new THREE.Mesh(kit.geo(new THREE.RingGeometry(r - 0.028, r, 48)), edgeM));
  } else {
    g.add(new THREE.Mesh(kit.geo(new THREE.PlaneGeometry(w, h)), fillM));
    g.add(frame(kit, w, h, 0.026, edgeM));
  }
  if (label != null) { const b = braillePlane(kit, label, Math.min(0.28, h * 0.6), { on: '#ffffff', off: 'rgba(255,255,255,.16)' }); b.position.z = 0.01; g.add(b); }
  const hit = new THREE.Mesh(kit.geo(round ? new THREE.CircleGeometry(hitD / 2, 20) : new THREE.PlaneGeometry(hitD, hitD * (h / w))), hitMat(kit));
  hit.position.z = 0.02;
  hit.userData = { ...data, reveal, visual: g };
  g.add(hit);
  return { g, hit };
}

function feelWires(kit, mod, st) {
  const g = new THREE.Group(); const hits = []; const n = mod.n;
  const cut = st.x ? st.x.split(',').map(Number) : [];
  const edgeM = kit.basic(FEEL, { transparent: true, opacity: 0.8, depthWrite: false });
  const dimM = kit.basic(FEEL, { transparent: true, opacity: 0.3, depthWrite: false });
  ys(n, 0.8, -0.85).forEach((y, i) => {
    [-1.08, 1.08].forEach((x) => g.add(frame(kit, 0.18, 0.22, 0.024, edgeM).translateX(x).translateY(y)));
    const w = i % 2 ? 0.05 : -0.05;
    const pts = [new THREE.Vector3(-1.0, y, 0), new THREE.Vector3(-0.4, y + w, 0.02), new THREE.Vector3(0.4, y - w, 0.02), new THREE.Vector3(1.0, y, 0)];
    const curve = new THREE.CatmullRomCurve3(pts);
    const wire = new THREE.Group();
    if (cut.includes(i)) {
      [new THREE.CatmullRomCurve3([pts[0], new THREE.Vector3(-0.7, y + 0.03, 0.01), new THREE.Vector3(-0.45, y + 0.07, 0.02)]), new THREE.CatmullRomCurve3([new THREE.Vector3(0.45, y - 0.07, 0.02), new THREE.Vector3(0.7, y - 0.03, 0.01), pts[3]])]
        .forEach((c) => wire.add(new THREE.Mesh(kit.geo(new THREE.TubeGeometry(c, 8, 0.036, 6, false)), dimM)));
    } else {
      wire.add(new THREE.Mesh(kit.geo(new THREE.TubeGeometry(curve, 30, 0.05, 8, false)), edgeM));
      wire.add(new THREE.Mesh(kit.geo(new THREE.TubeGeometry(curve, 30, 0.11, 8, false)), kit.basic(FEEL, { transparent: true, opacity: 0.1, depthWrite: false })));
      const hit = new THREE.Mesh(kit.geo(new THREE.TubeGeometry(curve, 16, 0.19, 6, false)), hitMat(kit));
      hit.userData = { tact: 'cut', i, reveal: String(i + 1), visual: wire };
      wire.add(hit); hits.push(hit);
    }
    g.add(wire);
    const b = braillePlane(kit, i + 1, 0.2, { on: cut.includes(i) ? 'rgba(255,255,255,.35)' : '#ffffff', off: 'rgba(255,255,255,.14)' });
    b.position.set(-0.62, y + 0.19, 0.03); g.add(b);
  });
  return { group: g, hits, tick() {} };
}

function feelSymbols(kit, mod) {
  const g = new THREE.Group(); const hits = [];
  [[-0.58, 0.58], [0.58, 0.58], [-0.58, -0.58], [0.58, -0.58]].forEach(([x, y], i) => {
    const done = mod.done.includes(i);
    const { g: pad, hit } = feelPad(kit, 0.98, 0.98, 1.0, { tact: 'pad', i }, String(i + 1), { label: i + 1, done });
    pad.position.set(x, y, done ? -0.03 : 0); g.add(pad); hits.push(hit);
  });
  return { group: g, hits, tick() {} };
}

function feelLamps(kit) {
  const g = new THREE.Group(); const hits = [];
  [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]].forEach(([x, y], i) => {
    const { g: pad, hit } = feelPad(kit, 1.0, 1.0, 1.04, { tact: 'lamp', i: i + 1 }, String(i + 1), { round: true, label: i + 1 });
    pad.position.set(x, y, 0); g.add(pad); hits.push(hit);
  });
  return { group: g, hits, tick() {} };
}

function feelButton(kit) {
  const g = new THREE.Group();
  const { g: pad, hit } = feelPad(kit, 1.6, 1.6, 1.7, { tact: 'btn' }, '', { round: true });
  g.add(pad);
  const inner = new THREE.Mesh(kit.geo(new THREE.RingGeometry(0.46, 0.5, 40)), kit.basic(FEEL, { transparent: true, opacity: 0.5, depthWrite: false })); inner.position.z = 0.01; pad.add(inner);
  return { group: g, hits: [hit], tick() {} };
}

function feelKeypad(kit, mod, st) {
  const g = new THREE.Group(); const hits = []; const n = mod.need;
  const edgeM = kit.basic(FEEL, { transparent: true, opacity: 0.75, depthWrite: false });
  const step = 0.36;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * step; const f = i < st.e.length;
    g.add(new THREE.Mesh(kit.geo(new THREE.CircleGeometry(f ? 0.09 : 0.07, 20)), kit.basic(FEEL, { transparent: true, opacity: f ? 0.95 : 0.25, depthWrite: false })).translateX(x).translateY(0.96));
    if (!f) g.add(new THREE.Mesh(kit.geo(new THREE.RingGeometry(0.1, 0.125, 24)), edgeM).translateX(x).translateY(0.96));
  }
  const rows = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [null, 0, null]];
  rows.forEach((row, r) => row.forEach((d, c) => {
    if (d == null) return;
    const { g: pad, hit } = feelPad(kit, 0.66, 0.38, 0.72, { tact: 'key', d }, String(d), { label: d });
    pad.position.set((c - 1) * 0.76, 0.5 - r * 0.46, 0); g.add(pad); hits.push(hit);
  }));
  return { group: g, hits, tick() {} };
}

// mod = { type, n (wires), need (digits to enter), done (symbol pads done) }; st = { x, e }
export function buildFeel(mod, st) {
  const kit = makeKit();
  const fn = { wires: feelWires, symbols: feelSymbols, lamps: feelLamps, button: feelButton, code: feelKeypad, morse: feelKeypad }[mod.type];
  const b = fn(kit, mod, st);
  b.kit = kit; return b;
}
