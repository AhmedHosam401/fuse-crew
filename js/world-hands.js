// world-hands.js — a cartoon hand with five fingers (thumb + four), and an arm that follows it. Used for the Mute: his own hands in front
// of him (tap a finger to raise or fold it) and the same hands on his character, which the Deaf sees.
//
// A hand's value is a number: bits 0..4 = thumb, index, middle, ring, little finger raised; 32 = the hand is turned upside down
// (a thumb pointing down); 64 = the hand is held up even with no finger raised (a fist). 0 = resting.
import * as THREE from '../vendor/three.module.min.js';

export const FLIP = 32; export const UP = 64;
export const fingersOf = (v) => [0, 1, 2, 3, 4].filter((i) => v & (1 << i));
export const raised = (v) => (v & 127) !== 0;
// the number the two hands show: how many fingers are up (not when it is a thumbs-up / thumbs-down sign)
export function countOf(l, r) {
  const sign = (v) => (v & FLIP) || (v & 31) === 1;
  if (sign(l) && !(r & 31)) return null;
  if (sign(r) && !(l & 31)) return null;
  const n = fingersOf(l).length + fingersOf(r).length;
  return n || ((raised(l) || raised(r)) ? 0 : null);
}
// what the preset buttons put in the hands
export const SIGNS = {
  yes: [1 | UP, 0], no: [1 | FLIP | UP, 0], stop: [31 | UP, 31 | UP], fist: [UP, UP], one: [2 | UP, 0], two: [6 | UP, 0],
};

