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

// side 'l' = his left hand (his thumb points toward the middle of his body); the hand faces +z, the fingers go up
export function makeHand(kit, color, side) {
  const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner);
  const s = side === 'l' ? 1 : -1;                               // which way the thumb leans: +1 = toward -x
  const skin = kit.std(color, { roughness: 0.5 }); const tip = kit.std(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55), { roughness: 0.5 });
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(kit.geo(geo), mat); parent.add(m); return m; };
  const palm = mesh(new THREE.SphereGeometry(0.2, 20, 14), skin, inner); palm.scale.set(1.08, 0.95, 0.55);
  const fingers = []; const hits = [];
  const R = 0.046;
  const make = (i, x, y, len, rest) => {
    const fg = new THREE.Group(); fg.position.set(x, y, 0.02); inner.add(fg);
    const body = mesh(new THREE.CylinderGeometry(R, R, len, 10), skin, fg); body.position.y = len / 2;
    mesh(new THREE.SphereGeometry(R, 10, 8), tip, fg).position.y = len;
    mesh(new THREE.SphereGeometry(R * 1.05, 10, 8), skin, fg);
    // the touch area of a finger stays where the finger stands upright, whether it is raised or folded (so you always know where to tap)
    const hit = mesh(new THREE.CylinderGeometry(i ? 0.034 : 0.06, i ? 0.034 : 0.06, len + 0.2, 8), kit.basic(0xffffff, { transparent: true, opacity: 0, depthWrite: false }), inner);
    hit.position.set(i ? x : x - s * 0.1, y + len / 2 + 0.04, 0.05); hit.userData = { finger: i, hand: side }; hits.push(hit);
    fingers.push({ g: fg, len, rest, cur: 0, up: 0 });
  };
  make(0, -s * 0.2, -0.04, 0.3, { z: s * 0.78, zs: s * 0.1, x: 0 });                     // the thumb leans out when it is raised
  [[-0.105, 0.42], [-0.035, 0.49], [0.035, 0.45], [0.105, 0.34]].forEach(([x, len], k) => make(k + 1, s * x, 0.15, len, { z: 0, zs: 0, x: 0 }));
  g.userData = { side, hits };
  const state = { flip: 0 };
  return {
    group: g, hits, fingers,
    // animate toward the value v
    set(v, k = 1) {
      const up = v & 31;
      fingers.forEach((f, i) => {
        const on = (up >> i) & 1; f.up += (on - f.up) * k;
        if (i === 0) {
          const alone = (up & 31) === 1;
          f.g.rotation.z = THREE.MathUtils.lerp(-s * 0.55, s * (alone ? 0.12 : 0.78), f.up); f.g.rotation.x = THREE.MathUtils.lerp(1.15, 0, f.up);
        } else { f.g.rotation.z = 0; f.g.rotation.x = THREE.MathUtils.lerp(1.95, 0, f.up); }
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
