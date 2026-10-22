// Win celebration: the classic "bouncing cards" cascade, drawn on a full-screen canvas.
// Cards leave trails because the canvas is intentionally not cleared between frames.
import { SUIT_SYMBOLS, rankLabel, isRed } from './game.js';
import { computeCelebrationGeometry } from './celebration-geometry.js';

let raf = 0;
let canvasEl = null;
let removeViewportListeners = null;

// The canvas box, not the window, is the truth. On iOS the two disagree while Safari
// shows or hides its toolbars, and the fixed canvas can reach under the home indicator
// even though #app's padding stops the board there.
function readInsets(rect) {
  const app = document.getElementById('app');
  if (!app) return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(app);
  const appRect = app.getBoundingClientRect();
  const px = (value) => parseFloat(value) || 0;
  // #app follows the dynamic viewport (100dvh) while the fixed canvas can stay as tall as
  // the layout viewport when Safari's toolbar is showing. Count that hidden strip as inset.
  const hiddenBelow = Math.max(0, rect.bottom - appRect.bottom);
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom) + hiddenBelow,
    left: px(style.paddingLeft),
  };
}

function readStage(canvas) {
  const rect = canvas.getBoundingClientRect();
  return { rect, insets: readInsets(rect), dpr: window.devicePixelRatio || 1 };
}

function geometryFrom(stage, cw, ch) {
  return computeCelebrationGeometry({
    rect: stage.rect,
    insets: stage.insets,
    dpr: stage.dpr,
    cardWidth: cw,
    cardHeight: ch,
  });
}

function measure(canvas, cw, ch) {
  return geometryFrom(readStage(canvas), cw, ch);
}

function fitCanvas(canvas, geometry) {
  canvas.width = geometry.pixelWidth;
  canvas.height = geometry.pixelHeight;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(geometry.dpr, 0, 0, geometry.dpr, 0, 0);
  return ctx;
}

// The board re-renders on its own ResizeObserver, so the card size can change under a
// running celebration (toolbar, rotation). Read it from the same custom properties the
// board sets, and fall back to the size the celebration was started with.
function readCardSize(fallbackW, fallbackH) {
  const board = document.getElementById('board');
  if (!board) return { cw: fallbackW, ch: fallbackH };
  const style = getComputedStyle(board);
  const size = (value, fallback) => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    cw: size(style.getPropertyValue('--cw'), fallbackW),
    ch: size(style.getPropertyValue('--ch'), fallbackH),
  };
}

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
  canvas.hidden = false;
  let geometry = measure(canvas, cw, ch);
  const ctx = fitCanvas(canvas, geometry);

  let cardW = cw;
  let cardH = ch;
  let spriteW = cw;
  let spriteH = ch;
  let spriteDpr = geometry.dpr;

  // Kings first, then queens, and so on, cycling through the four foundations. Origins
  // stay in viewport coordinates; each launch rebases them against the current canvas.
  const queue = [];
  for (let rank = 13; rank >= 1; rank--) {
    for (let i = 0; i < piles.length; i++) {
      const p = piles[i];
      const card = p.cards.find((c) => c.rank === rank);
      if (card) queue.push({ card, foundation: i, x: p.x, y: p.y, sprite: makeSprite(card, cw, ch, geometry.dpr) });
    }
  }
  if (!queue.length) return;

  // The foundations are live slots: the board may move them while the celebration runs.
  const foundationEls = Array.from(document.querySelectorAll('#board .slot.foundation'));
  const pileOrigin = (item) => {
    const el = foundationEls[item.foundation];
    if (!el) return item;
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  };

  const refreshSprites = () => {
    if (cardW === spriteW && cardH === spriteH && geometry.dpr === spriteDpr) return;
    spriteW = cardW;
    spriteH = cardH;
    spriteDpr = geometry.dpr;
    for (const item of queue) item.sprite = makeSprite(item.card, cardW, cardH, spriteDpr);
  };

  const syncCardSize = () => {
    const size = readCardSize(cardW, cardH);
    const changed = size.cw !== cardW || size.ch !== cardH;
    cardW = size.cw;
    cardH = size.ch;
    refreshSprites();
    return changed;
  };

  const scale = cw / 60;
  const gravity = 0.45 * scale;
  let next = 0;
  let lastLaunch = -Infinity;
  let last = performance.now();
  const active = [];

  const launch = () => {
    // The board's ResizeObserver can update the card size just after our frame runs.
    // Re-read here so new launches always use the live size and floor.
    if (syncCardSize()) geometry = measure(canvas, cardW, cardH);
    if (next > 0 && next % queue.length === 0) ctx.clearRect(0, 0, geometry.width, geometry.height); // start a fresh round
    const item = queue[next++ % queue.length];
    const origin = pileOrigin(item);
    const dir = Math.random() < 0.5 ? -1 : 1;
    active.push({
      sprite: item.sprite,
      x: origin.x - geometry.left,
      y: origin.y - geometry.top,
      w: cardW,
      h: cardH,
      vx: dir * (2 + Math.random() * 4) * scale,
      vy: -Math.random() * 7 * scale,
    });
  };

  // Resize events can arrive in bursts while the toolbar animates. Mark dirty and do the
  // measuring once in the next frame, never on the event itself. A fixed canvas does not
  // move when the visual viewport scrolls, so scroll is deliberately not observed.
  let dirty = false;
  const applyViewportChange = () => {
    if (!canvasEl || canvasEl.hidden) return;
    const stage = readStage(canvasEl);
    const size = readCardSize(cardW, cardH);
    cardW = size.cw;
    cardH = size.ch;
    const nextGeometry = geometryFrom(stage, cardW, cardH);
    const realloc = nextGeometry.pixelWidth !== geometry.pixelWidth
      || nextGeometry.pixelHeight !== geometry.pixelHeight
      || nextGeometry.dpr !== geometry.dpr;
    geometry = nextGeometry;
    // Reallocating clears the canvas, so only do it when the backing store really changed.
    // An origin-only change just rebases the next launch and leaves the trails alone.
    if (realloc) fitCanvas(canvasEl, nextGeometry);
    refreshSprites();
  };
  const handleViewportChange = () => { dirty = true; };
  window.addEventListener('resize', handleViewportChange);
  const viewport = window.visualViewport;
  if (viewport) viewport.addEventListener('resize', handleViewportChange);
  removeViewportListeners = () => {
    window.removeEventListener('resize', handleViewportChange);
    if (viewport) viewport.removeEventListener('resize', handleViewportChange);
  };

  const frame = (now) => {
    if (dirty) { dirty = false; applyViewportChange(); }
    const dt = Math.min(3, (now - last) / 16.667);
    last = now;
    if (now - lastLaunch > 450) { launch(); lastLaunch = now; }
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      a.vy += gravity * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.y > geometry.floorY) { a.y = geometry.floorY; a.vy = -a.vy * 0.78; }
      ctx.drawImage(a.sprite, a.x, a.y, a.w, a.h);
      if (a.x > geometry.width || a.x + a.w < 0) active.splice(i, 1);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

export function stopCelebration() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (removeViewportListeners) { removeViewportListeners(); removeViewportListeners = null; }
  if (canvasEl) {
    const ctx = canvasEl.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.restore();
    canvasEl.hidden = true;
  }
  canvasEl = null;
}