// side 'l' = his left hand (his thumb points toward the middle of his body); the hand faces +z, the fingers go up.
// A cartoon glove: a puffy white palm with a cuff in the Mute's colour, and fingers made of two rounded joints that curl one after the other.
export function makeHand(kit, color, side) {
  const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner);
  const s = side === 'l' ? 1 : -1;                               // which way the thumb leans: +1 = toward -x
  const glove = kit.std(0xf6f4ef, { roughness: 0.62, emissive: 0x6b6a66 }); const seam = kit.std(0xcfcbc2, { roughness: 0.7 }); const cuffM = kit.std(color, { roughness: 0.55 });
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(kit.geo(geo), mat); parent.add(m); return m; };
  const palm = mesh(new THREE.SphereGeometry(0.2, 22, 16), glove, inner); palm.scale.set(1.12, 0.98, 0.62);
  const back = mesh(new THREE.SphereGeometry(0.17, 18, 12), glove, inner); back.position.set(0, 0.05, -0.04); back.scale.set(1.1, 0.9, 0.55);
  [-0.07, 0, 0.07].forEach((x) => { const l = mesh(new THREE.CapsuleGeometry(0.006, 0.1, 3, 6), seam, inner); l.position.set(x, 0.07, -0.118); });   // the three stitched lines on the back of a glove
  const cuff = mesh(new THREE.CylinderGeometry(0.17, 0.185, 0.13, 20), cuffM, inner); cuff.position.set(0, -0.21, 0);
  const rim = mesh(new THREE.TorusGeometry(0.178, 0.022, 8, 22), seam, inner); rim.rotation.x = Math.PI / 2; rim.position.set(0, -0.145, 0);
  const fingers = []; const hits = [];
  const R = 0.056;
  // len = the whole finger; its two joints: the near one is a bit longer than the far one
  const make = (i, x, y, len, rad, rest) => {
    const fg = new THREE.Group(); fg.position.set(x, y, 0.02); inner.add(fg);
    const l1 = len * 0.55; const l2 = len * 0.45;
    const a = mesh(new THREE.CapsuleGeometry(rad, Math.max(0.01, l1 - 2 * rad), 4, 12), glove, fg); a.position.y = l1 / 2;
    const j = new THREE.Group(); j.position.y = l1; fg.add(j);
    const b = mesh(new THREE.CapsuleGeometry(rad * 0.94, Math.max(0.01, l2 - 1.9 * rad), 4, 12), glove, j); b.position.y = l2 / 2;
    // the touch area of a finger stays where the finger stands upright, whether it is raised or folded (so you always know where to tap)
    const hit = mesh(new THREE.CylinderGeometry(i ? 0.036 : 0.06, i ? 0.036 : 0.06, len + 0.2, 8), kit.basic(0xffffff, { transparent: true, opacity: 0, depthWrite: false }), inner);
    hit.position.set(i ? x : x - s * 0.1, y + len / 2 + 0.04, 0.05); hit.userData = { finger: i, hand: side }; hits.push(hit);
    fingers.push({ g: fg, j, len, rest, up: 0, curl: 0.5, x });
  };
  make(0, -s * 0.17, -0.06, 0.4, 0.066, {});                                                  // the thumb: thicker, it leans out when it is raised
  [[-0.105, 0.42], [-0.035, 0.49], [0.035, 0.45], [0.105, 0.35]].forEach(([x, len], k) => make(k + 1, s * x, 0.15, len, R, {}));
  g.userData = { side, hits };
  const state = { flip: 0 };
  const ease = (t) => t * t * (3 - 2 * t);
  return {
    group: g, hits, fingers,
    // animate toward the value v. A raised finger stands nearly straight with a small natural bend; a folded one curls into the palm
    // (a loose curl while the hand is at rest, a tight fist while it is held up). The fingers move one after the other, not all at once.
    set(v, k = 1) {
      const up = v & 31; const held = (v & 127) !== 0; const tm = performance.now() / 1000;
      fingers.forEach((f, i) => {
        const kk = Math.min(1, k * (1 - 0.13 * (i ? i - 1 : 0.5)));
        const on = (up >> i) & 1; f.up += (on - f.up) * kk; f.curl += ((held ? 1 : 0.42) - f.curl) * kk;
        const e = ease(Math.max(0, Math.min(1, f.up)));
        if (i === 0) {
          const alone = (up & 31) === 1;
          f.g.rotation.z = THREE.MathUtils.lerp(-s * 0.5, s * (alone ? 0.1 : 0.72), e);
          f.g.rotation.x = THREE.MathUtils.lerp(0.95 * f.curl + 0.2, 0.05, e);
          f.j.rotation.x = THREE.MathUtils.lerp(0.5 + 0.4 * f.curl, -0.12 + (alone ? 0.05 * Math.sin(tm * 2.4) : 0), e);
        } else {
          const sway = Math.sin(tm * 2.6 + i * 1.7) * 0.035 * e;                              // a raised finger is never perfectly still
          f.g.rotation.x = THREE.MathUtils.lerp(1.2 + 0.35 * f.curl, 0.07 + sway, e);
          f.j.rotation.x = THREE.MathUtils.lerp(1.0 + 0.55 * f.curl, 0.16 + sway, e);
          f.g.rotation.z = -(f.x / 0.105) * 0.07 * e;                                    // raised fingers fan out a little
        }
      });
      state.flip += (((v & FLIP) ? 1 : 0) - state.flip) * k;
      inner.rotation.z = state.flip * Math.PI;
    },
  };
}

// an arm: a rounded stick between two points (it is stretched every time, so it follows a moving hand)
export function makeArm(kit, parent, mat, rad) {
  const m = new THREE.Mesh(kit.geo(new THREE.CylinderGeometry(rad, rad, 1, 10)), mat); parent.add(m);
  const ball = new THREE.Mesh(kit.geo(new THREE.SphereGeometry(rad * 1.3, 10, 8)), mat); parent.add(ball);
  const up = new THREE.Vector3(0, 1, 0); const d = new THREE.Vector3();
  return {
    update(a, b) {
      d.subVectors(b, a); const len = Math.max(0.001, d.length());
      m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(up, d.divideScalar(len));
      ball.position.copy(a);
    },
  };
}
