// world3d.js — the 3D way to play: one small workshop, three people, and the puzzle is made of real objects. Loaded only when somebody
// picks "3D".
//
//   Blind — IS the one sitting in front of the bomb (he cuts the wires and presses the buttons), but in the dark: the bomb is only a
//           faint outline with the module's parts on it as touchable shapes + braille. A tap does the thing (the wire really snaps),
//           a long press shows the number, the big button reports how long it was held.
//   Deaf  — stands behind the Blind and SEES the bomb: the sloped panel with the module built from real, coloured parts. In the
//           same room the Blind sits at the bomb with his hands resting on the table, and the Mute stands at a high desk at the back.
//   Mute  — stands at that desk and reads a real open book (two pages, he turns them). A long press puts the book down on the desk:
//           he sees the room around him (the back of the bomb, the Deaf, the Blind), has two hands with five fingers to make numbers
//           and signs with, and turns his head by dragging. The Deaf sees all of that on his character, and the Mute sees the Deaf's head.
//

// It is only a view of the shared game state (same rules as the interface); nothing here decides anything.
import * as THREE from '../vendor/three.module.min.js';
import { CSS3DRenderer, CSS3DObject } from '../vendor/CSS3DRenderer.js';
import { HOLD_MS } from './engine.js';
import { fmt } from './ui.js';
import { moodOf, ROLE_HEX } from './scene.js';
import { buildSee, buildFeel } from './world-modules.js';
import { makeBook } from './world-book.js';
import { createSpread } from './bookspread.js';
import { makeHand, makeArm, countOf, raised, SIGNS, FLIP, UP } from './world-hands.js';
import { t } from './i18n.js';
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

// the bomb: a case with a tall panel hinged on top of it and leaning back
const BOMB_AT = new THREE.Vector3(0.86, 0, -0.07);
const PANEL_W = 2.56; const PANEL_H = 2.16; const LEAN = 0.55;
const PIVOT = new THREE.Vector3(0, 0.5, 0.6);                                   // the hinge, on the case (bomb coordinates)
const PC = new THREE.Vector3(0, PIVOT.y + (PANEL_H / 2) * Math.cos(LEAN), PIVOT.z - (PANEL_H / 2) * Math.sin(LEAN));   // middle of the panel
const NRM = new THREE.Vector3(0, Math.sin(LEAN), Math.cos(LEAN));               // which way the panel faces
const PANEL_WORLD = BOMB_AT.clone().add(PC);
const HEADER_Y = 0.86; const MOD_Y = -0.15;                                     // on the panel: the header strip, the middle of the module area
const SEE_SCALE = 1.12; const FEEL_SCALE = 0.8;

// The crew sits around the bomb like in the original game, all on the same level (nobody is raised): the Blind in front of the bomb, the Deaf on the Blind's left,
// the Mute across from the Deaf. The bomb stands off to the Blind's side, so the line between the Deaf and the Mute (that is how the signs travel) is wide open:
// the Deaf sees the Mute ahead of him and the bomb on his right; the Mute sees the Deaf ahead and the back of the bomb beside him.
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const BOMB_YAW = -0.4;
const CREW_SC = 1.2; const MUTE_AT_X = -0.81; const MUTE_AT_Z = -2.18;
const BLIND_AT = new THREE.Vector3(0.9, 0, 2.5); const DEAF_AT = new THREE.Vector3(-1.8, 0, 2.6);
const faceBomb = (p) => Math.atan2(BOMB_AT.x - p.x, BOMB_AT.z - p.z);
const PANEL_TURNED = PANEL_WORLD.clone().sub(BOMB_AT).applyAxisAngle(Y_AXIS, BOMB_YAW).add(BOMB_AT);   // the middle of the panel once the bomb is turned
const NRM_TURNED = NRM.clone().applyAxisAngle(Y_AXIS, BOMB_YAW);
// where the camera sits for each role (the fov is worked out from the size of the screen; the Mute's is worked out in fit())
const DEAF_EYE = DEAF_AT.clone().add(new THREE.Vector3(0, 0.8 * CREW_SC + 0.1, 0));
const DEAF_AIM = new THREE.Vector3().lerpVectors(PANEL_TURNED, new THREE.Vector3(MUTE_AT_X, 1.2, MUTE_AT_Z), 0.38);   // between the bomb and the Mute: he sees both, and the Mute's signs
const DEAF_HFOV = 72;                                                           // how wide his picture opens (degrees, across)
const RIG = {
  deaf: { pos: DEAF_EYE.clone(), look: DEAF_AIM.clone(), fitW: 2 * Math.tan((DEAF_HFOV * Math.PI) / 360) * DEAF_EYE.distanceTo(DEAF_AIM) },     // his own eyes: where his character stands for the Mute
  blind: { pos: PANEL_TURNED.clone().addScaledVector(NRM_TURNED, 3.9), look: PANEL_TURNED.clone(), fitW: 2.72 },
  mute: { pos: new THREE.Vector3(0, 9, 8), look: new THREE.Vector3(0, 0.5, 1), fitW: 0 },      // (the Mute's is worked out in fit())
};
const BOOK_TILT = 0.5;                                                          // the Mute's book leans back this much on its stand
// the Mute: across from the other two on the same floor; his eyes, and where he looks when the book is down (at the bomb, the Deaf and the Blind beside it)
const DESK_Y = 0; const MUTE_AT = new THREE.Vector3(MUTE_AT_X, DESK_Y, MUTE_AT_Z); const MUTE_SC = CREW_SC;
const BOOK_AT = new THREE.Vector3(MUTE_AT.x, DESK_Y, MUTE_AT.z + 0.8);
const EYE = new THREE.Vector3(MUTE_AT.x, DESK_Y + 1.15, MUTE_AT.z - 0.35);
const DESK_FOV = 70; const DESK_LOOK = new THREE.Vector3().lerpVectors(DEAF_AT, BOMB_AT, 0.4).setY(1.0);
// his hands: where they are when he holds the book, rests on the desk, or shows a number / a sign (in his character's own frame)
const HAND_POS = { hold: { l: [0.46, 0.5, 0.95], r: [-0.46, 0.5, 0.95] }, rest: { l: [0.62, 0.3, 0.8], r: [-0.62, 0.3, 0.8] }, show: { l: [0.95, 1.3, 0.55], r: [-0.95, 1.3, 0.55] } };
const MUTE_FOV = 22; const MUTE_DIST = 9.5; const MUTE_ELEV = 0.55; const MUTE_FILL = 0.8; const MUTE_SHIFT = 0.03;   // how the Mute looks at his book

