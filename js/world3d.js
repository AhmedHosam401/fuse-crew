// world3d.js — the 3D way to play: you sit at a table in a small workshop, with the bomb in front of you, and the puzzle is made of
// real objects you look at or touch. Loaded only when somebody picks "3D".
//
//   Deaf  — sees the bomb: the sloped panel with the current module built from real parts; the others sit across the table.
//   Blind — sees NOTHING: a black screen with the module's parts drawn as faint touchable outlines + braille.
//           A tap does the thing (the wire really snaps), a long press shows the number, the big button reports how long it was held.
//   Mute  — sits at a desk with the manual: a real book whose page you read and turn; the bomb is under a cloth.
//
// It is only a view of the shared game state (same rules as the interface); nothing here decides anything.
import * as THREE from '../vendor/three.module.min.js';
import { CSS3DRenderer, CSS3DObject } from '../vendor/CSS3DRenderer.js';
import { HOLD_MS } from './engine.js';
import { fmt } from './ui.js';
import { moodOf, ROLE_HEX } from './scene.js';
import { buildSee, buildFeel } from './world-modules.js';
import { makeKit, ledScreen, hazardTex, canvasTex, labelTex } from './world-art.js';

const DARK = 0x111827;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const LONG_PRESS = 450;
const ease = (k) => 1 - (1 - clamp01(k)) ** 3;

// ---- a pool of point sprites: sparks, confetti, the explosion
function makePool(N, { additive = true, size = 0.12 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3).fill(-100); const col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  return { pts, geo, mat, pos, col, vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), base: new Float32Array(N * 3), N, i: 0, grav: 0 };
}
function emit(p, x, y, z, vx, vy, vz, life, c) {
  const i = p.i; p.i = (p.i + 1) % p.N;
  p.pos[i * 3] = x; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = z; p.vel[i * 3] = vx; p.vel[i * 3 + 1] = vy; p.vel[i * 3 + 2] = vz;
  p.life[i] = life; p.max[i] = life; p.base[i * 3] = c.r; p.base[i * 3 + 1] = c.g; p.base[i * 3 + 2] = c.b;
}
function stepPool(p, dt) {
  for (let i = 0; i < p.N; i++) {
    if (p.life[i] <= 0) continue;
    p.life[i] -= dt;
    if (p.life[i] <= 0) { p.pos[i * 3 + 1] = -100; continue; }
    p.vel[i * 3 + 1] -= p.grav * dt;
    p.pos[i * 3] += p.vel[i * 3] * dt; p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt; p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
    const k = p.life[i] / p.max[i];
    p.col[i * 3] = p.base[i * 3] * k; p.col[i * 3 + 1] = p.base[i * 3 + 1] * k; p.col[i * 3 + 2] = p.base[i * 3 + 2] * k;
  }
  p.geo.attributes.position.needsUpdate = true; p.geo.attributes.color.needsUpdate = true;
}

// where the camera sits for each role (the fov is worked out from the size of the screen)
const RIG = {
  deaf: { pos: new THREE.Vector3(0, 3.0, 4.1), look: new THREE.Vector3(0, 1.12, -0.1), fitW: 3.3 },
  blind: { pos: new THREE.Vector3(0, 0, 3.7), look: new THREE.Vector3(0, -0.02, 0), fitW: 2.75 },
  mute: { pos: new THREE.Vector3(0, 9.55, 4.2), look: new THREE.Vector3(0, 0.05, 1.1), fitW: 0 },
};
const BOOK_AT = new THREE.Vector3(0, 0.03, 1.25);
const BOMB_AT = new THREE.Vector3(0, 0, -0.3);

