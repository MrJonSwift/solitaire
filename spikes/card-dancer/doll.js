// SPIKE — throwaway. The same salsa, as a flat paper doll: card-shaped pieces rotated
// in 2D and drawn back to front. No Three.js. The point is the cost comparison: if this
// reads anywhere near as well as the 3D figure, the idea does not need a 3D engine.
import { sample, LOOP } from './motion.js';

const params = new URLSearchParams(location.search);
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
if (params.get('ui') === '0') document.documentElement.classList.add('nohud');

// --- card art (same layout as js/celebrate.js, no Three) -------------------
const FONT = '-apple-system, Helvetica, Arial, sans-serif';
const SUITS = { S: '\u2660\uFE0E', H: '\u2665\uFE0E', D: '\u2666\uFE0E', C: '\u2663\uFE0E' };
const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const CW = 96;
const CH = 134;

function roundRect(g, cw, ch) {
  const r = cw * 0.09;
  g.beginPath();
  g.moveTo(r, 0.5);
  g.arcTo(cw - 0.5, 0.5, cw - 0.5, ch - 0.5, r);
  g.arcTo(cw - 0.5, ch - 0.5, 0.5, ch - 0.5, r);
  g.arcTo(0.5, ch - 0.5, 0.5, 0.5, r);
  g.arcTo(0.5, 0.5, cw - 0.5, 0.5, r);
  g.closePath();
}

function face(rank, suit) {
  const c = document.createElement('canvas');
  c.width = CW * 2;
  c.height = CH * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  roundRect(g, CW, CH);
  g.fillStyle = '#fff';
  g.fill();
  g.strokeStyle = '#9a9a9a';
  g.lineWidth = 1.3;
  g.stroke();
  g.save();
  g.clip();
  g.fillStyle = suit === 'H' || suit === 'D' ? '#d1162c' : '#1b1b1b';
  const sym = SUITS[suit];
  g.textBaseline = 'top';
  g.font = `700 ${CW * 0.4}px ${FONT}`;
  g.textAlign = 'left';
  g.fillText(RANKS[rank] || String(rank), CW * 0.06, CW * 0.05);
  g.textAlign = 'right';
  g.font = `700 ${CW * 0.45}px ${FONT}`;
  g.fillText(sym, CW * 0.94, CW * 0.03);
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.font = `${CW * 0.98}px ${FONT}`;
  g.fillText(sym, CW / 2, CH * 0.98);
  g.restore();
  return c;
}

function back() {
  const c = document.createElement('canvas');
  c.width = CW * 2;
  c.height = CH * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  roundRect(g, CW, CH);
  g.fillStyle = '#f6f1e6';
  g.fill();
  g.save();
  g.clip();
  g.translate(CW / 2, CH / 2);
  g.rotate(Math.PI / 4);
  g.strokeStyle = 'rgba(206, 96, 112, 0.26)';
  g.lineWidth = 1;
  for (let x = -CW; x <= CW; x += 9) { g.beginPath(); g.moveTo(x, -CH); g.lineTo(x, CH); g.stroke(); }
  for (let y = -CH; y <= CH; y += 9) { g.beginPath(); g.moveTo(-CW, y); g.lineTo(CW, y); g.stroke(); }
  g.restore();
  g.strokeStyle = '#c8102e';
  g.lineWidth = 1.4;
  roundRect(g, CW, CH);
  g.stroke();
  return c;
}

const ART = {
  QH: face(12, 'H'),
  back: back(),
  faces: [face(13, 'S'), face(11, 'C'), face(7, 'H'), face(10, 'S'), face(3, 'D'), face(9, 'C')],
};
const pick = (i) => ART.faces[(i * 7 + 3) % ART.faces.length];