export function createWorld(host, opts) {
  const { onAction = () => {}, onReveal = () => {}, onBuzz = () => {}, onPose = () => {} } = opts;
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
  const lampLight = new THREE.PointLight(0xffb766, 14, 10, 1.5); lampLight.position.set(3.0, 1.9, -2.4); scene.add(lampLight);
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
  add(room, new THREE.BoxGeometry(7.4, 0.3, 8.8), std(0xffffff, { map: wood, roughness: 0.8 }), 0, -0.15, -0.2);
  add(room, new THREE.BoxGeometry(7.6, 0.06, 9.0), std(0x2a1f18, { roughness: 0.9 }), 0, -0.32, -0.2);
  const wall = add(room, new THREE.PlaneGeometry(16, 7), std(0x1a1e33, { roughness: 1 }), 0, 2.2, -4.6);
  // shelves + crates on the back wall, to give the room some depth
  [[-3.6, 0.6, -4.2, 1.1, 1.2], [-2.2, 0.35, -4.3, 0.8, 0.7], [3.4, 0.55, -4.2, 1.2, 1.1], [2.0, 0.3, -4.3, 0.7, 0.6]].forEach(([x, y, z, w, h], i) => {
    add(room, new THREE.BoxGeometry(w, h, 0.8), std(i % 2 ? 0x3b3f5c : 0x4a3a2c, { roughness: 0.9 }), x, y, z);
  });
  // a mug, a stack of paper and the desk lamp
  add(room, new THREE.CylinderGeometry(0.16, 0.14, 0.26, 20), std(0xd8d4c8), -3.3, 0.13, 0.3);
  add(room, new THREE.BoxGeometry(0.7, 0.05, 0.9), std(0xece6d2), 3.0, 0.025, 2.6).rotation.y = 0.3;
  add(room, new THREE.BoxGeometry(0.66, 0.05, 0.86), std(0xe2dcc6), 3.02, 0.075, 2.58).rotation.y = 0.2;
  const lampG = new THREE.Group(); lampG.position.set(3.2, 0, -2.6); room.add(lampG);
  add(lampG, new THREE.CylinderGeometry(0.28, 0.32, 0.08, 20), std(0x2b3046, { metalness: 0.6 }), 0, 0.04, 0);
  add(lampG, new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), std(0x2b3046, { metalness: 0.6 }), 0, 0.8, 0);
  add(lampG, new THREE.ConeGeometry(0.34, 0.36, 24, 1, true), std(0xfacc6b, { side: THREE.DoubleSide, emissive: 0x7a5a10, emissiveIntensity: 0.5 }), 0, 1.6, 0.05);
  add(lampG, new THREE.SphereGeometry(0.11, 12, 8), kit.basic(0xfff0b0), 0, 1.5, 0.05);

  // ================================================================= the bomb (a case with a tall panel hinged on top of it)
  const bomb = new THREE.Group(); bomb.position.copy(BOMB_AT); bomb.rotation.y = BOMB_YAW; scene.add(bomb);
  const steel = std(0x2b3046, { metalness: 0.6, roughness: 0.4 });
  add(bomb, new THREE.BoxGeometry(2.8, 0.5, 2.1), steel, 0, 0.25, 0);
  const hz = kit.tex(hazardTex());
  add(bomb, new THREE.PlaneGeometry(2.8, 0.1), kit.basic(0xffffff, { map: hz }), 0, 0.2, 1.055);
  [-1.45, 1.45].forEach((x) => { const h = add(bomb, new THREE.TorusGeometry(0.2, 0.035, 8, 20, Math.PI), std(0x7a82a3, { metalness: 0.7 }), x, 0.42, 0.1); h.rotation.set(0, Math.PI / 2, 0); });
  [-0.9, 0.9].forEach((x) => add(bomb, new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14), std(0x7a82a3, { metalness: 0.8 }), x, 0.56, PIVOT.z).rotation.z = Math.PI / 2);   // the hinge
  const rig = new THREE.Group(); rig.position.copy(PC); rig.rotation.x = -LEAN; bomb.add(rig);
  add(rig, new THREE.BoxGeometry(PANEL_W, PANEL_H, 0.06), std(0x4b5167, { metalness: 0.7, roughness: 0.35 }), 0, 0, -0.01);
  add(rig, new THREE.BoxGeometry(PANEL_W - 0.16, PANEL_H - 0.16, 0.06), std(0x12151f, { roughness: 0.8 }), 0, 0, 0.02);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => add(rig, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), std(0x8a90a6, { metalness: 0.8 }), sx * (PANEL_W / 2 - 0.1), sy * (PANEL_H / 2 - 0.1), 0.055).rotation.x = Math.PI / 2));
  [-1.2, 1.2].forEach((x) => add(rig, new THREE.BoxGeometry(0.1, PANEL_H * 0.9, 0.1), steel, x, -0.1, -0.13));   // the bars behind the panel
  // header: strike lamps, the time, which module
  const strikeLamps = [-0.95, -0.77, -0.59].map((x) => {
    const m = std(0x3a1a1f, { emissive: 0x000000 }); add(rig, new THREE.SphereGeometry(0.065, 12, 8), m, x, HEADER_Y, 0.08); return m;
  });
  const led = ledScreen(); kit.tex(led.tex);
  add(rig, new THREE.PlaneGeometry(0.84, 0.23), kit.basic(0xffffff, { map: led.tex }), 0.06, HEADER_Y, 0.065);
  const cntMat = kit.basic(0xffffff, { transparent: true }); add(rig, new THREE.PlaneGeometry(0.42, 0.2), cntMat, 0.92, HEADER_Y, 0.065);
  let cntKey = '';
  const modRoot = new THREE.Group(); modRoot.position.set(0, MOD_Y, 0.05); rig.add(modRoot);
  const fogVeil = add(rig, new THREE.PlaneGeometry(2.4, 1.74), kit.basic(0x12151f, { transparent: true, opacity: 0, depthWrite: false }), 0, MOD_Y, 0.62);
  // the fuse (it burns down as time runs out)
  const fuseCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.15, 0.5, -0.8), new THREE.Vector3(1.2, 1.4, -0.95), new THREE.Vector3(1.5, 2.2, -0.9), new THREE.Vector3(1.25, 2.85, -0.85), new THREE.Vector3(0.85, 2.8, -0.8)]);
  const SEG = 44;
  const fuseGeo = kit.geo(new THREE.TubeGeometry(fuseCurve, SEG, 0.04, 6, false)); const perSeg = fuseGeo.index.count / SEG;
  const fuse = new THREE.Mesh(fuseGeo, std(0xd9b46a, { roughness: 0.8 })); bomb.add(fuse);
  const spark = new THREE.Group(); bomb.add(spark);
  spark.add(new THREE.Mesh(kit.geo(new THREE.SphereGeometry(0.09, 12, 8)), kit.basic(0xfde047)));
  spark.add(new THREE.Mesh(kit.geo(new THREE.SphereGeometry(0.2, 12, 8)), kit.basic(0xfb923c, { transparent: true, opacity: 0.35, depthWrite: false })));
  const sparkLight = new THREE.PointLight(0xff9a3c, 7, 7, 1.8); spark.add(sparkLight);
  let fuseF = -1;

  // ---- the same bomb as the Blind knows it: only its edges, in the dark
  const feel = new THREE.Group(); feel.position.copy(BOMB_AT); feel.rotation.y = BOMB_YAW; scene.add(feel);
  const lineM = kit.basic(0x5a6390, { transparent: true, opacity: 0.8, depthWrite: false });
  const dimM = kit.basic(0x2c3354, { transparent: true, opacity: 0.7, depthWrite: false });
  const thin = (parent, w, h, d, mat, x, y, z) => add(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const outlineBox = (parent, w, h, d, th, mat, x, y, z) => {
    [-1, 1].forEach((a) => (d > 0.01 ? [-1, 1] : [1]).forEach((b) => {
      thin(parent, w, th, th, mat, x, y + a * h / 2, z + b * d / 2); thin(parent, th, h, th, mat, x + a * w / 2, y, z + b * d / 2); if (d > 0.01) thin(parent, th, th, d, mat, x + a * w / 2, y + b * h / 2, z);
    }));
  };
  outlineBox(feel, 2.8, 0.5, 2.1, 0.028, lineM, 0, 0.25, 0);
  [-0.9, 0.9].forEach((x) => thin(feel, 0.1, 0.1, 0.1, dimM, x, 0.55, PIVOT.z));
  const feelRig = new THREE.Group(); feelRig.position.copy(PC); feelRig.rotation.x = -LEAN; feel.add(feelRig);
  const plate = add(feelRig, new THREE.PlaneGeometry(PANEL_W - 0.16, PANEL_H - 0.16), kit.basic(0x0b0e1c, { transparent: true, opacity: 0.88 }), 0, 0, 0.005); plate.renderOrder = -1;   // it hides the far edges of the case behind it
  outlineBox(feelRig, PANEL_W, PANEL_H, 0.04, 0.03, lineM, 0, 0, 0);
  outlineBox(feelRig, PANEL_W - 0.16, PANEL_H - 0.16, 0.0, 0.014, dimM, 0, 0, 0.03);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => add(feelRig, new THREE.RingGeometry(0.03, 0.055, 14), lineM, sx * (PANEL_W / 2 - 0.1), sy * (PANEL_H / 2 - 0.1), 0.03)));
  [-0.95, -0.77, -0.59].forEach((x) => add(feelRig, new THREE.RingGeometry(0.05, 0.07, 18), dimM, x, HEADER_Y, 0.03));
  outlineBox(feelRig, 0.84, 0.23, 0.0, 0.012, dimM, 0.06, HEADER_Y, 0.03);
  outlineBox(feelRig, 0.42, 0.2, 0.0, 0.012, dimM, 0.92, HEADER_Y, 0.03);
  const feelRoot = new THREE.Group(); feelRoot.position.set(0, MOD_Y, 0.05); feelRig.add(feelRoot);

  // ================================================================= the crew
  const chars = {};
  function makeChar(r) {
    const g = new THREE.Group(); scene.add(g);
    const inner = new THREE.Group(); g.add(inner);
    const head = new THREE.Group(); head.position.y = 0.7; inner.add(head);              // the blob is the head: it turns and nods (a pose) on its own
    const hin = new THREE.Group(); hin.position.y = -0.7; head.add(hin);
    const color = new THREE.Color(ROLE_HEX[r]); const bm = std(color, { roughness: 0.42 });
    add(hin, new THREE.SphereGeometry(0.7, 32, 24), bm, 0, 0.7, 0);
    add(hin, new THREE.SphereGeometry(0.13, 10, 8), kit.basic(0xffffff, { transparent: true, opacity: 0.3 }), -0.28, 1.12, 0.46).scale.set(1.3, 0.7, 0.5);
    const eyeW = kit.basic(0xffffff); const dark = kit.basic(DARK); const eyes = [];
    if (r !== 'blind') {
      [-1, 1].forEach((sx) => {
        const e = new THREE.Group(); e.position.set(sx * 0.25, 0.8, 0.58);
        add(e, new THREE.SphereGeometry(0.15, 14, 10), eyeW); add(e, new THREE.SphereGeometry(0.075, 10, 8), dark, sx * 0.02, 0, 0.12);
        hin.add(e); eyes.push(e);
      });
    }
    const mouths = {};
    if (r !== 'mute') {
      mouths.smile = add(hin, new THREE.TorusGeometry(0.15, 0.028, 8, 18, Math.PI), dark, 0, 0.5, 0.635); mouths.smile.rotation.z = Math.PI;
      mouths.flat = add(hin, new THREE.BoxGeometry(0.3, 0.045, 0.05), dark, 0, 0.45, 0.65);
      mouths.o = add(hin, new THREE.SphereGeometry(0.1, 12, 10), dark, 0, 0.44, 0.64); mouths.o.scale.set(1, 1.25, 0.4);
      mouths.big = add(hin, new THREE.SphereGeometry(0.16, 14, 10), dark, 0, 0.45, 0.63); mouths.big.scale.set(1.35, 1, 0.4);
      Object.values(mouths).forEach((m) => { m.visible = false; });
    }
    if (r === 'blind') {
      add(hin, new THREE.CylinderGeometry(0.735, 0.735, 0.3, 28, 1, true), std(0x1f2937, { side: THREE.DoubleSide }), 0, 0.82, 0);
      [-1, 1].forEach((sx) => { const t2 = add(hin, new THREE.BoxGeometry(0.22, 0.07, 0.05), std(0x1f2937), sx * 0.2, 0.82, -0.76); t2.rotation.z = sx * 0.5; });
    }
    if (r === 'mute') {                                                                   // a strip of tape over the mouth
      add(hin, new THREE.BoxGeometry(0.5, 0.2, 0.05), std(0xe5e7eb), 0, 0.46, 0.665);
      [0.55, -0.55].forEach((a) => { add(hin, new THREE.BoxGeometry(0.34, 0.03, 0.02), kit.basic(0x6b7280), 0, 0.46, 0.7).rotation.z = a; });
    }
    if (r === 'deaf') {
      const band = std(0x374151);
      add(hin, new THREE.TorusGeometry(0.75, 0.05, 8, 32, Math.PI), band, 0, 0.74, 0);
      [-1, 1].forEach((sx) => { add(hin, new THREE.CylinderGeometry(0.21, 0.21, 0.15, 18), band, sx * 0.73, 0.74, 0).rotation.z = Math.PI / 2; });
    }
    add(hin, new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), std(0xa16207), 0.1, 1.44, 0).rotation.z = -0.5;
    add(hin, new THREE.SphereGeometry(0.07, 8, 6), kit.basic(0xfde047), 0.2, 1.54, 0);
    const c = { g, inner, head, bm, color, eyes, mouths, phase: Math.random() * 6, side: 0, look: { y: 0, p: 0 } };
    if (r === 'mute') {
      // two hands with five fingers on arms that follow them: they hold the book, rest on the desk, or show a number / a sign
      c.hands = {}; c.arms = {}; c.hp = {}; c.shoulder = { l: new THREE.Vector3(0.6, 0.52, 0.15), r: new THREE.Vector3(-0.6, 0.52, 0.15) };
      ['l', 'r'].forEach((sd) => {
        const h = makeHand(kit, color, sd); h.group.scale.setScalar(0.95); inner.add(h.group);
        c.hands[sd] = h; c.arms[sd] = makeArm(kit, inner, bm, 0.09); c.hp[sd] = new THREE.Vector3().fromArray(HAND_POS.hold[sd]);
      });
    } else {
      // the Blind rests his hands on the table in front of him, the Deaf lets his arms hang
      const reach = r === 'blind' ? [0.42, 0.2, 0.95] : [0.7, 0.3, 0.2];
      [-1, 1].forEach((sx) => {
        const a = new THREE.Vector3(sx * 0.62, 0.5, 0.15); const b2 = new THREE.Vector3(sx * reach[0], reach[1], reach[2]);
        const arm = makeArm(kit, inner, bm, 0.085); arm.update(a, b2);
        add(inner, new THREE.SphereGeometry(0.125, 12, 10), bm, b2.x, b2.y, b2.z);
      });
    }
    chars[r] = c;
  }
  ['blind', 'deaf', 'mute'].forEach(makeChar);

  // ================================================================= the books
  // (a) the Mute's own, open on his desk and leaning back on a wedge: its two pages are the manual (HTML), laid exactly on them
  const bookRoot = new THREE.Group(); bookRoot.rotation.y = Math.PI; scene.add(bookRoot);      // its reader is the Mute, at the north end
  const bookTilt = new THREE.Group(); bookTilt.rotation.x = BOOK_TILT; bookRoot.add(bookTilt);
  let bookKit = null;
  const bookEl = document.createElement('div');
  const spreadCtl = createSpread(bookEl, { onLongPress: () => { if (role === 'mute' && !desk.down) setDown(true); } });
  let css = null; let cssObj = null; let cssCam = null; let K = 100; let pageW = 300; let pageH = 300;
  function ensureCss() {
    if (css) return;
    css = new CSS3DRenderer(); css.domElement.className = 'w3css'; css.domElement.style.pointerEvents = 'none'; host.appendChild(css.domElement);
    cssObj = new CSS3DObject(bookEl);
    const cssScene = new THREE.Scene(); cssScene.add(cssObj); css.scene = cssScene;
    cssCam = new THREE.PerspectiveCamera(40, 1, 1, 100000);
  }
  // how high the middle of a tilted book has to be so that its lowest corner touches the desk
  const restY = (b, H) => (b.T + b.C) * Math.cos(BOOK_TILT) + (H / 2 + b.over) * Math.sin(BOOK_TILT);
  let bookW = 0; let bookH = 0;
  function rebuildBook(W, H) {                                                          // W x H = one page
    if (Math.abs(W - bookW) < 0.004 && Math.abs(H - bookH) < 0.004) return;
    bookW = W; bookH = H;
    bookRoot.remove(...bookRoot.children.filter((c) => c !== bookTilt)); bookTilt.remove(...bookTilt.children);
    if (bookKit) bookKit.dispose();
    bookKit = makeKit(); const b = makeBook(W, H, bookKit, { text: true }); bookTilt.add(b.group);
    const cy = restY(b, H); bookRoot.position.set(BOOK_AT.x, DESK_Y + cy, BOOK_AT.z);
    // a wooden wedge under the back of the book, so it really leans on something
    const c = Math.cos(BOOK_TILT); const sn = Math.sin(BOOK_TILT); const hh = H / 2 + b.over; const lo = b.T + b.C;
    const zn = -lo * sn + hh * c; const zf = -lo * sn - hh * c; const hF = 2 * hh * sn - 0.02;
    const shape = new THREE.Shape(); shape.moveTo(zn, 0); shape.lineTo(zf, 0); shape.lineTo(zf, hF); shape.closePath();
    const depth = b.cw * 0.7;
    const geo = bookKit.geo(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })); geo.translate(0, 0, -depth / 2);
    const wedge = new THREE.Mesh(geo, bookKit.std(0x4a3526, { roughness: 0.85 }));
    wedge.rotation.y = -Math.PI / 2; wedge.position.set(0, -cy, 0); bookRoot.add(wedge);
  }
  // (b) the same book put down on the desk, small, where the Mute sees it once he let go of it (a long press on it picks it up again)
  const deskKit = makeKit(); const deskRoot = new THREE.Group(); scene.add(deskRoot); deskRoot.visible = false;
  const deskHits = [];
  {
    const DT = 0.16; const db = makeBook(0.62, 0.8, deskKit, { text: true });
    const tilt = new THREE.Group(); tilt.rotation.x = DT; tilt.add(db.group); deskRoot.add(tilt);
    tilt.traverse((m) => { if (m.isMesh) { m.userData.deskBook = true; deskHits.push(m); } });
    deskRoot.rotation.y = Math.PI; deskRoot.position.set(BOOK_AT.x, DESK_Y + (db.T + db.C) * Math.cos(DT) + (0.4 + db.over) * Math.sin(DT), BOOK_AT.z + 0.15);
  }
  // (c) the one the Deaf sees him hold up in front of his chest (we see its back cover)
  const miniKit = makeKit(); const miniRoot = new THREE.Group(); chars.mute.inner.add(miniRoot);
  {
    const MT = 0.95; const mb = makeBook(0.6, 0.48, miniKit, { text: true });
    const tilt = new THREE.Group(); tilt.rotation.x = MT; tilt.add(mb.group); miniRoot.add(tilt);
    miniRoot.rotation.y = Math.PI;                                                       // its pages face him, we see the back
    miniRoot.position.set(0, 0.4 + (mb.T + mb.C) * 0.5, 1.12);
  }

  // ================================================================= effects
  const sparks = makePool(60, { size: 0.1 }); scene.add(sparks.pts);
  const burst = makePool(190, { size: 0.17 }); burst.grav = 7; scene.add(burst.pts);
  const fireball = add(scene, new THREE.SphereGeometry(1, 24, 16), kit.basic(0xfb923c, { transparent: true, opacity: 0, depthWrite: false }));
  fireball.visible = false; fireball.position.set(BOMB_AT.x, 0.9, BOMB_AT.z);
  const tmpC = new THREE.Color(); const tmpW = new THREE.Vector3();

  // ================================================================= state
  let model = null; let mood = 'calm'; let moodAt = 0; let at = Date.now();
  let shake = 0; let flash = 0; let boomAt = 0; let frames = 0; let disposed = false; let tBuilt = 0;
  let size = { w: 300, h: 300 };
  let cur = { sig: '', mod: null, kind: '', born: 0 };
  let hits = [];
  const camPos = RIG[role].pos.clone(); const camLook = RIG[role].look.clone(); let camFrom = null; let camT = 1;
  let orbit = { yaw: 0, pitch: 0, dragging: false, x: 0, y: 0, id: null };
  const desk = { down: false, k: 0 };            // the Mute's book: k 0 = in his hands, reading; 1 = put down on the desk (animated)
  const look = { y: 0, p: 0 };                    // his head when the book is down: yaw (positive = to his left) and pitch (positive = down), from straight ahead
  let myHands = [0, 0];                           // what his two hands show
  let remote = { mute: null, deaf: null };        // the others' poses, from the shared state
  let sentPose = ''; let sentAt = 0; let lastRound = null;
  const muteRig = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: DESK_FOV };
  const fpLay = { x: 0.5, lo: -1, hi: -0.7, sc: 0.8 };
  const deskDir = DESK_LOOK.clone().sub(EYE).normalize();
  const deskYaw0 = Math.atan2(deskDir.x, deskDir.z); const deskElev0 = Math.asin(deskDir.y);
  look.y = deskYaw0; look.p = -deskElev0;
  const LOOK_Y = 1.25; const LOOK_UP = -0.65; const LOOK_DOWN = 0.95;
  const deskLookPt = new THREE.Vector3(); const tv = new THREE.Vector3();
  // the number he shows with his fingers, floating next to his hands for the Deaf
  const badgeTex = {};
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); badge.scale.set(1, 1, 1); badge.renderOrder = 10; badge.visible = false; scene.add(badge);
  const badgeMap = (n) => badgeTex[n] || (badgeTex[n] = kit.tex(canvasTex(96, 96, (g, w, h) => {
    g.fillStyle = 'rgba(8,12,24,.78)'; g.beginPath(); g.arc(w / 2, h / 2, 42, 0, Math.PI * 2); g.fill(); g.lineWidth = 4; g.strokeStyle = ROLE_HEX.mute; g.stroke();
    g.fillStyle = '#fff'; g.font = '900 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 3);
  })));
  // his own hands, in front of him (they are children of the camera): tap a finger to raise or fold it
  scene.add(camera);
  // (seen from behind his own hands the palms face the camera, thumbs toward the middle: the left-of-screen hand is built as a "right" one)
  const fp = { l: makeHand(kit, new THREE.Color(ROLE_HEX.mute), 'r'), r: makeHand(kit, new THREE.Color(ROLE_HEX.mute), 'l') };
  fp.l.hits.forEach((h) => { h.userData.hand = 'l'; }); fp.r.hits.forEach((h) => { h.userData.hand = 'r'; });
  const fpRoot = new THREE.Group(); camera.add(fpRoot); fpRoot.visible = false;
  ['l', 'r'].forEach((sd) => { const h = fp[sd].group; h.position.set(sd === 'l' ? -0.5 : 0.5, -0.9, -1.7); h.scale.setScalar(0.85); fpRoot.add(h); });
  const fpHits = [...fp.l.hits, ...fp.r.hits];
  // they are drawn in a second pass on top of everything (layer 1, with their own light), so the book on the desk can never hide them
  fpRoot.traverse((o) => o.layers.set(1));
  { const l1 = new THREE.HemisphereLight(0xffffff, 0x6a6f94, 1.7); l1.layers.set(1); scene.add(l1); const l2 = new THREE.DirectionalLight(0xfff4e0, 1.8); l2.position.set(1, 2, 3); l2.layers.set(1); scene.add(l2); }
  // the little texts and the sign buttons over the world
  const hud = document.createElement('div'); hud.className = 'w3hud'; hud.hidden = true;
  hud.innerHTML = `<div class="w3hint"></div><div class="w3signs">${[['yes', '👍'], ['no', '👎'], ['stop', '✋'], ['fist', '✊'], ['one', '☝️'], ['two', '✌️'], ['rest', '⬇️']].map(([k, e]) => `<button type="button" data-sign="${k}" aria-label="${t('sign_' + k)}" title="${t('sign_' + k)}">${e}</button>`).join('')}</div>`;
  host.appendChild(hud);
  const hudHint = hud.querySelector('.w3hint'); const hudSigns = hud.querySelector('.w3signs');
  hud.addEventListener('pointerdown', (e) => e.stopPropagation());
  hud.addEventListener('click', (e) => { const b = e.target.closest('[data-sign]'); if (b) showSign(b.dataset.sign); });
  function showSign(k) { myHands = k === 'rest' ? [0, 0] : SIGNS[k].slice(); }
  function setDown(v) { if (role !== 'mute' || desk.down === v) return; desk.down = v; onBuzz(15); refreshHud(); }
  function refreshHud() {
    hud.hidden = role !== 'mute';
    hud.dataset.mode = desk.down ? 'desk' : 'read';
    hudHint.textContent = t(desk.down ? 'w3HintDesk' : 'w3HintRead');
    hudHint.style.animation = 'none'; void hudHint.offsetWidth; hudHint.style.animation = '';        // the hint shows again, then fades
    hudSigns.hidden = !desk.down;
  }

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
      emit(burst, BOMB_AT.x, 0.9, BOMB_AT.z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp, 0.8 + Math.random() * 1.1, cols[i % cols.length]);
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
    (feel ? feelRoot : modRoot).add(b.group);
    cur.b = b; cur.base = feel ? FEEL_SCALE : SEE_SCALE; cur.born = performance.now(); hits = b.hits;
  }

  // ---- role: what is visible, the light, the camera
  const put = (r, at, ry, sc) => { const c = chars[r]; c.g.visible = true; c.g.position.copy(at); c.g.rotation.y = ry; c.g.scale.setScalar(sc); };
  function applyRole(first) {
    const blind = role === 'blind'; const mute = role === 'mute';
    room.visible = !blind; feel.visible = blind;
    scene.background.setHex(BG[role]); scene.fog.color.setHex(BG[role]);
    hemi.visible = key.visible = lampLight.visible = !blind;
    Object.values(chars).forEach((c) => { c.g.visible = false; });
    // Deaf's world: the bomb ahead of him, the Blind in front of it on his right, the Mute across from him
    // Mute's world (book down): the back of the bomb, the Blind on one side of it and the Deaf on the other, both facing the bomb
    if (role === 'deaf') { put('blind', BLIND_AT, faceBomb(BLIND_AT), CREW_SC); put('mute', MUTE_AT, 0, MUTE_SC); }
    if (mute) { put('blind', BLIND_AT, faceBomb(BLIND_AT), CREW_SC); put('deaf', DEAF_AT, faceBomb(DEAF_AT), CREW_SC); ensureCss(); }
    if (css) css.domElement.style.display = mute ? '' : 'none';
    bookRoot.visible = mute; deskRoot.visible = false; fpRoot.visible = false; badge.visible = false;
    canvas.style.touchAction = role === 'deaf' ? 'pan-y' : 'none';
    camFrom = { pos: camera.position.clone(), look: camLook.clone() }; camT = first ? 1 : 0;
    cur.sig = ''; disposeModule(); refreshHud();
    fit();
  }

  function fit() {
    size = { w: host.clientWidth || 300, h: host.clientHeight || 300 };
    host.dataset.tiny = size.h < 330 ? '1' : '';                       // a small screen: no corner tag over the picture
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    if (role === 'mute') {
      // The manual is a real object of the 3D scene, so one CSS pixel = K world units where the book is, and the book is built to the size of its
      // pages: the open book fills about 0.86 of the width and 0.8 of the height of the screen (foreshortened by the angle we look at it from).
      const p = size.h / 2 / Math.tan((MUTE_FOV * Math.PI) / 360); K = p / MUTE_DIST;
      const view = Math.PI / 2 - BOOK_TILT - MUTE_ELEV;                       // the angle between the way we look and the page's normal
      const tiny = size.h < 330;                                              // a small phone: the book takes nearly all of it, so it can still be read
      pageW = Math.round(Math.min(size.w * (size.w < 400 ? 0.95 : 0.9), 700)); pageH = Math.round((size.h * (tiny ? 0.93 : MUTE_FILL)) / Math.cos(view));
      rebuildBook(pageW / 2 / K, pageH / K);
      spreadCtl.fit(pageW, pageH);
      const S = bookRoot.position.clone();                                     // the middle of the open book
      const up = new THREE.Vector3(0, Math.cos(MUTE_ELEV), Math.sin(MUTE_ELEV));
      muteRig.look.copy(S).addScaledVector(up, -(size.h * (tiny ? 0.02 : MUTE_SHIFT)) / K);
      muteRig.pos.copy(muteRig.look).add(new THREE.Vector3(0, Math.sin(MUTE_ELEV), -Math.cos(MUTE_ELEV)).multiplyScalar(MUTE_DIST));
      // when the book is down he looks around with a wide lens (a portrait phone is narrow, so the lens is taller than it is wide)
      muteRig.fov = Math.max(52, Math.min(84, (2 * Math.atan(Math.tan(0.56) / camera.aspect) * 180) / Math.PI));
      const dh = 1.7 * Math.tan((muteRig.fov * Math.PI) / 360); const dw = dh * camera.aspect;
      fpLay.x = dw * 0.5; fpLay.lo = -dh * 0.74; fpLay.hi = -dh * 0.5; fpLay.sc = Math.max(0.55, Math.min(1.1, dw * 1.3, dh * 0.55));
      camera.updateProjectionMatrix();
      if (css) {
        css.setSize(size.w, size.h);
        bookEl.style.width = `${pageW}px`; bookEl.style.height = `${pageH}px`;
        cssObj.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(BOOK_TILT - Math.PI / 2, 0, 0))));
        cssObj.position.set(S.x * K, S.y * K + 0.4, S.z * K);
      }
    } else {
      const rig = RIG[role];
      const dist = rig.pos.distanceTo(rig.look);
      camera.fov = Math.min(role === 'deaf' ? 86 : 72, Math.max(30, (2 * Math.atan(rig.fitW / 2 / camera.aspect / dist) * 180) / Math.PI));
      camera.updateProjectionMatrix();
    }
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(host); else window.addEventListener('resize', fit);

  // ================================================================= the Blind's touch
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); ray.layers.enable(1);
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
  // the Mute with his book down: drag = turn the head, tap a finger of his own hand = raise / fold it, long press on the book = pick it up
  const fpHit = (ev) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const f = ray.intersectObjects(fpHits, false)[0]; const bk = !!ray.intersectObjects(deskHits, false)[0];
    if (f) return { kind: 'finger', book: bk, ...f.object.userData };
    return bk ? { kind: 'book', book: true } : null;
  };
  let mp = null;
  const toggleFinger = (hand, f) => {
    const i = hand === 'l' ? 0 : 1; let v = myHands[i] ^ (1 << f);
    v &= ~FLIP; v = (v & 31) ? (v | UP) : (v & ~UP);
    myHands[i] = v;
  };
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
    } else if (role === 'mute' && desk.down && desk.k > 0.9) {
      if (mp) clearTimeout(mp.timer);
      const h = fpHit(e);
      mp = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, hit: h, done: false, timer: 0 };
      if (h && h.book) mp.timer = setTimeout(() => { if (mp && !mp.moved) { mp.done = true; setDown(false); } }, 650);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (orbit.dragging && e.pointerId === orbit.id) {
      orbit.yaw = Math.max(-0.5, Math.min(0.5, orbit.yaw - (e.clientX - orbit.x) * 0.004));
      orbit.pitch = Math.max(-0.2, Math.min(0.25, orbit.pitch + (e.clientY - orbit.y) * 0.003));
      orbit.x = e.clientX; orbit.y = e.clientY;
    }
    if (mp && e.pointerId === mp.id && !mp.done) {
      if (!mp.moved && Math.hypot(e.clientX - mp.x, e.clientY - mp.y) > 9) { mp.moved = true; clearTimeout(mp.timer); }
      if (mp.moved) {
        const k = 0.0042 * (62 / muteRig.fov) ** 0.5;
        look.y = Math.max(-LOOK_Y, Math.min(LOOK_Y, look.y - (e.clientX - mp.x) * k)); look.p = Math.max(LOOK_UP, Math.min(LOOK_DOWN, look.p + (e.clientY - mp.y) * k));
        mp.x = e.clientX; mp.y = e.clientY;
      }
    }
  });
  const up = (e, fire) => {
    if (press.mesh && e.pointerId === press.id) pressEnd(fire);
    if (orbit.dragging && e.pointerId === orbit.id) orbit.dragging = false;
    if (mp && e.pointerId === mp.id) {
      clearTimeout(mp.timer);
      if (fire && !mp.moved && !mp.done && mp.hit && mp.hit.kind === 'finger') { toggleFinger(mp.hit.hand, mp.hit.finger); onBuzz(8); }
      mp = null;
    }
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
    const blind = role === 'blind'; const deaf = role === 'deaf'; const mute = role === 'mute';
    if (model.round !== lastRound) {                                   // a new round: the book is in his hands again, the hands are down, the head straight
      lastRound = model.round; desk.down = false; desk.k = 0; myHands = [0, 0]; look.y = deskYaw0; look.p = -deskElev0; sentPose = ''; refreshHud();
    }
    desk.k = clamp01(desk.k + (desk.down ? dt : -dt) / 0.85);
    const kk = desk.k * desk.k * (3 - 2 * desk.k);                     // eased 0 (reading) .. 1 (book on the desk, looking around)

    // module (rebuild when it changes)
    const sig = `${role}|${model.round}|${model.cur}|${blind ? `${model.game.x}|${model.game.e}|${model.game.p}` : ''}`;
    if (sig !== cur.sig) { cur.sig = sig; buildModule(model); }
    const fogKey = `${model.round}|${model.cur}|${model.strikes}`;      // like the interface's bomb: a new module or a mistake starts the cycle again, bomb in view
    if (fogKey !== cur.fogKey) { cur.fogKey = fogKey; tBuilt = performance.now(); }
    if (cur.b) {
      cur.b.tick(now);
      const k = ease((performance.now() - cur.born) / 350);
      cur.b.group.scale.setScalar(cur.base * (0.85 + 0.15 * k));
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
        bomb.localToWorld(tmpW.copy(sp)); emit(sparks, tmpW.x, tmpW.y, tmpW.z, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.35, tmpC.set(Math.random() < 0.5 ? '#ffc766' : '#ff8a3c'));
      }
      bomb.visible = !lost;
      bomb.rotation.z = mood === 'hit' ? Math.sin(t * 50) * 0.02 * Math.exp(-since * 5) : 0;
    } else { sparkLight.intensity = 0; }
    // the Mute's world: reading, he sees only the book; with the book down he sees the back of the bomb, the Blind and the Deaf
    if (mute) {
      bomb.visible = !lost && kk > 0.3;
      chars.blind.g.visible = chars.deaf.g.visible = kk > 0.3;
      bookRoot.visible = kk < 0.5; deskRoot.visible = kk > 0.3;
      fpRoot.visible = kk > 0.6;
      if (css) { css.domElement.style.opacity = String(clamp01(1 - kk * 2.4)); css.domElement.style.display = kk >= 0.45 ? 'none' : ''; }
      bookEl.style.pointerEvents = kk < 0.05 ? 'auto' : 'none';
    } else if (blind) bomb.visible = false;

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

    // the poses: the Deaf sees the Mute's (book in his hands or on the desk, his hands, his head); the Mute sees the Deaf's head
    {
      const kp = 1 - Math.exp(-dt * 9);
      const smooth = (c, y, pp) => { c.look.y += (y - c.look.y) * kp; c.look.p += (pp - c.look.p) * kp; c.head.rotation.set(c.look.p, c.look.y, 0, 'YXZ'); };
      if (deaf) {
        const P = remote.mute || {}; const down = !!P.d; const hv = P.h || [0, 0]; const c = chars.mute;
        miniRoot.visible = !down;
        smooth(c, down ? P.y || 0 : 0, down ? P.p || 0 : 0.42);
        ['l', 'r'].forEach((sd, i) => {
          const v = hv[i] | 0; const tgt = !down ? HAND_POS.hold[sd] : raised(v) ? HAND_POS.show[sd] : HAND_POS.rest[sd];
          tv.fromArray(tgt); if (down && raised(v)) tv.y += Math.sin(t * 5 + i) * 0.03;
          c.hp[sd].lerp(tv, kp);
          const h = c.hands[sd]; h.group.position.copy(c.hp[sd]); h.set(down ? v : 0, kp);
          c.arms[sd].update(c.shoulder[sd], c.hp[sd]);
        });
        const n = down ? countOf(hv[0] | 0, hv[1] | 0) : null;
        badge.visible = n !== null;
        if (n !== null) { badge.material.map = badgeMap(n); badge.material.needsUpdate = true; badge.scale.setScalar(0.72); badge.position.set(MUTE_AT.x + 1.35, DESK_Y + 1.8, MUTE_AT.z + 0.4); }
      } else badge.visible = false;
      if (mute) {
        const P = remote.deaf || {};
        smooth(chars.deaf, P.y || 0, P.p || 0);
        const hs = 1 - Math.exp(-dt * 14);
        ['l', 'r'].forEach((sd, i) => {
          const v = myHands[i]; const r = raised(v) ? 1 : 0; const h = fp[sd];
          h.set(v, hs); const g = h.group;
          g.position.x += ((sd === 'l' ? -1 : 1) * fpLay.x - g.position.x) * hs;
          g.position.y += ((r ? fpLay.hi : fpLay.lo) - g.position.y) * hs; g.scale.setScalar(fpLay.sc);
        });
      }
      // my own pose goes to the others (at most 8 times a second, and only when it changed)
      if (mute || deaf) {
        const q = (x) => Math.round(x * 25) / 25;
        const pose = mute ? { d: desk.down ? 1 : 0, h: [myHands[0], myHands[1]], y: q(look.y), p: q(look.p) } : { y: q(orbit.yaw * 1.2), p: q(orbit.pitch * 1.6) };
        const sj = JSON.stringify(pose);
        if (sj !== sentPose && performance.now() - sentAt > 125) { sentPose = sj; sentAt = performance.now(); onPose(role, pose); }
      }
    }

    // light, flash, shake
    flash *= Math.exp(-dt * 4.5); shake *= Math.exp(-dt * 5);
    alarm.intensity = flash * 50; happy.intensity = won ? 16 + Math.sin(t * 6) * 4 : 0;
    scene.background.setHex(BG[role]);
    if (blind) scene.background.r = Math.min(0.35, flash * 0.3);          // the Blind's black screen blushes red for a moment on a mistake
    else if (flash > 0.02) scene.background.lerp(tmpC.set(0x4a1218), Math.min(0.5, flash * 0.4));

    // camera: ease to the role's seat, then a little breathing / shake / the Deaf's drag. The Mute's camera is his eyes: on the book, or up
    // on the room with the book down (his head turns by dragging)
    if (mute) {
      const cp = Math.cos(-look.p);
      deskLookPt.set(Math.sin(look.y) * cp, Math.sin(-look.p), Math.cos(look.y) * cp).multiplyScalar(5).add(EYE);
      camera.position.lerpVectors(muteRig.pos, EYE, kk); camLook.lerpVectors(muteRig.look, deskLookPt, kk);
      const fv = MUTE_FOV + (muteRig.fov - MUTE_FOV) * kk;
      if (Math.abs(fv - camera.fov) > 0.01) { camera.fov = fv; camera.updateProjectionMatrix(); }
      camera.position.x += (Math.random() - 0.5) * shake * 0.12; camera.position.y += (Math.random() - 0.5) * shake * 0.1;
      camera.lookAt(camLook);
    } else {
      const rig = RIG[role];
      if (camFrom && camT < 1) { camT = Math.min(1, camT + dt / 0.7); const k = ease(camT); camPos.lerpVectors(camFrom.pos, rig.pos, k); camLook.lerpVectors(camFrom.look, rig.look, k); }
      else { camPos.copy(rig.pos); camLook.copy(rig.look); }
      if (!orbit.dragging) { orbit.yaw *= Math.exp(-dt * 2.5); orbit.pitch *= Math.exp(-dt * 2.5); }
      const off = camPos.clone().sub(camLook);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit.yaw); off.y += orbit.pitch * off.length() * 0.6;
      camera.position.copy(camLook).add(off);
      camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.22 + (role === 'deaf' ? Math.sin(t * 0.5) * 0.03 : 0);
      camera.lookAt(camLook);
    }

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
    camera.layers.set(0); renderer.render(scene, camera);
    if (fpRoot.visible && role === 'mute') {                 // his own hands, over everything
      const bg = scene.background; scene.background = null; renderer.autoClear = false; renderer.clearDepth();
      camera.layers.set(1); renderer.render(scene, camera);
      camera.layers.set(0); renderer.autoClear = true; scene.background = bg;
    }
    if (css && role === 'mute') spreadCtl.ready();
    if (css && role === 'mute' && desk.k < 0.45) {
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

  // test hooks: where a finger / the book on the desk is on the screen
  function toScreen(obj) {
    obj.updateWorldMatrix(true, false);
    const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()).project(camera); const r = canvas.getBoundingClientRect();
    return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height };
  }
  // a point of the screen where a long press picks the book up (on the book, not on a finger)
  function deskBookPoint() {
    const r = canvas.getBoundingClientRect();
    for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) {
      const x = r.left + ((i + 0.5) / 30) * r.width; const y = r.top + ((j + 0.5) / 30) * r.height; const h = fpHit({ clientX: x, clientY: y });
      if (h && h.kind === 'book') return { x, y };
    }
    return null;
  }
  const fingerHit = (hand, f) => fpHits.find((m) => m.userData.hand === hand && m.userData.finger === f);

  return {
    canvas, bookEl,
    update(m) {
      model = m; at = Date.now();
      if (m.role !== role) { role = m.role; applyRole(); }
      if (role === 'mute' && m.bomb) { spreadCtl.setManual(m.bomb, m.round); spreadCtl.setStrikes(m.strikes); }
    },
    // what the others are doing ({ mute: {d, h, y, p}, deaf: {y, p} }, from the shared state)
    setPoses(p) { remote = { mute: (p && p.mute) || null, deaf: (p && p.deaf) || null }; },
    stats: () => ({
      crew: Object.fromEntries(Object.entries(chars).filter(([, c]) => c.g.visible).map(([r, c]) => [r, [+c.g.position.x.toFixed(2), +c.g.position.z.toFixed(2)]])), bombZ: BOMB_AT.z,
      cam: [camera.position.x, camera.position.y, camera.position.z].map((v) => +v.toFixed(2)), fov: +camera.fov.toFixed(1), orbit: [+orbit.yaw.toFixed(3), +orbit.pitch.toFixed(3)],
      frames, mood, role, hits: hits.length, mode: cur.b ? 'module' : 'none', veil: +fogVeil.material.opacity.toFixed(2), book: !!(css && role === 'mute'),
      desk: { down: desk.down, k: +desk.k.toFixed(2) }, hands: myHands.slice(), look: [+look.y.toFixed(2), +look.p.toFixed(2)], count: countOf(myHands[0], myHands[1]),
      remote, bombVisible: bomb.visible, blindVisible: chars.blind.g.visible, deafVisible: chars.deaf.g.visible, muteVisible: chars.mute.g.visible, bookVisible: bookRoot.visible, deskBookVisible: deskRoot.visible, miniVisible: miniRoot.visible,
      muteHead: [+chars.mute.look.y.toFixed(2), +chars.mute.look.p.toFixed(2)], deafHead: [+chars.deaf.look.y.toFixed(2), +chars.deaf.look.p.toFixed(2)],
      muteHands: ['l', 'r'].map((sd) => +chars.mute.hp[sd].y.toFixed(2)), badge: badge.visible,
    }),
    // test hook: how much of each other character the current camera really sees (inside the frame, and not hidden behind something)
    probe() {
      camera.updateMatrixWorld(); const rc = new THREE.Raycaster(); const out = {};
      const shown = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
      const owner = (o, g) => { for (let n = o; n; n = n.parent) if (n === g) return true; return false; };
      const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const targets = [room, bomb, ...Object.values(chars).map((c) => c.g)];
      Object.entries(chars).forEach(([r, c]) => {
        if (!c.g.visible) return;
        const sc = c.g.scale.x; const hd = new THREE.Vector3(); c.head.getWorldPosition(hd); hd.y += 0.7 * sc;
        const pts = [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.4]].map(([a, b]) => hd.clone().addScaledVector(camRight, a * sc).addScaledVector(camUp, b * sc));
        let inF = 0; let clear = 0;
        pts.forEach((pt) => {
          const nd = pt.clone().project(camera); const inside = Math.abs(nd.x) < 0.97 && Math.abs(nd.y) < 0.97 && nd.z < 1; if (inside) inF++;
          const d = pt.clone().sub(camera.position); const len = d.length(); rc.set(camera.position, d.normalize()); rc.far = len - 0.02;
          const blocked = rc.intersectObjects(targets, true).some((h) => shown(h.object) && !owner(h.object, c.g) && h.object.isMesh);
          if (inside && !blocked) clear++;
        });
        const nd = hd.clone().project(camera);
        out[r] = { x: +nd.x.toFixed(2), y: +nd.y.toFixed(2), inFrame: inF, clear };
      });
      if (bomb.visible) {                                                    // the panel: how wide it is on the screen and how slanted we see it
        const ax = new THREE.Vector3(1, 0, 0); const ay = new THREE.Vector3(0, Math.cos(LEAN), -Math.sin(LEAN)); let lo = 9; let hi = -9;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const w = bomb.localToWorld(PC.clone().addScaledVector(ax, a * 1.28).addScaledVector(ay, b * 1.08)).project(camera); lo = Math.min(lo, w.x); hi = Math.max(hi, w.x); });
        const dir = PANEL_TURNED.clone().sub(camera.position).normalize();
        out.panel = { width: +Math.max(0, Math.min(hi, 1) - Math.max(lo, -1)).toFixed(2) / 2, edge: [+lo.toFixed(2), +hi.toFixed(2)], facing: +(-dir.dot(NRM_TURNED)).toFixed(2) };
      }
      return out;
    },
    spread: spreadCtl,
    setDown, setHands(l, r) { myHands = [l | 0, r | 0]; }, sign: showSign, look: (y, p) => { look.y = y; look.p = p; },
    tapFinger: (hand, f) => toggleFinger(hand, f), fingerScreen: (hand, f) => { const h = fingerHit(hand, f); return h ? toScreen(h) : null; }, deskBookScreen: () => toScreen(deskHits[0]), deskBookPoint,
    screenOf,
    // where the book is on the screen: from the 3D scene (cover mesh) and from the page element (the tests compare them)
    bookRects() {
      const r = canvas.getBoundingClientRect(); const b = bookEl.getBoundingClientRect();
      const c = bookRoot.position.clone().project(camera);
      return { scene: { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height }, page: { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }, host: { l: r.left, t: r.top, w: r.width, h: r.height }, K, pageW, pageH };
    },
    destroy() {
      disposed = true; cancelAnimationFrame(raf); clearTimeout(press.timer); if (mp) clearTimeout(mp.timer); onReveal(null);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', fit);
      disposeModule(); kit.dispose(); deskKit.dispose(); miniKit.dispose(); if (bookKit) bookKit.dispose(); spreadCtl.destroy(); if (cntMat.map) cntMat.map.dispose();
      Object.values(badgeTex).forEach((x) => x && x.dispose && x.dispose());
      [sparks, burst].forEach((q) => { q.geo.dispose(); q.mat.dispose(); });
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      canvas.remove(); hud.remove(); if (css) css.domElement.remove();
    },
  };
}