export function createWorld(host, opts) {
  const { onAction = () => {}, onReveal = () => {}, onBuzz = () => {} } = opts;
  let role = opts.role;
  const kit = makeKit();
  const canvas = document.createElement('canvas'); canvas.className = 'w3canvas'; host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency || 4) <= 2 ? 1 : 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  const BG = { deaf: 0x151829, mute: 0x151829, blind: 0x000000 };
  scene.background = new THREE.Color(BG[role]);
  scene.fog = new THREE.Fog(0x151829, 16, 32);

  // ================================================================= lights
  const hemi = new THREE.HemisphereLight(0xb8c4ff, 0x20243a, 1.0); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1d8, 2.0); key.position.set(3, 6, 5); scene.add(key);
  const lampLight = new THREE.PointLight(0xffb766, 14, 10, 1.5); lampLight.position.set(-2.5, 1.9, -1.2); scene.add(lampLight);
  const alarm = new THREE.PointLight(0xff2a2a, 0, 16, 1.5); alarm.position.set(0, 2.4, 2.4); scene.add(alarm);
  const happy = new THREE.PointLight(0x4ade80, 0, 16, 1.5); happy.position.set(0, 2.4, 2.4); scene.add(happy);

  const std = (c, o) => kit.std(c, o);
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(kit.geo(geometry), material); m.position.set(x, y, z); parent.add(m); return m; };

  // ================================================================= the room (Deaf + Mute see it)
  const room = new THREE.Group(); scene.add(room);
  add(room, new THREE.CircleGeometry(10, 48), std(0x0f1220, { roughness: 1 }), 0, -1.2, 0).rotation.x = -Math.PI / 2;
  const wood = kit.tex(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5d4637'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.06)'; g.fillRect(0, i * 10 + (i * 7) % 5, w, 3 + (i % 3)); }
  }));
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(3, 2);
  add(room, new THREE.BoxGeometry(7.4, 0.3, 4.8), std(0xffffff, { map: wood, roughness: 0.8 }), 0, -0.15, 0);
  add(room, new THREE.BoxGeometry(7.6, 0.06, 5.0), std(0x2a1f18, { roughness: 0.9 }), 0, -0.32, 0);
  const wall = add(room, new THREE.PlaneGeometry(16, 7), std(0x1a1e33, { roughness: 1 }), 0, 2.2, -4.6);
  // shelves + crates on the back wall, to give the room some depth
  [[-3.6, 0.6, -4.2, 1.1, 1.2], [-2.2, 0.35, -4.3, 0.8, 0.7], [3.4, 0.55, -4.2, 1.2, 1.1], [2.0, 0.3, -4.3, 0.7, 0.6]].forEach(([x, y, z, w, h], i) => {
    add(room, new THREE.BoxGeometry(w, h, 0.8), std(i % 2 ? 0x3b3f5c : 0x4a3a2c, { roughness: 0.9 }), x, y, z);
  });
  // a mug, a stack of paper and the desk lamp
  add(room, new THREE.CylinderGeometry(0.16, 0.14, 0.26, 20), std(0xd8d4c8), -2.55, 0.13, 1.55);
  add(room, new THREE.BoxGeometry(0.7, 0.05, 0.9), std(0xece6d2), 2.5, 0.025, 1.45).rotation.y = 0.3;
  add(room, new THREE.BoxGeometry(0.66, 0.05, 0.86), std(0xe2dcc6), 2.52, 0.075, 1.43).rotation.y = 0.2;
  const lampG = new THREE.Group(); lampG.position.set(-2.6, 0, -1.2); room.add(lampG);
  add(lampG, new THREE.CylinderGeometry(0.28, 0.32, 0.08, 20), std(0x2b3046, { metalness: 0.6 }), 0, 0.04, 0);
  add(lampG, new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), std(0x2b3046, { metalness: 0.6 }), 0, 0.8, 0);
  add(lampG, new THREE.ConeGeometry(0.34, 0.36, 24, 1, true), std(0xfacc6b, { side: THREE.DoubleSide, emissive: 0x7a5a10, emissiveIntensity: 0.5 }), 0, 1.6, 0.05);
  add(lampG, new THREE.SphereGeometry(0.11, 12, 8), kit.basic(0xfff0b0), 0, 1.5, 0.05);

  // ================================================================= the bomb (a case with a sloped panel)
  const bomb = new THREE.Group(); bomb.position.copy(BOMB_AT); scene.add(bomb);
  const steel = std(0x2b3046, { metalness: 0.6, roughness: 0.4 });
  add(bomb, new THREE.BoxGeometry(2.8, 0.5, 2.1), steel, 0, 0.25, 0);
  [-1.2, 1.2].forEach((x) => { const st = add(bomb, new THREE.BoxGeometry(0.12, 1.5, 0.12), steel, x, 1.2, -0.52); st.rotation.x = 0.5; });
  const hz = kit.tex(hazardTex());
  add(bomb, new THREE.PlaneGeometry(2.8, 0.1), kit.basic(0xffffff, { map: hz }), 0, 0.2, 1.055);
  [-1.45, 1.45].forEach((x) => { const h = add(bomb, new THREE.TorusGeometry(0.2, 0.035, 8, 20, Math.PI), std(0x7a82a3, { metalness: 0.7 }), x, 0.42, 0.1); h.rotation.set(0, Math.PI / 2, 0); });
  const rig = new THREE.Group(); rig.position.set(0, 1.21, 0.16); rig.rotation.x = -0.55; bomb.add(rig);
  add(rig, new THREE.BoxGeometry(2.56, 1.68, 0.06), std(0x4b5167, { metalness: 0.7, roughness: 0.35 }), 0, 0, -0.01);
  add(rig, new THREE.BoxGeometry(2.4, 1.52, 0.06), std(0x12151f, { roughness: 0.8 }), 0, 0, 0.02);
  [[-1.18, 0.74], [1.18, 0.74], [-1.18, -0.74], [1.18, -0.74]].forEach(([x, y]) => add(rig, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), std(0x8a90a6, { metalness: 0.8 }), x, y, 0.055).rotation.x = Math.PI / 2);
  // header: strike lamps, the time, which module
  const strikeLamps = [-0.95, -0.77, -0.59].map((x) => {
    const m = std(0x3a1a1f, { emissive: 0x000000 }); add(rig, new THREE.SphereGeometry(0.065, 12, 8), m, x, 0.66, 0.08); return m;
  });
  const led = ledScreen(); kit.tex(led.tex);
  const ledPlane = add(rig, new THREE.PlaneGeometry(0.84, 0.23), kit.basic(0xffffff, { map: led.tex }), 0.06, 0.66, 0.065);
  const cntMat = kit.basic(0xffffff, { transparent: true }); const cntPlane = add(rig, new THREE.PlaneGeometry(0.42, 0.2), cntMat, 0.92, 0.66, 0.065);
  let cntKey = '';
  const modRoot = new THREE.Group(); modRoot.position.set(0, -0.1, 0.05); rig.add(modRoot);
  const fogVeil = add(rig, new THREE.PlaneGeometry(2.4, 1.22), kit.basic(0x12151f, { transparent: true, opacity: 0, depthWrite: false }), 0, -0.1, 0.62);
  // the fuse (it burns down as time runs out)
  const fuseCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.15, 0.5, -0.8), new THREE.Vector3(1.2, 1.2, -0.85), new THREE.Vector3(1.45, 1.8, -0.8), new THREE.Vector3(1.2, 2.35, -0.75), new THREE.Vector3(0.85, 2.3, -0.7)]);
  const SEG = 44;
  const fuseGeo = kit.geo(new THREE.TubeGeometry(fuseCurve, SEG, 0.04, 6, false)); const perSeg = fuseGeo.index.count / SEG;
  const fuse = new THREE.Mesh(fuseGeo, std(0xd9b46a, { roughness: 0.8 })); bomb.add(fuse);
  const spark = new THREE.Group(); bomb.add(spark);
  spark.add(new THREE.Mesh(kit.geo(new THREE.SphereGeometry(0.09, 12, 8)), kit.basic(0xfde047)));
  spark.add(new THREE.Mesh(kit.geo(new THREE.SphereGeometry(0.2, 12, 8)), kit.basic(0xfb923c, { transparent: true, opacity: 0.35, depthWrite: false })));
  const sparkLight = new THREE.PointLight(0xff9a3c, 7, 7, 1.8); spark.add(sparkLight);
  let fuseF = -1;
  // the cloth the Mute's bomb is hidden under
  const cloth = add(scene, new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3a3f55, { roughness: 1, flatShading: true }), BOMB_AT.x, 0, BOMB_AT.z);
  cloth.scale.set(1.75, 1.05, 1.5); const clothBase = cloth.scale.clone();

  // ================================================================= the crew
  const chars = {};
  function makeChar(r) {
    const g = new THREE.Group(); scene.add(g);
    const inner = new THREE.Group(); g.add(inner);
    const color = new THREE.Color(ROLE_HEX[r]); const bm = std(color, { roughness: 0.42 });
    add(inner, new THREE.SphereGeometry(0.7, 32, 24), bm, 0, 0.7, 0);
    add(inner, new THREE.SphereGeometry(0.13, 10, 8), kit.basic(0xffffff, { transparent: true, opacity: 0.3 }), -0.28, 1.12, 0.46).scale.set(1.3, 0.7, 0.5);
    const eyeW = kit.basic(0xffffff); const dark = kit.basic(DARK); const eyes = [];
    if (r !== 'blind') {
      [-1, 1].forEach((sx) => {
        const e = new THREE.Group(); e.position.set(sx * 0.25, 0.8, 0.58);
        add(e, new THREE.SphereGeometry(0.15, 14, 10), eyeW); add(e, new THREE.SphereGeometry(0.075, 10, 8), dark, sx * 0.02, 0, 0.12);
        inner.add(e); eyes.push(e);
      });
    }
    const mouths = {};
    if (r !== 'mute') {
      mouths.smile = add(inner, new THREE.TorusGeometry(0.15, 0.028, 8, 18, Math.PI), dark, 0, 0.5, 0.635); mouths.smile.rotation.z = Math.PI;
      mouths.flat = add(inner, new THREE.BoxGeometry(0.3, 0.045, 0.05), dark, 0, 0.45, 0.65);
      mouths.o = add(inner, new THREE.SphereGeometry(0.1, 12, 10), dark, 0, 0.44, 0.64); mouths.o.scale.set(1, 1.25, 0.4);
      mouths.big = add(inner, new THREE.SphereGeometry(0.16, 14, 10), dark, 0, 0.45, 0.63); mouths.big.scale.set(1.35, 1, 0.4);
      Object.values(mouths).forEach((m) => { m.visible = false; });
    }
    if (r === 'blind') {
      add(inner, new THREE.CylinderGeometry(0.735, 0.735, 0.3, 28, 1, true), std(0x1f2937, { side: THREE.DoubleSide }), 0, 0.82, 0);
      [-1, 1].forEach((sx) => { const t = add(inner, new THREE.BoxGeometry(0.22, 0.07, 0.05), std(0x1f2937), sx * 0.2, 0.82, -0.76); t.rotation.z = sx * 0.5; });
    }
    if (r === 'mute') {
      add(inner, new THREE.BoxGeometry(0.5, 0.2, 0.05), std(0xe5e7eb), 0, 0.46, 0.665);
      [0.55, -0.55].forEach((a) => { add(inner, new THREE.BoxGeometry(0.34, 0.03, 0.02), kit.basic(0x6b7280), 0, 0.46, 0.7).rotation.z = a; });
    }
    if (r === 'deaf') {
      const band = std(0x374151);
      add(inner, new THREE.TorusGeometry(0.75, 0.05, 8, 32, Math.PI), band, 0, 0.74, 0);
      [-1, 1].forEach((sx) => { add(inner, new THREE.CylinderGeometry(0.21, 0.21, 0.15, 18), band, sx * 0.73, 0.74, 0).rotation.z = Math.PI / 2; });
    }
    add(inner, new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), std(0xa16207), 0.1, 1.44, 0).rotation.z = -0.5;
    add(inner, new THREE.SphereGeometry(0.07, 8, 6), kit.basic(0xfde047), 0.2, 1.54, 0);
    chars[r] = { g, inner, bm, color, eyes, mouths, phase: Math.random() * 6, side: 0 };
  }
  ['blind', 'deaf', 'mute'].forEach(makeChar);

  // ================================================================= the Mute's book
  const bookG = new THREE.Group(); bookG.position.copy(BOOK_AT); scene.add(bookG);
  const cover = add(bookG, new THREE.BoxGeometry(1, 0.1, 1), std(0x6b3a2a, { roughness: 0.7 }));
  const pages = add(bookG, new THREE.BoxGeometry(1, 0.07, 1), std(0xf0e8d2, { roughness: 0.9 }), 0, 0.04, 0);
  const bookEl = document.createElement('div'); bookEl.className = 'bk3d';
  let css = null; let cssObj = null; let cssCam = null; let K = 100; let pageW = 300; let pageH = 300;
  function ensureCss() {
    if (css) return;
    css = new CSS3DRenderer(); css.domElement.className = 'w3css'; css.domElement.style.pointerEvents = 'none'; host.appendChild(css.domElement);
    cssObj = new CSS3DObject(bookEl); cssObj.rotation.x = -Math.PI / 2;
    const cssScene = new THREE.Scene(); cssScene.add(cssObj); css.scene = cssScene;
    cssCam = new THREE.PerspectiveCamera(40, 1, 1, 100000);
  }

  // ================================================================= effects
  const sparks = makePool(60, { size: 0.1 }); scene.add(sparks.pts);
  const burst = makePool(190, { size: 0.17 }); burst.grav = 7; scene.add(burst.pts);
  const fireball = add(scene, new THREE.SphereGeometry(1, 24, 16), kit.basic(0xfb923c, { transparent: true, opacity: 0, depthWrite: false }));
  fireball.visible = false; fireball.position.set(0, 0.9, BOMB_AT.z);
  const tmpC = new THREE.Color();

  // ================================================================= state
  let model = null; let mood = 'calm'; let moodAt = 0; let at = Date.now();
  let shake = 0; let flash = 0; let boomAt = 0; let frames = 0; let disposed = false; let tBuilt = 0;
  let size = { w: 300, h: 300 };
  let cur = { sig: '', mod: null, kind: '', born: 0 };
  let hits = [];
  const camPos = RIG[role].pos.clone(); const camLook = RIG[role].look.clone(); let camFrom = null; let camT = 1;
  let orbit = { yaw: 0, pitch: 0, dragging: false, x: 0, y: 0, id: null };

  function fireworks() {
    const cols = ['#fb9250', '#4fd1c1', '#a99cf7', '#fde047', '#f472b6', '#60a5fa'].map((c) => new THREE.Color(c));
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2; const sp = 1.2 + Math.random() * 2.6;
      emit(burst, (Math.random() - 0.5) * 5, 2.6 + Math.random() * 0.6, (Math.random() - 0.5) * 3, Math.cos(a) * sp * 0.5, 1 + Math.random() * 2.2, Math.sin(a) * sp * 0.4, 1.8 + Math.random() * 1.2, cols[i % cols.length]);
    }
  }
  function explode() {
    const cols = ['#fb923c', '#fde047', '#ef4444', '#9ca3af'].map((c) => new THREE.Color(c));
    for (let i = 0; i < 180; i++) {
      const a = Math.random() * Math.PI * 2; const b = (Math.random() - 0.3) * Math.PI; const sp = 3 + Math.random() * 6;
      emit(burst, 0, 0.9, BOMB_AT.z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp, 0.8 + Math.random() * 1.1, cols[i % cols.length]);
    }
    boomAt = performance.now(); shake = 1.4; flash = 1.2;
  }
  function setMood(next) {
    if (next === mood) return;
    mood = next; moodAt = performance.now();
    if (next === 'hit') { shake = 0.8; flash = 1; }
    else if (next === 'win') fireworks();
    else if (next === 'lose') explode();
  }

  // ---- the module (rebuilt when the puzzle or its state changes)
  function disposeModule() {
    if (!cur.b) return;
    cur.b.group.parent && cur.b.group.parent.remove(cur.b.group);
    cur.b.kit.dispose(); cur.b = null; hits = [];
  }
  function buildModule(m) {
    disposeModule();
    const feel = role === 'blind';
    if (!m.mod) return;
    const b = feel ? buildFeel(m.mod, m.game) : buildSee(m.mod);
    (feel ? scene : modRoot).add(b.group);
    cur.b = b; cur.born = performance.now(); hits = b.hits;
  }

  // ---- role: what is visible, the light, the camera
  function applyRole(first) {
    const blind = role === 'blind'; const mute = role === 'mute'; const deaf = role === 'deaf';
    room.visible = !blind; bomb.visible = deaf; cloth.visible = mute; bookG.visible = mute;
    cloth.scale.copy(clothBase).multiplyScalar(mute ? 0.4 : 1); cloth.position.z = mute ? -0.7 : BOMB_AT.z;
    scene.background.setHex(BG[role]); scene.fog.color.setHex(BG[role]);
    hemi.visible = key.visible = lampLight.visible = !blind;
    Object.values(chars).forEach((c) => { c.g.visible = false; });
    const slots = deaf ? [['blind', -2.05], ['mute', 2.05]] : mute ? [['blind', -1.3], ['deaf', 1.3]] : [];
    slots.forEach(([r, x]) => {
      const c = chars[r]; c.g.visible = true; c.g.position.set(x, 0, deaf ? -1.1 : -0.7); c.g.rotation.y = x < 0 ? 0.55 : -0.55; c.g.scale.setScalar(deaf ? 0.8 : 0.42);
    });
    ensureCssIfNeeded();
    if (css) css.domElement.style.display = mute ? '' : 'none';
    canvas.style.touchAction = blind ? 'none' : 'pan-y';
    camFrom = { pos: camera.position.clone(), look: camLook.clone() }; camT = first ? 1 : 0;
    cur.sig = ''; disposeModule();
    fit();
  }
  const ensureCssIfNeeded = () => { if (role === 'mute') ensureCss(); };

  function fit() {
    size = { w: host.clientWidth || 300, h: host.clientHeight || 300 };
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    const rig = RIG[role]; const dist = rig.pos.distanceTo(rig.look);
    camera.fov = role === 'mute' ? 20 : Math.min(72, Math.max(30, (2 * Math.atan(rig.fitW / 2 / camera.aspect / dist) * 180) / Math.PI));
    camera.updateProjectionMatrix();
    if (role === 'mute' && css) {
      css.setSize(size.w, size.h);
      // 1 CSS pixel of the page = 1 screen pixel when the page faces the camera: so the manual is as readable as in the interface
      const p = size.h / 2 / Math.tan((camera.fov * Math.PI) / 360);
      const axis = RIG.mute.look.clone().sub(RIG.mute.pos).normalize();
      const d = BOOK_AT.clone().sub(RIG.mute.pos).dot(axis); K = p / d;
      pageW = Math.round(size.w * 0.92); pageH = Math.round(size.h * (size.h < 330 ? 0.94 : 0.84));
      bookEl.style.width = `${pageW}px`; bookEl.style.height = `${pageH}px`;
      cssObj.position.set(BOOK_AT.x * K, (BOOK_AT.y + 0.07) * K, BOOK_AT.z * K);
      cover.scale.set((pageW / K) * 1.04, 1, (pageH / K) * 1.05); pages.scale.set((pageW / K) * 1.0, 1, (pageH / K) * 1.0);
    }
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(host); else window.addEventListener('resize', fit);

  // ================================================================= the Blind's touch
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const press = { mesh: null, id: null, t0: 0, timer: 0, revealed: false, held: false };
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    return hit ? hit.object : null;
  }
  function pressEnd(fire) {
    const { mesh: m, t0, revealed } = press;
    clearTimeout(press.timer); onReveal(null);
    if (m && m.userData.visual) m.userData.visual.scale.setScalar(1);
    Object.assign(press, { mesh: null, id: null, revealed: false, held: false });
    if (!(fire && m && !revealed)) return;
    const d = m.userData; const held = Date.now() - t0;
    if (d.tact === 'btn') onAction({ type: 'btn', held });
    else if (d.tact === 'key') onAction({ type: 'key', d: d.d });
    else onAction({ type: d.tact, i: d.i });
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (role === 'blind') {
      const m = pick(e); if (!m) return;
      pressEnd(false);
      Object.assign(press, { mesh: m, id: e.pointerId, t0: Date.now(), revealed: false, held: false });
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (m.userData.visual) m.userData.visual.scale.setScalar(0.94);
      if (m.userData.tact === 'btn') press.timer = setTimeout(() => { press.held = true; onBuzz(35); if (press.mesh && press.mesh.userData.visual) press.mesh.userData.visual.scale.setScalar(1.05); }, HOLD_MS);
      else if (m.userData.reveal) press.timer = setTimeout(() => { press.revealed = true; onReveal(m.userData.reveal); onBuzz(20); }, LONG_PRESS);
    } else if (role === 'deaf') {
      orbit = { ...orbit, dragging: true, x: e.clientX, y: e.clientY, id: e.pointerId };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (orbit.dragging && e.pointerId === orbit.id) {
      orbit.yaw = Math.max(-0.5, Math.min(0.5, orbit.yaw - (e.clientX - orbit.x) * 0.004));
      orbit.pitch = Math.max(-0.2, Math.min(0.25, orbit.pitch + (e.clientY - orbit.y) * 0.003));
      orbit.x = e.clientX; orbit.y = e.clientY;
    }
  });
  const up = (e, fire) => {
    if (press.mesh && e.pointerId === press.id) pressEnd(fire);
    if (orbit.dragging && e.pointerId === orbit.id) orbit.dragging = false;
  };
  canvas.addEventListener('pointerup', (e) => up(e, true));
  canvas.addEventListener('pointercancel', (e) => up(e, false));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ================================================================= every frame
  function step(dt, t) {
    if (!model) return;
    const now = Date.now();
    setMood(moodOf(model, now));
    const playing = model.status === 'playing';
    const rem = playing && model.started ? Math.max(0, model.rem - (now - at)) : model.rem;
    const since = (performance.now() - moodAt) / 1000;
    const lost = mood === 'lose'; const won = mood === 'win';
    const blind = role === 'blind'; const deaf = role === 'deaf';

    // module (rebuild when it changes)
    const sig = `${role}|${model.round}|${model.cur}|${blind ? `${model.game.x}|${model.game.e}|${model.game.p}` : ''}`;
    if (sig !== cur.sig) { cur.sig = sig; buildModule(model); }
    const fogKey = `${model.round}|${model.cur}|${model.strikes}`;      // like the interface's bomb: a new module or a mistake starts the cycle again, bomb in view
    if (fogKey !== cur.fogKey) { cur.fogKey = fogKey; tBuilt = performance.now(); }
    if (cur.b) {
      cur.b.tick(now);
      const k = ease((performance.now() - cur.born) / 350);
      cur.b.group.position.z = blind ? 0 : 0; cur.b.group.scale.setScalar(0.85 + 0.15 * k);
    }
    // the fog levels: the bomb vanishes for a while every ten seconds
    if (deaf) {
      const ph = ((performance.now() - tBuilt) / 10000) % 1;
      const a = ph < 0.56 ? 0 : ph < 0.62 ? (ph - 0.56) / 0.06 : ph < 0.86 ? 1 : ph < 0.92 ? 1 - (ph - 0.86) / 0.06 : 0;
      fogVeil.material.opacity = model.fog ? a : 0;
    }

    // the bomb
    if (deaf) {
      led.draw(won ? 'OK' : fmt(rem), won ? '#6ee7a1' : '#ff5a4d');
      const cn = `${model.cur + 1}/${model.n}`;
      if (cn !== cntKey) { cntKey = cn; cntMat.map && cntMat.map.dispose(); cntMat.map = canvasTex(160, 80, (g, w, h) => { g.fillStyle = '#04100a'; g.fillRect(0, 0, w, h); g.fillStyle = '#8ff0a4'; g.font = '800 46px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(cn, w / 2, h / 2 + 2); }); cntMat.needsUpdate = true; }
      strikeLamps.forEach((m, i) => { const on = i < model.strikes; m.color.set(on ? 0xff4d4d : 0x3a1a1f); m.emissive.set(on ? 0xff2020 : 0x000000); m.emissiveIntensity = on ? 1.6 : 0; });
      const f = !playing ? 1 : clamp01(rem / model.total); const fk = Math.round(f * 400) / 400;
      if (fk !== fuseF) { fuseF = fk; fuseGeo.setDrawRange(0, Math.max(0, Math.round(SEG * f)) * perSeg); spark.position.copy(fuseCurve.getPoint(f)); }
      const burning = !won && !lost;
      spark.visible = burning; fuse.visible = !lost;
      sparkLight.intensity = burning ? 6 + Math.sin(t * 40) * 2 + Math.random() * 2 : 0;
      if (burning && Math.random() < 0.9) {
        const sp = spark.position;
        emit(sparks, bomb.position.x + sp.x, bomb.position.y + sp.y, bomb.position.z + sp.z, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.35, tmpC.set(Math.random() < 0.5 ? '#ffc766' : '#ff8a3c'));
      }
      bomb.visible = !lost;
      bomb.rotation.z = mood === 'hit' ? Math.sin(t * 50) * 0.02 * Math.exp(-since * 5) : 0;
    } else { sparkLight.intensity = 0; }
    if (role === 'mute') { cloth.visible = !lost; }

    // the crew
    Object.values(chars).forEach((c) => {
      if (!c.g.visible) return;
      const p = t * 2 + c.phase; let y = 0; let sx = 1; let sy = 1; let rz = 0; let jx = 0;
      if (mood === 'calm') y = Math.sin(p) * 0.04 + 0.04;
      else if (mood === 'tense') { jx = Math.sin(t * 38 + c.phase) * 0.025; y = Math.abs(Math.sin(p * 3)) * 0.03; }
      else if (mood === 'hit') { const e = Math.exp(-since * 4.5); sy = 1 - 0.22 * e; sx = 1 + 0.16 * e; y = Math.max(0, Math.sin(since * 9)) * 0.25 * e; }
      else if (mood === 'cheer' || mood === 'win') y = Math.abs(Math.sin(t * 7 + c.phase)) * (mood === 'win' ? 0.55 : 0.4);
      else if (mood === 'lose') { const k = clamp01(since * 3); rz = (c.g.position.x >= 0 ? -1 : 1) * 1.25 * k; y = -0.1 * k; sy = 1 - 0.1 * k; }
      c.inner.position.set(jx, y, 0); c.inner.scale.set(sx, sy, sx); c.inner.rotation.z = rz;
      const squint = mood === 'hit' || mood === 'cheer' || mood === 'win' || mood === 'lose';
      c.eyes.forEach((e) => { e.scale.y = squint ? 0.18 : mood === 'tense' ? 1.3 : 1; e.scale.x = mood === 'tense' ? 1.15 : 1; });
      const m = c.mouths;
      if (m.smile) { m.smile.visible = mood === 'calm'; m.flat.visible = mood === 'tense' || mood === 'lose'; m.o.visible = mood === 'hit'; m.big.visible = mood === 'cheer' || mood === 'win'; }
      tmpC.copy(c.color); if (lost) tmpC.multiplyScalar(0.35); c.bm.color.lerp(tmpC, 0.2);
    });

    // light, flash, shake
    flash *= Math.exp(-dt * 4.5); shake *= Math.exp(-dt * 5);
    alarm.intensity = flash * 50; happy.intensity = won ? 16 + Math.sin(t * 6) * 4 : 0;
    scene.background.setHex(BG[role]);
    if (blind) scene.background.r = Math.min(0.35, flash * 0.3);          // the Blind's black screen blushes red for a moment on a mistake
    else if (flash > 0.02) scene.background.lerp(tmpC.set(0x4a1218), Math.min(0.5, flash * 0.4));

    // camera: ease to the role's seat, then a little breathing / shake / the Deaf's drag
    const rig = RIG[role];
    if (camFrom && camT < 1) { camT = Math.min(1, camT + dt / 0.7); const k = ease(camT); camPos.lerpVectors(camFrom.pos, rig.pos, k); camLook.lerpVectors(camFrom.look, rig.look, k); }
    else { camPos.copy(rig.pos); camLook.copy(rig.look); }
    if (!orbit.dragging) { orbit.yaw *= Math.exp(-dt * 2.5); orbit.pitch *= Math.exp(-dt * 2.5); }
    const off = camPos.clone().sub(camLook);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit.yaw); off.y += orbit.pitch * off.length() * 0.6;
    camera.position.copy(camLook).add(off);
    camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.22 + (role === 'deaf' ? Math.sin(t * 0.5) * 0.03 : 0);
    camera.lookAt(camLook);

    if (boomAt) {
      const e = (performance.now() - boomAt) / 1000;
      fireball.visible = e < 0.9 && !blind; fireball.scale.setScalar(0.4 + e * 4.2); fireball.material.opacity = Math.max(0, 1 - e / 0.9) * 0.9;
    }
    stepPool(sparks, dt); stepPool(burst, dt);
  }

  let raf = 0; let last = 0;
  function frame(ts) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || ts - last < 16) return;
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    step(dt, ts / 1000);
    renderer.render(scene, camera);
    if (css && role === 'mute') {
      cssCam.position.copy(camera.position).multiplyScalar(K); cssCam.quaternion.copy(camera.quaternion);
      cssCam.fov = camera.fov; cssCam.aspect = camera.aspect; cssCam.updateProjectionMatrix(); cssCam.updateMatrixWorld();
      css.render(css.scene, cssCam);
    }
    frames += 1;
  }
  tBuilt = performance.now();
  applyRole(true);
  raf = requestAnimationFrame(frame);

  // the screen position of a touchable thing (the tests use it to touch what a player would touch)
  function screenOf(match) {
    const h = hits.find((m) => Object.keys(match).every((k) => m.userData[k] === match[k]));
    if (!h) return null;
    h.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(h); const c = box.getCenter(new THREE.Vector3()).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height };
  }

  return {
    canvas, bookEl,
    update(m) {
      model = m; at = Date.now();
      if (m.role !== role) { role = m.role; applyRole(); }
    },
    stats: () => ({ frames, mood, role, hits: hits.length, mode: cur.b ? 'module' : 'none', veil: +fogVeil.material.opacity.toFixed(2), book: !!(css && role === 'mute') }),
    screenOf,
    // where the book is on the screen: from the 3D scene (cover mesh) and from the page element (the tests compare them)
    bookRects() {
      const r = canvas.getBoundingClientRect(); const b = bookEl.getBoundingClientRect();
      const c = BOOK_AT.clone().project(camera);
      return { scene: { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height }, page: { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }, host: { l: r.left, t: r.top, w: r.width, h: r.height }, K, pageW, pageH };
    },
    destroy() {
      disposed = true; cancelAnimationFrame(raf); clearTimeout(press.timer); onReveal(null);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', fit);
      disposeModule(); kit.dispose(); if (cntMat.map) cntMat.map.dispose();
      [sparks, burst].forEach((p) => { p.geo.dispose(); p.mat.dispose(); });
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      canvas.remove(); if (css) css.domElement.remove();
    },
  };
}
