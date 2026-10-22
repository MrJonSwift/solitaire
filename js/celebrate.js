// Win celebration: one pass of the classic "bouncing cards" cascade, drawn on a full-screen
// canvas. Cards leave trails because the canvas is intentionally not cleared between frames.
// The sequence itself comes from the pure choreography module; this file only draws and fades.
import { SUIT_SYMBOLS, rankLabel, isRed } from './game.js';
import { computeCelebrationGeometry } from './celebration-geometry.js';
import { buildWinSequence, sampleSequence } from './choreography.js';
import { startDancer } from './dancer.js';
import { readStage, FADE_MS, SKIP_FADE_MS } from './celebration-stage.js';

let raf = 0;
let canvasEl = null;
let removeListeners = null;
let session = null;

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

function clearCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// Tear the current celebration down. `completed` tells onWin whether the player reached the
// end (naturally or by skipping) or the celebration was cancelled by a new deal.
function teardown(completed) {
  if (!session) return;
  const current = session;
  session = null;
  cancelAnimationFrame(raf);
  raf = 0;
  clearTimeout(current.fadeTimer);
  if (removeListeners) { removeListeners(); removeListeners = null; }
  clearCanvas(current.canvas);
  current.canvas.hidden = true;
  current.canvas.style.transition = '';
  current.canvas.style.opacity = '';
  if (canvasEl === current.canvas) canvasEl = null;
  current.resolve(completed);
}

function beginFade(ms) {
  if (!session || session.fading) return;
  session.fading = true;
  cancelAnimationFrame(raf);
  raf = 0;
  const canvas = session.canvas;
  // Start from the current opacity so the transition always runs, even after a skip.
  void canvas.offsetWidth;
  canvas.style.transition = `opacity ${ms}ms ease-out`;
  canvas.style.opacity = '0';
  // Timers, not transitionend: a background tab can freeze transitions, and the win card
  // must never wait on an event that will not arrive.
  session.fadeTimer = setTimeout(() => teardown(true), ms + 60);
}

export function startWaterfall(canvas, {
  cw, ch, piles = [], cards = [], seed = 1, variant = 'waterfall', launchMs,
} = {}) {
  stopCelebration();
  canvasEl = canvas;
  canvas.hidden = false;
  canvas.style.transition = 'none';
  canvas.style.opacity = '1';

  let geometry = measure(canvas, cw, ch);
  let ctx = fitCanvas(canvas, geometry);
  let cardW = cw;
  let cardH = ch;
  let sprites = new Map();

  const allCards = cards.length ? cards : piles.flatMap((p) => p.cards || []);
  const cardById = new Map(allCards.map((c) => [c.id || c.suit + c.rank, c]));

  const spriteFor = (id) => {
    let sprite = sprites.get(id);
    if (!sprite) {
      const suit = id.slice(0, 1);
      const rank = Number(id.slice(1));
      const card = cardById.get(id) || { suit, rank };
      sprite = makeSprite(card, cardW, cardH, geometry.dpr);
      sprites.set(id, sprite);
    }
    return sprite;
  };

  const makeSequence = () => buildWinSequence({
    variant,
    cards: allCards,
    piles,
    cw: cardW,
    ch: cardH,
    seed,
    launchMs,
    viewport: {
      width: geometry.width,
      height: geometry.height,
      floorY: geometry.floorY,
      left: geometry.left,
      top: geometry.top,
    },
  });

  let sequence = makeSequence();
  const startedAt = performance.now();

  // Resize events can arrive in bursts while the toolbar animates. Mark dirty and do the
  // measuring once in the next frame, never on the event itself. A fixed canvas does not
  // move when the visual viewport scrolls, so scroll is deliberately not observed.
  let dirty = false;
  const handleViewportChange = () => { dirty = true; };
  const applyViewportChange = () => {
    if (!session || session.canvas.hidden) return;
    const stage = readStage(session.canvas);
    const size = readCardSize(cardW, cardH);
    cardW = size.cw;
    cardH = size.ch;
    const nextGeometry = geometryFrom(stage, cardW, cardH);
    const realloc = nextGeometry.pixelWidth !== geometry.pixelWidth
      || nextGeometry.pixelHeight !== geometry.pixelHeight
      || nextGeometry.dpr !== geometry.dpr;
    geometry = nextGeometry;
    // Reallocating clears the canvas anyway, so only do it when the backing store changed.
    if (realloc) {
      ctx = fitCanvas(session.canvas, nextGeometry);
      sprites = new Map(); // rasterised at the old device ratio and card size
    } else {
      sprites = new Map();
    }
    // Rebuild on the new stage so the floor and the side walls stay truthful. The launch
    // times are unchanged, so the pass still ends on the original schedule.
    sequence = makeSequence();
  };
  window.addEventListener('resize', handleViewportChange);
  const viewport = window.visualViewport;
  if (viewport) viewport.addEventListener('resize', handleViewportChange);

  removeListeners = () => {
    window.removeEventListener('resize', handleViewportChange);
    if (viewport) viewport.removeEventListener('resize', handleViewportChange);
  };

  const frame = (now) => {
    if (!session) return;
    if (dirty) { dirty = false; applyViewportChange(); }
    const t = now - startedAt;
    if (t >= sequence.duration) {
      beginFade(FADE_MS);
      return;
    }
    for (const card of sampleSequence(sequence, t)) {
      if (card.alpha <= 0) continue;
      const sprite = spriteFor(card.id);
      ctx.save();
      ctx.globalAlpha = card.alpha;
      const x = card.x + cardW / 2;
      const y = card.y + cardH / 2;
      ctx.translate(x, y);
      if (card.rotation) ctx.rotate(card.rotation);
      ctx.drawImage(sprite, -cardW / 2, -cardH / 2, cardW, cardH);
      ctx.restore();
    }
    raf = requestAnimationFrame(frame);
  };

  const finished = new Promise((resolve) => {
    session = {
      canvas,
      resolve,
      fading: false,
      fadeTimer: 0,
    };
    raf = requestAnimationFrame(frame);
  });

  return { finished, stop: () => beginFade(SKIP_FADE_MS), cancel: () => teardown(false) };
}

