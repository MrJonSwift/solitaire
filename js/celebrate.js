// Win celebration: the classic "bouncing cards" cascade, drawn on a full-screen canvas.
// Cards leave trails because the canvas is intentionally not cleared between frames.
import { SUIT_SYMBOLS, rankLabel, isRed } from './game.js';

let raf = 0;
let canvasEl = null;

function makeSprite(card, cw, ch, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(cw * dpr);
  c.height = Math.ceil(ch * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const r = cw * 0.09;
  g.beginPath();
  g.moveTo(r, 0.5);
  g.arcTo(cw - 0.5, 0.5, cw - 0.5, ch - 0.5, r);
  g.arcTo(cw - 0.5, ch - 0.5, 0.5, ch - 0.5, r);
  g.arcTo(0.5, ch - 0.5, 0.5, 0.5, r);
  g.arcTo(0.5, 0.5, cw - 0.5, 0.5, r);
  g.closePath();
  g.fillStyle = '#fff';
  g.fill();
  g.strokeStyle = '#999';
  g.stroke();
  g.fillStyle = isRed(card.suit) ? '#d1162c' : '#1b1b1b';
  g.textBaseline = 'top';
  const font = '-apple-system, Helvetica, Arial, sans-serif';
  const sym = SUIT_SYMBOLS[card.suit];
  g.font = `700 ${cw * 0.4}px ${font}`;
  g.textAlign = 'left';
  g.fillText(rankLabel(card.rank), cw * 0.06, cw * 0.05);
  g.textAlign = 'right';
  g.font = `700 ${cw * 0.45}px ${font}`;
  g.fillText(sym, cw * 0.94, cw * 0.03);
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.font = `${cw * 0.98}px ${font}`;
  g.fillText(sym, cw / 2, ch * 0.98);
  return c;
}

export function startCelebration(canvas, { cw, ch, piles }) {
  stopCelebration();
  canvasEl = canvas;
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.hidden = false;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Kings first, then queens, and so on, cycling through the four foundations.
  const queue = [];
  for (let rank = 13; rank >= 1; rank--) {
    for (const p of piles) {
      const card = p.cards.find((c) => c.rank === rank);
      if (card) queue.push({ sprite: makeSprite(card, cw, ch, dpr), x: p.x, y: p.y });
    }
  }
  if (!queue.length) return;

  const scale = cw / 60;
  const gravity = 0.45 * scale;
  let next = 0;
  let lastLaunch = -Infinity;
  let last = performance.now();
  const active = [];

  const launch = () => {
    if (next > 0 && next % queue.length === 0) ctx.clearRect(0, 0, W, H); // start a fresh round
    const item = queue[next++ % queue.length];
    const dir = Math.random() < 0.5 ? -1 : 1;
    active.push({ ...item, vx: dir * (2 + Math.random() * 4) * scale, vy: -Math.random() * 7 * scale });
  };

  const frame = (now) => {
    const dt = Math.min(3, (now - last) / 16.667);
    last = now;
    if (now - lastLaunch > 450) { launch(); lastLaunch = now; }
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      a.vy += gravity * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.y + ch > H) { a.y = H - ch; a.vy = -a.vy * 0.78; }
      ctx.drawImage(a.sprite, a.x, a.y, cw, ch);
      if (a.x > W || a.x + cw < 0) active.splice(i, 1);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

export function stopCelebration() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (canvasEl) {
    canvasEl.getContext('2d').clearRect(0, 0, canvasEl.width, canvasEl.height);
    canvasEl.hidden = true;
  }
}
