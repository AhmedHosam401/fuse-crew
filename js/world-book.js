// world-book.js — a real open book for the 3D world: leather cover, two blocks of pages with visible edges, a gutter, a ribbon,
// brass corners. Local frame: the middle of the gutter, on the surface of the pages, is the origin, +x to the right, +y out of the page,
// +z toward the reader (the bottom of the pages). The Mute's manual (HTML, two pages) is laid exactly on the open pages by world3d.js;
// W x H is the size of ONE page. text: draw lines of "text" on the pages (for the copies the others see).
import * as THREE from '../vendor/three.module.min.js';
import { canvasTex } from './world-art.js';

const CREAM = '#f1e8cf';

function edgeTex(kit) {
  const t = kit.tex(canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#e9dfc2'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = y % 6 ? 'rgba(120,98,60,.30)' : 'rgba(255,255,255,.35)'; g.fillRect(0, y, w, 1); }
  }));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function textTex(kit, seed) {
  return kit.tex(canvasTex(128, 160, (g, w, h) => {
    g.fillStyle = CREAM; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,45,25,.55)';
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    g.fillRect(14, 14, 56, 7);                              // a heading
    for (let y = 32; y < h - 14; y += 9) g.fillRect(14, y, 60 + rnd() * 48, 3);
  }));
}

// W x H = size of one page. text: draw lines on the pages (for the small copy)
export function makeBook(W, H, kit, { text = false } = {}) {
  const g = new THREE.Group();
  const T = Math.max(0.05, Math.min(0.24, 0.045 + W * 0.075));       // thickness of a block of pages
  const C = Math.max(0.03, Math.min(0.07, W * 0.07));                // thickness of the cover boards
  const gap = Math.max(0.02, W * 0.05);                              // the gutter
  const over = Math.max(0.03, W * 0.06);                             // how far the cover sticks out around the pages
  const leather = kit.std(0x6a3a2a, { roughness: 0.6 });
  const brass = kit.std(0xc9a24a, { metalness: 0.65, roughness: 0.35 });
  const et = edgeTex(kit); et.repeat.set(1, Math.max(1, Math.round(T * 40 / 8)));
  const etSide = et.clone(); etSide.repeat.set(1, et.repeat.y); etSide.needsUpdate = true; kit.tex(etSide);
  const edge = kit.std(0xffffff, { map: et, roughness: 0.95 });
  const edgeS = kit.std(0xffffff, { map: etSide, roughness: 0.95 });
  const paper = (n) => kit.std(text ? 0xffffff : CREAM, { map: text ? textTex(kit, n) : null, roughness: 0.92 });
  const blockMats = (n) => [edgeS, edgeS, paper(n), edgeS, edge, edge];   // +x, -x, +y, -y, +z, -z
  const box = (w, h, d, mats, x, y, z) => { const m = new THREE.Mesh(kit.geo(new THREE.BoxGeometry(w, h, d)), mats); m.position.set(x, y, z); g.add(m); return m; };

  // the two blocks of pages (the right one's top face is the surface the manual is laid on)
  const px = (W + gap) / 2;
  box(W, T, H, blockMats(1), px, -T / 2, 0);
  box(W, T, H, blockMats(2), -px, -T / 2, 0);
  // gutter (dark crease) and the cover boards under everything
  box(gap, T * 0.9, H, kit.std(0x3b2c1c, { roughness: 1 }), 0, -T * 0.45, 0);
  const cw = 2 * W + gap + 2 * over;
  box(cw, C, H + 2 * over, leather, 0, -T - C / 2, 0);
  // spine: a rounded strip along the gutter, under the cover
  const spine = new THREE.Mesh(kit.geo(new THREE.CylinderGeometry(gap * 0.9 + C * 0.5, gap * 0.9 + C * 0.5, H + 2 * over, 16, 1, false, 0, Math.PI)), leather);
  spine.rotation.set(Math.PI / 2, 0, 0); spine.position.set(0, -T - C * 0.2, 0); spine.rotation.y = Math.PI; g.add(spine);
  // brass corners on the right-hand side (and the left)
  const k = Math.max(0.05, C * 1.4);
  [W + gap / 2 + over - k / 2, -(W + gap / 2 + over) + k / 2].forEach((x) => [1, -1].forEach((s) => {
    box(k, C * 1.25, k, brass, x, -T - C / 2 + 0.002, s * (H / 2 + over - k / 2));
  }));
  // ribbon bookmark hanging out of the bottom of the book
  box(Math.max(0.035, W * 0.035), 0.012, Math.max(0.22, H * 0.28), kit.std(0xb91c1c, { roughness: 0.7 }), W * 0.3, -T - 0.002, H / 2 + Math.max(0.1, H * 0.1));
  return { group: g, T, C, over, gap, cw };
}