// --- skeleton ---------------------------------------------------------------
// Units, canvas orientation (y down), origin at the hip joint. `dir` is the direction
// the bone runs from its joint in its own frame: +1 up the spine, -1 down a limb, 0 a
// shoe. Children are attached in the parent's rotated frame, exactly like the 3D rig, so
// the same `motion.js` keyframes drive it. A joint's canvas rotation is -z; that is the
// projection of the 3D rig's sideways swing.
const BONES = [
  { name: 'hips', parent: null, at: [0, 0], len: 0.12, dir: -1, cards: 2, ch: 0.22, across: 0.05 },
  { name: 'spine', parent: 'hips', at: [0, -0.12], len: 0.18, dir: -1, cards: 1, ch: 0.26 },
  { name: 'chest', parent: 'spine', at: [0, -0.18], len: 0.20, dir: -1, cards: 2, ch: 0.26, across: 0.05 },
  { name: 'neck', parent: 'chest', at: [0, -0.20], len: 0.05, dir: -1, cards: 1, ch: 0.12 },
  { name: 'head', parent: 'neck', at: [0, -0.05], len: 0.18, dir: -1, cards: 0, ch: 0.30 },

  { name: 'armR', parent: 'chest', at: [-0.15, -0.15], len: 0.26, dir: 1, cards: 2, ch: 0.17 },
  { name: 'foreR', parent: 'armR', at: [0, 0.26], len: 0.24, dir: 1, cards: 2, ch: 0.16 },
  { name: 'handR', parent: 'foreR', at: [0, 0.24], len: 0.09, dir: 1, cards: 1, ch: 0.13 },
  { name: 'armL', parent: 'chest', at: [0.15, -0.15], len: 0.26, dir: 1, cards: 2, ch: 0.17 },
  { name: 'foreL', parent: 'armL', at: [0, 0.26], len: 0.24, dir: 1, cards: 2, ch: 0.16 },
  { name: 'handL', parent: 'foreL', at: [0, 0.24], len: 0.09, dir: 1, cards: 1, ch: 0.13 },

  { name: 'thighR', parent: 'hips', at: [-0.08, 0.02], len: 0.50, dir: 1, cards: 2, ch: 0.26 },
  { name: 'shinR', parent: 'thighR', at: [0, 0.50], len: 0.50, dir: 1, cards: 2, ch: 0.24 },
  { name: 'footR', parent: 'shinR', at: [0, 0.50], len: 0.12, dir: 0, cards: 1, ch: 0.15 },
  { name: 'thighL', parent: 'hips', at: [0.08, 0.02], len: 0.50, dir: 1, cards: 2, ch: 0.26 },
  { name: 'shinL', parent: 'thighL', at: [0, 0.50], len: 0.50, dir: 1, cards: 2, ch: 0.24 },
  { name: 'footL', parent: 'shinL', at: [0, 0.50], len: 0.12, dir: 0, cards: 1, ch: 0.15 },
];
const BY = Object.fromEntries(BONES.map((b) => [b.name, b]));

const HIP_Y = 1.0; // floor to hip joint, in world units
const CARD_H = 0.155;
const DEG = Math.PI / 180;

function card(g, art, x, y, w, h) {
  g.shadowColor = 'rgba(0, 0, 0, 0.30)';
  g.shadowBlur = 3;
  g.shadowOffsetY = 1.5;
  g.drawImage(art, x, y, w, h);
  g.shadowColor = 'transparent';
}

function drawBone(g, b, seed) {
  if (!b.cards) return;
  const step = b.len / b.cards;
  const h = b.ch;
  const w = h * (CW / CH);
  for (let i = 0; i < b.cards; i++) {
    const along = step * (i + 0.5);
    const side = b.cards > 1 ? (i % 2 ? 1 : -1) : 1;
    const across = b.across ? (i % 2 ? 1 : -1) * b.across : 0;
    g.save();
    if (b.dir === 0) {
      // A shoe: flat, pointing forward, pinned to the ankle.
      g.rotate(-90 * DEG);
      g.translate(0, -h * 0.15);
      card(g, ART.back, -h * 0.42, -w / 2, h * 0.84, w);
    } else {
      g.translate(across + side * 0.01, b.dir * along);
      g.rotate(side * 0.06);
      card(g, pick(seed + i), -w / 2, -h / 2, w, h);
    }
    g.restore();
  }
}

// Two tiers of cards fanning down and out from the hips. The hips frame points up, so
// down is -y.
function drawSkirt(g, tier) {
  const n = tier === 0 ? 7 : 9;
  const r = tier === 0 ? 0.07 : 0.12;
  const drop = tier === 0 ? 0.0 : 0.05;
  const h = tier === 0 ? 0.24 : 0.30;
  const w = h * (CW / CH);
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const spread = (u - 0.5) * (tier === 0 ? 1.6 : 2.0);
    g.save();
    g.rotate(spread);
    g.translate(0, drop + r);
    g.rotate(tier === 0 ? -0.08 : 0.1);
    card(g, tier === 0 ? ART.back : pick(i + tier * 5), -w / 2, -h / 2, w, h);
    g.restore();
  }
}

// Hair behind the head: cards hang down the back and sweep to one side.
function drawHair(g) {
  const h = 0.34;
  const w = h * (CW / CH) * 0.95;
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    g.save();
    g.rotate((u - 0.5) * 1.7);
    g.translate(0, h * 0.12);
    card(g, ART.back, -w / 2, -h / 2, w, h);
    g.restore();
  }
}

