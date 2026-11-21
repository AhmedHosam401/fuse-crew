// scene3d.js — the 3D view: a little diorama of the crew around the bomb (Three.js, loaded only when somebody picks 3D).
// Same rules as the 2D view (scene.js): decoration only, never a puzzle clue; the Blind gets a dark room with no clock,
// no shrinking fuse and no time-based moods. Everything is built from simple shapes (no model files, no textures to download).
import * as THREE from '../vendor/three.module.min.js';
import { moodOf, ROLE_HEX } from './scene.js';
import { fmt } from './ui.js';

const DARK = 0x111827;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// a pool of point sprites: sparks, confetti and the explosion all use it
function makePool(N, { additive = true, size = 0.12 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3).fill(-100);
  const col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, geo, mat, pos, col, vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), base: new Float32Array(N * 3), N, i: 0, grav: 0 };
}
function emit(p, x, y, z, vx, vy, vz, life, c) {
  const i = p.i; p.i = (p.i + 1) % p.N;
  p.pos[i * 3] = x; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = z;
  p.vel[i * 3] = vx; p.vel[i * 3 + 1] = vy; p.vel[i * 3 + 2] = vz;
  p.life[i] = life; p.max[i] = life;
  p.base[i * 3] = c.r; p.base[i * 3 + 1] = c.g; p.base[i * 3 + 2] = c.b;
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

export function create(host, role) {
  const blind = role === 'blind';
  const canvas = document.createElement('canvas');
  canvas.className = 'sc3d'; canvas.id = 'sc3d';
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency || 4) <= 2 ? 1 : 2));

  const dispose = [];
  const track = (o) => { dispose.push(o); return o; };
  const mat = (color, o = {}) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o }));
  const basic = (color, o = {}) => track(new THREE.MeshBasicMaterial({ color, ...o }));
  const geo = (g) => track(g);

  const bgColor = blind ? 0x05060a : 0x171a2a;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
  scene.fog = new THREE.Fog(bgColor, 13, 24);
  const camera = new THREE.PerspectiveCamera(38, 2, 0.1, 60);
  const CAM = new THREE.Vector3(0, 2.45, 7.9); const LOOK = new THREE.Vector3(0, 1.3, 0.2);

  // ---- lights (the Blind's room is almost dark: only the fuse glows)
  const hemi = new THREE.HemisphereLight(0xaab8ff, 0x1a1c2a, blind ? 0.18 : 1.15); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d8, blind ? 0.2 : 2.2); key.position.set(3.5, 7, 6); scene.add(key);
  const alarm = new THREE.PointLight(0xff2a2a, 0, 18, 1.6); alarm.position.set(0, 2.6, 3.2); scene.add(alarm);
  const happy = new THREE.PointLight(0x4ade80, 0, 18, 1.6); happy.position.set(0, 2.8, 3); scene.add(happy);

  // ---- floor
  const floor = new THREE.Mesh(geo(new THREE.CircleGeometry(7.5, 56)), mat(0x1c2036, { roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const rug = new THREE.Mesh(geo(new THREE.RingGeometry(3.6, 3.75, 56)), basic(0x3a4166, { transparent: true, opacity: 0.55 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.005; scene.add(rug);
  const blob = (r, x, z) => {
    const m = new THREE.Mesh(geo(new THREE.CircleGeometry(r, 28)), basic(0x000000, { transparent: true, opacity: 0.32, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); scene.add(m); return m;
  };

  // ---- the bomb
  const bomb = new THREE.Group(); bomb.position.set(0, 1.28, -0.5); scene.add(bomb);
  const blobB = blob(1.2, 0, -0.5);
  const body = new THREE.Mesh(geo(new THREE.SphereGeometry(1.1, 40, 28)), mat(0x2c3150, { metalness: 0.55, roughness: 0.32 }));
  bomb.add(body);
  const band = new THREE.Mesh(geo(new THREE.TorusGeometry(1.1, 0.075, 10, 48)), mat(0x5b6384, { metalness: 0.6, roughness: 0.3 }));
  band.rotation.x = Math.PI / 2; band.position.y = 0.2; bomb.add(band);
  const cap = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.27, 0.32, 0.28, 20)), mat(0x7a82a3, { metalness: 0.6, roughness: 0.35 }));
  cap.position.y = 1.16; bomb.add(cap);

  // the LED panel on its front: the time (the Blind's stays blank)
  const led = document.createElement('canvas'); led.width = 256; led.height = 112;
  const ledTex = track(new THREE.CanvasTexture(led)); ledTex.colorSpace = THREE.SRGBColorSpace;
  let ledText = null;
  function drawLed(text, color) {
    if (ledText === text + color) return; ledText = text + color;
    const g = led.getContext('2d');
    g.fillStyle = '#0b1f14'; g.fillRect(0, 0, 256, 112);
    g.strokeStyle = '#27533a'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 106);
    if (text) { g.fillStyle = color; g.font = '700 64px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 60); }
    ledTex.needsUpdate = true;
  }
  const panel = new THREE.Mesh(geo(new THREE.BoxGeometry(1.2, 0.54, 0.16)), mat(0x1b1f33, { metalness: 0.4 })); panel.position.set(0, 0.02, 1.04); bomb.add(panel);
  const screen = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.08, 0.44)), basic(0xffffff, { map: ledTex })); screen.position.set(0, 0.02, 1.125); bomb.add(screen);
  drawLed('', '#000');
  const lamps = [-0.3, 0, 0.3].map((x) => {
    const m = mat(0x3a1a1f, { emissive: 0x000000 });
    const s = new THREE.Mesh(geo(new THREE.SphereGeometry(0.095, 14, 10)), m); s.position.set(x, 0.5, 0.98); bomb.add(s); return m;
  });

  // the fuse: a tube that gets shorter as time runs out; the spark sits at its burning end
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.28, 0), new THREE.Vector3(0.06, 1.68, 0), new THREE.Vector3(0.46, 2.02, 0.02), new THREE.Vector3(0.95, 1.95, 0), new THREE.Vector3(1.22, 1.6, 0)]);
  const SEG = 44;
  const fuseGeo = geo(new THREE.TubeGeometry(curve, SEG, 0.04, 6, false));
  const perSeg = fuseGeo.index.count / SEG;
  const fuse = new THREE.Mesh(fuseGeo, mat(0xd9b46a, { roughness: 0.8 })); bomb.add(fuse);
  const spark = new THREE.Group(); bomb.add(spark);
  spark.add(new THREE.Mesh(geo(new THREE.SphereGeometry(0.1, 12, 8)), basic(0xfde047)));
  spark.add(new THREE.Mesh(geo(new THREE.SphereGeometry(0.2, 12, 8)), basic(0xfb923c, { transparent: true, opacity: 0.35, depthWrite: false })));
  const sparkLight = new THREE.PointLight(0xff9a3c, 8, 7, 1.8); spark.add(sparkLight);
  let fuseF = -1;

  // ---- the crew
  const chars = {};
  function makeChar(r, x, z, ry, s) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(s); scene.add(g);
    const inner = new THREE.Group(); g.add(inner);
    const color = new THREE.Color(ROLE_HEX[r]);
    const bm = mat(color, { roughness: 0.42 });
    const head = new THREE.Mesh(geo(new THREE.SphereGeometry(0.7, 32, 24)), bm); head.position.y = 0.7; inner.add(head);
    const shine = new THREE.Mesh(geo(new THREE.SphereGeometry(0.13, 10, 8)), basic(0xffffff, { transparent: true, opacity: 0.3 })); shine.position.set(-0.28, 1.12, 0.46); shine.scale.set(1.3, 0.7, 0.5); inner.add(shine);
    const eyeW = basic(0xffffff); const eyeP = basic(DARK);
    const eyes = [];
    if (r !== 'blind') {
      [-1, 1].forEach((sx) => {
        const e = new THREE.Group(); e.position.set(sx * 0.25, 0.8, 0.58);
        e.add(new THREE.Mesh(geo(new THREE.SphereGeometry(0.15, 14, 10)), eyeW));
        const pu = new THREE.Mesh(geo(new THREE.SphereGeometry(0.075, 10, 8)), eyeP); pu.position.set(sx * 0.02, 0, 0.12); e.add(pu);
        inner.add(e); eyes.push(e);
      });
    }
    const mouths = {};
    if (r !== 'mute') {
      mouths.smile = new THREE.Mesh(geo(new THREE.TorusGeometry(0.15, 0.028, 8, 18, Math.PI)), eyeP); mouths.smile.rotation.z = Math.PI; mouths.smile.position.set(0, 0.5, 0.635);
      mouths.flat = new THREE.Mesh(geo(new THREE.BoxGeometry(0.3, 0.045, 0.05)), eyeP); mouths.flat.position.set(0, 0.45, 0.65);
      mouths.o = new THREE.Mesh(geo(new THREE.SphereGeometry(0.1, 12, 10)), eyeP); mouths.o.scale.set(1, 1.25, 0.4); mouths.o.position.set(0, 0.44, 0.64);
      mouths.big = new THREE.Mesh(geo(new THREE.SphereGeometry(0.16, 14, 10)), eyeP); mouths.big.scale.set(1.35, 1, 0.4); mouths.big.position.set(0, 0.45, 0.63);
      Object.values(mouths).forEach((m) => { m.visible = false; inner.add(m); });
    }
    if (r === 'blind') {
      const band = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.735, 0.735, 0.3, 28, 1, true)), mat(0x1f2937, { side: THREE.DoubleSide }));
      band.position.y = 0.82; inner.add(band);
      [-1, 1].forEach((sx) => { const t = new THREE.Mesh(geo(new THREE.BoxGeometry(0.22, 0.07, 0.05)), mat(0x1f2937)); t.position.set(sx * 0.2, 0.82, -0.76); t.rotation.z = sx * 0.5; inner.add(t); });
    }
    if (r === 'mute') {
      const tape = new THREE.Mesh(geo(new THREE.BoxGeometry(0.5, 0.2, 0.05)), mat(0xe5e7eb)); tape.position.set(0, 0.46, 0.665); inner.add(tape);
      [0.55, -0.55].forEach((a) => { const l = new THREE.Mesh(geo(new THREE.BoxGeometry(0.34, 0.03, 0.02)), basic(0x6b7280)); l.position.set(0, 0.46, 0.7); l.rotation.z = a; inner.add(l); });
    }
    if (r === 'deaf') {
      const bandM = mat(0x374151);
      const arc = new THREE.Mesh(geo(new THREE.TorusGeometry(0.75, 0.05, 8, 32, Math.PI)), bandM); arc.position.y = 0.74; inner.add(arc);
      [-1, 1].forEach((sx) => { const m = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.21, 0.21, 0.15, 18)), bandM); m.rotation.z = Math.PI / 2; m.position.set(sx * 0.73, 0.74, 0); inner.add(m); });
    }
    // a little fuse on top, like the icons
    const stem = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6)), mat(0xa16207)); stem.position.set(0.1, 1.44, 0); stem.rotation.z = -0.5; inner.add(stem);
    const tip = new THREE.Mesh(geo(new THREE.SphereGeometry(0.07, 8, 6)), basic(0xfde047)); tip.position.set(0.2, 1.54, 0); inner.add(tip);
    const sh = blob(0.78 * s, x, z);
    // "this one is you": a ring on the floor and a small arrow above
    let ring = null; let arrow = null;
    if (r === role) {
      ring = new THREE.Mesh(geo(new THREE.RingGeometry(0.9, 1.08, 40)), basic(color, { transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, z); scene.add(ring);
      if (r !== 'mute') { arrow = new THREE.Mesh(geo(new THREE.ConeGeometry(0.15, 0.3, 14)), basic(color)); arrow.rotation.x = Math.PI; scene.add(arrow); }   // (the Mute stands in front of the LED: the floor ring is enough)
    }
    chars[r] = { g, inner, head, bm, color, eyes, mouths, ring, arrow, sh, x, z, s, phase: Math.random() * 6 };
  }
  makeChar('blind', -2.6, 0.9, 0.55, 1);
  makeChar('deaf', 2.6, 0.9, -0.55, 1);
  makeChar('mute', 0, 2.25, 0, 0.88);

  // ---- particles
  const sparks = makePool(60, { size: 0.1 }); scene.add(sparks.pts);
  const burst = makePool(190, { size: 0.17 }); burst.grav = 7; scene.add(burst.pts);
  const fireball = new THREE.Mesh(geo(new THREE.SphereGeometry(1, 24, 16)), basic(0xfb923c, { transparent: true, opacity: 0, depthWrite: false }));
  fireball.position.copy(bomb.position); fireball.visible = false; scene.add(fireball);

  // ---- state
  let model = null; let mood = 'calm'; let moodAt = 0; let at = Date.now();
  let shake = 0; let flash = 0; let boomAt = 0; let frames = 0; let disposed = false;
  const tmp = new THREE.Color();

  function fireworks() {
    const cols = ['#fb9250', '#4fd1c1', '#a99cf7', '#fde047', '#f472b6', '#60a5fa'].map((c) => new THREE.Color(c));
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2; const sp = 1.2 + Math.random() * 2.6;
      emit(burst, (Math.random() - 0.5) * 6, 3.4 + Math.random() * 0.6, (Math.random() - 0.5) * 3, Math.cos(a) * sp * 0.5, 1 + Math.random() * 2.2, Math.sin(a) * sp * 0.4, 1.8 + Math.random() * 1.2, cols[i % cols.length]);
    }
  }
  function explode() {
    const cols = ['#fb923c', '#fde047', '#ef4444', '#9ca3af'].map((c) => new THREE.Color(c));
    for (let i = 0; i < 180; i++) {
      const a = Math.random() * Math.PI * 2; const b = (Math.random() - 0.3) * Math.PI; const sp = 3 + Math.random() * 6;
      emit(burst, bomb.position.x, bomb.position.y, bomb.position.z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp, 0.8 + Math.random() * 1.1, cols[i % cols.length]);
    }
    boomAt = performance.now(); shake = 1.4; flash = 1.2;
  }
  function setMood(next) {
    if (next === mood) return;
    mood = next; moodAt = performance.now();
    if (next === 'hit') { shake = 0.8; flash = 1; }
    else if (next === 'win') { fireworks(); }
    else if (next === 'lose') explode();
  }

  function fit() {
    const w = host.clientWidth || 300; const h = host.clientHeight || 150;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = CAM.distanceTo(LOOK);
    camera.fov = Math.max(36, (2 * Math.atan(4.7 / camera.aspect / dist) * 180) / Math.PI);
    camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(host); else window.addEventListener('resize', fit);
  fit();

  function step(dt, t) {
    if (!model) return;
    const now = Date.now();
    setMood(moodOf(model, now));
    const playing = model.status === 'playing';
    const rem = playing ? Math.max(0, model.rem - (now - at)) : model.rem;
    const since = (performance.now() - moodAt) / 1000;
    const lost = mood === 'lose'; const won = mood === 'win';

    // the LED
    if (blind) drawLed('', '#000');
    else if (won) drawLed('OK', '#6ee7a1');
    else drawLed(fmt(rem), '#ff6b5e');
    // strike lamps
    lamps.forEach((m, i) => { const on = i < model.strikes; m.color.set(on ? 0xff4d4d : 0x3a1a1f); m.emissive.set(on ? 0xff2020 : 0x000000); m.emissiveIntensity = on ? 1.4 : 0; });
    // fuse
    const f = blind || !playing ? 1 : clamp01(rem / model.total);
    const fk = Math.round(f * 400) / 400;
    if (fk !== fuseF) {
      fuseF = fk;
      fuseGeo.setDrawRange(0, Math.max(0, Math.round(SEG * f)) * perSeg);
      spark.position.copy(curve.getPoint(f));
    }
    const burning = !won && !lost;
    spark.visible = burning; fuse.visible = !lost;
    sparkLight.intensity = burning ? 7 + Math.sin(t * 40) * 2 + Math.random() * 2 : 0;
    if (burning && Math.random() < 0.9) {
      const sp = spark.position;
      emit(sparks, bomb.position.x + sp.x, bomb.position.y + sp.y, bomb.position.z + sp.z, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.35, tmp.set(Math.random() < 0.5 ? '#ffc766' : '#ff8a3c'));
    }

    // the bomb itself
    bomb.visible = !lost; blobB.visible = !lost;
    const wob = mood === 'tense' ? Math.sin(t * 18) * 0.022 : 0;
    bomb.rotation.y = Math.sin(t * 0.7) * 0.1 + wob; bomb.rotation.z = mood === 'hit' ? Math.sin(t * 50) * 0.05 * Math.exp(-since * 5) : 0;
    const pulse = mood === 'tense' ? 1 + Math.sin(t * 9) * 0.025 : 1;
    bomb.scale.setScalar(pulse);

    // the crew
    Object.values(chars).forEach((c) => {
      const p = t * 2 + c.phase;
      let y = 0; let sx = 1; let sy = 1; let rz = 0; let jx = 0;
      if (mood === 'calm') y = Math.sin(p) * 0.04 + 0.04;
      else if (mood === 'tense') { jx = Math.sin(t * 38 + c.phase) * 0.025; y = Math.abs(Math.sin(p * 3)) * 0.03; }
      else if (mood === 'hit') { const e = Math.exp(-since * 4.5); sy = 1 - 0.22 * e; sx = 1 + 0.16 * e; y = Math.max(0, Math.sin(since * 9)) * 0.25 * e; }
      else if (mood === 'cheer' || mood === 'win') y = Math.abs(Math.sin(t * 7 + c.phase)) * (mood === 'win' ? 0.55 : 0.4);
      else if (mood === 'lose') { const k = clamp01(since * 3); rz = (c.x >= 0 ? -1 : 1) * 1.25 * k + (c.x === 0 ? 1.2 * k : 0); y = -0.1 * k; sy = 1 - 0.1 * k; }
      c.inner.position.set(jx, y, 0); c.inner.scale.set(sx, sy, sx); c.inner.rotation.z = rz;
      // faces
      const squint = mood === 'hit' || mood === 'cheer' || mood === 'win' || mood === 'lose';
      c.eyes.forEach((e) => { e.scale.y = squint ? 0.18 : mood === 'tense' ? 1.3 : 1; e.scale.x = mood === 'tense' ? 1.15 : 1; });
      const m = c.mouths;
      if (m.smile) {
        m.smile.visible = mood === 'calm'; m.flat.visible = mood === 'tense' || mood === 'lose'; m.o.visible = mood === 'hit'; m.big.visible = mood === 'cheer' || mood === 'win';
        m.flat.position.x = mood === 'tense' ? Math.sin(t * 30) * 0.02 : 0;
      }
      // soot after the explosion
      tmp.copy(c.color); if (lost) tmp.multiplyScalar(0.35);
      c.bm.color.lerp(tmp, 0.2);
      if (c.arrow) { c.arrow.position.set(c.x, 1.95 * c.s + Math.sin(t * 3) * 0.08, c.z); c.arrow.visible = !lost; }
      if (c.ring) { const k = 1 + Math.sin(t * 3) * 0.05; c.ring.scale.set(k, k, k); }
    });

    // lights + camera
    flash *= Math.exp(-dt * 4.5); shake *= Math.exp(-dt * 5);
    alarm.intensity = flash * (blind ? 40 : 55);
    happy.intensity = won ? 18 + Math.sin(t * 6) * 5 : 0;
    camera.position.set(CAM.x + (Math.random() - 0.5) * shake * 0.35, CAM.y + (Math.random() - 0.5) * shake * 0.25 + Math.sin(t * 0.5) * 0.06, CAM.z + Math.sin(t * 0.35) * 0.12);
    camera.lookAt(LOOK);

    // fireball
    if (boomAt) {
      const e = (performance.now() - boomAt) / 1000;
      fireball.visible = e < 0.9; fireball.scale.setScalar(0.4 + e * 4.2); fireball.material.opacity = Math.max(0, 1 - e / 0.9) * 0.9;
    }
    stepPool(sparks, dt); stepPool(burst, dt);
  }

  let raf = 0; let last = 0;
  function frame(ts) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || ts - last < 30) return;
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    step(dt, ts / 1000);
    renderer.render(scene, camera);
    frames += 1;
  }
  raf = requestAnimationFrame(frame);

  return {
    canvas,
    update(m) { model = m; at = Date.now(); },
    stats: () => ({ frames, mood }),
    destroy() {
      disposed = true; cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', fit);
      dispose.forEach((o) => { try { o.dispose(); } catch (e) { /* ignore */ } });
      [sparks, burst].forEach((p) => { p.geo.dispose(); p.mat.dispose(); });
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      canvas.remove();
    },
  };
}
