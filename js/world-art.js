// world-art.js — little textures and helpers for the 3D world (everything is drawn here, nothing is downloaded).
import * as THREE from '../vendor/three.module.min.js';
import { BR } from './senses.js';

export const FONT = '"Cairo", "Segoe UI", system-ui, sans-serif';

// a canvas turned into a texture
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function labelTex(text, { fg = '#fff', bg = null, w = 128, h = 128, size = 80, weight = 800, radius = 18, stroke = null } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; rr(g, 0, 0, w, h, radius); g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 6; rr(g, 3, 3, w - 6, h - 6, radius); g.stroke(); }
    g.fillStyle = fg; g.font = `${weight} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(text), w / 2, h / 2 + size * 0.06);
  });
}
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// braille: the number sign (dots 3-4-5-6) and one cell per digit. Dots: 1 2 3 down the left, 4 5 6 down the right.
const DOT = { 1: [0, 0], 2: [0, 1], 3: [0, 2], 4: [1, 0], 5: [1, 1], 6: [1, 2] };
export function brailleTex(n, { on = '#ffffff', off = 'rgba(255,255,255,.2)', bg = null } = {}) {
  const cells = [[3, 4, 5, 6], ...String(n).split('').map((d) => BR[d])];
  const cw = 56; const w = cells.length * cw + 20; const h = 110;
  return { w, h, tex: canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; rr(g, 0, 0, w, h, 16); g.fill(); }
    cells.forEach((cell, ci) => {
      for (let d = 1; d <= 6; d++) {
        const [cx, cy] = DOT[d]; const lit = cell.includes(d);
        g.fillStyle = lit ? on : off;
        g.beginPath(); g.arc(10 + ci * cw + 14 + cx * 24, 18 + cy * 37, lit ? 9 : 4, 0, Math.PI * 2); g.fill();
      }
    });
  }) };
}

// the eight symbols, drawn as shapes (no font needed)
export function drawSymbol(g, sym, cx, cy, r) {
  g.beginPath();
  const poly = (pts) => { pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * r, cy + y * r) : g.moveTo(cx + x * r, cy + y * r))); g.closePath(); };
  switch (sym) {
    case '★': poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const k = i % 2 ? 0.42 : 1; return [Math.cos(a) * k, Math.sin(a) * k]; })); break;
    case '◆': poly([[0, -1], [0.78, 0], [0, 1], [-0.78, 0]]); break;
    case '●': g.arc(cx, cy, r * 0.88, 0, Math.PI * 2); break;
    case '▲': poly([[0, -0.95], [0.95, 0.75], [-0.95, 0.75]]); break;
    case '■': poly([[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]); break;
    case '♥':
      g.moveTo(cx, cy + r * 0.9); g.bezierCurveTo(cx - r * 1.35, cy + r * 0.1, cx - r * 0.85, cy - r * 1.0, cx, cy - r * 0.35);
      g.bezierCurveTo(cx + r * 0.85, cy - r * 1.0, cx + r * 1.35, cy + r * 0.1, cx, cy + r * 0.9); break;
    case '✚': poly([[-0.3, -0.95], [0.3, -0.95], [0.3, -0.3], [0.95, -0.3], [0.95, 0.3], [0.3, 0.3], [0.3, 0.95], [-0.3, 0.95], [-0.3, 0.3], [-0.95, 0.3], [-0.95, -0.3], [-0.3, -0.3]]); break;
    case '☾':
      g.arc(cx, cy, r * 0.9, -Math.PI * 0.62, Math.PI * 0.62, false);
      g.arc(cx + r * 0.42, cy, r * 0.72, Math.PI * 0.55, -Math.PI * 0.55, true); break;
    default: g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  }
  g.fill();
}
export function symbolTex(sym, { fg = '#1b1f2e', bg = '#e9e4d2', size = 192 } = {}) {
  return canvasTex(size, size, (g) => {
    g.fillStyle = bg; rr(g, 0, 0, size, size, 28); g.fill();
    g.fillStyle = fg; drawSymbol(g, sym, size / 2, size / 2, size * 0.32);
  });
}

// a dark green LCD with a glowing number (the Deaf's code screens)
export function lcdTex(digit, name, frame) {
  return canvasTex(192, 256, (g, w, h) => {
    g.fillStyle = '#06130c'; g.fillRect(0, 0, w, h);
    g.fillStyle = frame; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    g.shadowColor = '#6fffa8'; g.shadowBlur = 26; g.fillStyle = '#e8fff0';
    g.font = `900 150px ui-monospace, Menlo, Consolas, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(digit), w / 2, h / 2 - 8);
    g.shadowBlur = 0; g.fillStyle = '#cfd4ea'; g.font = `800 30px ${FONT}`;
    g.fillText(name, w / 2, h - 40);
  });
}

// the bomb's red 7-segment-ish time display; call draw(text) whenever the text changes
export function ledScreen(w = 256, h = 96) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  let last = null;
  return {
    tex,
    draw(text, color = '#ff5a4d') {
      if (last === text + color) return; last = text + color;
      g.fillStyle = '#0b130d'; g.fillRect(0, 0, w, h);
      if (text) { g.shadowColor = color; g.shadowBlur = 16; g.fillStyle = color; g.font = `800 ${h * 0.72}px ui-monospace, Menlo, Consolas, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4); g.shadowBlur = 0; }
      tex.needsUpdate = true;
    },
  };
}

export function hazardTex() {
  return canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#facc15'; g.fillRect(0, 0, w, h); g.fillStyle = '#12141c';
    for (let x = -h; x < w + h; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  });
}

// everything made for one module / one scene, freed together
export function makeKit() {
  const items = [];
  const own = (o) => { items.push(o); return o; };
  return {
    own,
    std: (color, o = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o })),
    basic: (color, o = {}) => own(new THREE.MeshBasicMaterial({ color, ...o })),
    geo: (g) => own(g),
    tex: (t) => own(t),
    dispose() { items.forEach((o) => { try { o.dispose && o.dispose(); } catch (e) { /* ignore */ } }); items.length = 0; },
  };
}