// --- pose -> matrices -------------------------------------------------------
function place(pose) {
  const m = {};
  for (const b of BONES) {
    const local = new DOMMatrix();
    if (b.parent) local.translateSelf(b.at[0], b.at[1]);
    else local.translateSelf(pose.root[0], -HIP_Y - pose.root[1]);
    const j = pose.joints[b.name] || [0, 0, 0];
    // A limb swinging toward the camera (x) foreshortens; the sideways swing (z) is the
    // screen-plane rotation.
    const depth = 0.82 + 0.18 * Math.cos(j[0]);
    const swing = j[2] + j[0] * 0.75;
    local.rotateSelf(0, 0, (-swing * 180) / Math.PI);
    local.scaleSelf(1, depth);
    m[b.name] = b.parent ? m[b.parent].multiply(local) : local;
  }
  return m;
}

// --- draw -------------------------------------------------------------------
const canvas = document.getElementById('doll');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
let W = 1;
let H = 1;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

function drawFigure(pose) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0d3a2c';
  ctx.fillRect(0, 0, W, H);

  const px = (H * 0.88) / 1.95;
  const originX = W / 2;
  const originY = H * 0.965;

  ctx.save();
  ctx.translate(originX + pose.root[0] * px * 0.7, originY - 4);
  ctx.scale(1, 0.22);
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 92);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const m = place(pose);
  const base = new DOMMatrix().translateSelf(originX, originY).scaleSelf(px, px);
  const part = (name, fn) => {
    const t = base.multiply(m[name]);
    ctx.save();
    ctx.setTransform(dpr * t.a, dpr * t.b, dpr * t.c, dpr * t.d, dpr * t.e, dpr * t.f);
    fn(ctx);
    ctx.restore();
  };

  // Painter's order: hair, far side, body, near side, head.
  part('head', (g) => drawHair(g));
  part('handR', (g) => drawBone(g, BY.handR, 3));
  part('foreR', (g) => drawBone(g, BY.foreR, 2));
  part('armR', (g) => drawBone(g, BY.armR, 1));
  part('footR', (g) => drawBone(g, BY.footR, 6));
  part('shinR', (g) => drawBone(g, BY.shinR, 5));
  part('thighR', (g) => drawBone(g, BY.thighR, 4));

  part('hips', (g) => drawSkirt(g, 0));
  part('spine', (g) => drawBone(g, BY.spine, 8));
  part('chest', (g) => drawBone(g, BY.chest, 9));
  part('hips', (g) => drawBone(g, BY.hips, 7));
  part('hips', (g) => drawSkirt(g, 1));

  part('neck', (g) => {
    const h = CARD_H * 0.95;
    const w = h * (CW / CH);
    card(g, ART.QH, -w / 2, -h * 0.75, w, h);
  });
  part('head', (g) => {
    const h = CARD_H * 1.75;
    const w = h * (CW / CH);
    card(g, ART.QH, -w / 2, -h * 0.86, w, h);
  });

  part('thighL', (g) => drawBone(g, BY.thighL, 10));
  part('shinL', (g) => drawBone(g, BY.shinL, 11));
  part('footL', (g) => drawBone(g, BY.footL, 12));
  part('armL', (g) => drawBone(g, BY.armL, 13));
  part('foreL', (g) => drawBone(g, BY.foreL, 14));
  part('handL', (g) => drawBone(g, BY.handL, 15));
}

// --- state ------------------------------------------------------------------
const scrub = document.getElementById('scrub');
let time = params.has('t') ? num(params.get('t'), 0) : 0;
let paused = params.has('t');
let ready = false;

function syncHud() {
  scrub.value = time.toFixed(2);
  document.getElementById('tv').textContent = `${time.toFixed(2)}s`;
  document.getElementById('play').textContent = paused ? 'play' : 'pause';
}

document.getElementById('play').addEventListener('click', () => {
  paused = !paused;
  syncHud();
});
scrub.addEventListener('input', (e) => {
  time = Number(e.target.value);
  paused = true;
  syncHud();
  drawFigure(sample(time));
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) time = (time + dt) % LOOP;
  drawFigure(sample(time));
  if (!ready) {
    ready = true;
    window.__ready = true;
  }
  if (!paused) syncHud();
  requestAnimationFrame(frame);
}

resize();
window.addEventListener('resize', resize);
syncHud();
requestAnimationFrame(frame);