// One tap skips either renderer. Capture on the board keeps the pointer from reaching the
// drag and shake handlers underneath, so the board never treats the skip as a card move.
// The toolbar stays outside the board, so "New deal" can still cancel outright.
let activeCelebration = null;
let detachSkip = null;

function attachSkip(skip) {
  detachSkip?.();
  detachSkip = null;
  const board = document.getElementById('board');
  if (!board) return;
  const onBoardPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    skip();
  };
  board.addEventListener('pointerdown', onBoardPointerDown, true);
  detachSkip = () => board.removeEventListener('pointerdown', onBoardPointerDown, true);
}

function releaseSkip() {
  detachSkip?.();
  detachSkip = null;
}

// Can this browser draw WebGL at all? Asked on a throwaway canvas before any of the dancer
// exists, so "no WebGL here" is decided up front instead of by catching a failure later.
// The probe context is released again: phones allow only a handful of live contexts, and
// this one has no other purpose than the answer.
function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false; // some browsers throw instead of returning null
  }
}

// The only entry point app.js uses. The dancer owns the screen when WebGL works; the
// waterfall is the fallback when it does not. Both report completion so the win card can
// follow, and both are skipped by the one handler above.
//
// The two failures are handled differently on purpose. A browser without WebGL is a device
// condition we expect, so the waterfall simply takes over and the player still gets a
// celebration. A browser that has WebGL and still throws while building the dancer is our
// own bug: it is reported to the console, and the waterfall still plays, because a won game
// must reach its win card whatever we got wrong in the decoration.
export function startCelebration(canvas, options = {}) {
  stopCelebration();

  let renderer = null;
  if (hasWebGL()) {
    try {
      renderer = startDancer();
    } catch (err) {
      console.warn('Card dancer failed to start; this is a bug, not a missing WebGL.', err);
      renderer = null;
    }
  }
  if (!renderer) renderer = startWaterfall(canvas, options);

  const entry = {
    finished: renderer.finished,
    stop: () => renderer.stop(),
    cancel: () => renderer.cancel(),
  };
  activeCelebration = entry;
  attachSkip(entry.stop);
  // Natural end, skip and hard cancel all settle the same promise; clear up once.
  entry.finished.then(() => {
    if (activeCelebration === entry) {
      activeCelebration = null;
      releaseSkip();
    }
  });
  return { finished: entry.finished, stop: entry.stop };
}

// Hard cancel: used when the board is replaced. Never leaves content behind or a promise
// pending for the old win card.
export function stopCelebration() {
  const current = activeCelebration;
  if (!current) return;
  activeCelebration = null;
  releaseSkip();
  current.cancel();
}
