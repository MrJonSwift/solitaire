// Pure choreography for win celebrations. Builds one sequence from card and viewport data,
// then samples it at a time. No DOM, no canvas, no timers: Node can prove the shape of a win.
import { seededRandom } from './game.js';

// The one taste knob for density. 52 cards at 120ms is a 6.12s launch window.
export const LAUNCH_MS = 120;

// Trajectories are baked at the old renderer's fixed 60Hz step so sampling is just an
// interpolation. Physics is deliberately the shipped waterfall, not a new animation:
// upward launch, gravity, a damped floor bounce, constant horizontal drift, gone off-screen.
const DT = 1 / 60;
const FLOOR_BOUNCE = 0.78;
const END_TAIL_MS = 1500; // the canvas fade takes the last cards out; no card fades alone

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function launchOrder(cards, piles) {
  const list = piles.map((pile) => pile.cards || []);
  const used = new Set();
  const ordered = [];
  for (let rank = 13; rank >= 1; rank--) {
    for (let i = 0; i < list.length; i++) {
      const card = list[i].find((c) => c.rank === rank);
      if (!card) continue;
      const id = card.id || card.suit + card.rank;
      if (used.has(id)) continue;
      used.add(id);
      ordered.push({ card, pile: i });
    }
  }
  // If the piles did not describe all 52 cards, still celebrate every card exactly once.
  // The suit picks a plausible origin; anything unrecognised uses the first foundation.
  for (const card of cards) {
    const id = card.id || card.suit + card.rank;
    if (used.has(id)) continue;
    used.add(id);
    const suitIndex = list.findIndex((pile, i) => (piles[i].cards || []).some((c) => c.suit === card.suit));
    ordered.push({ card, pile: suitIndex >= 0 ? suitIndex : 0 });
  }
  return ordered;
}

export function buildWinSequence({
  variant = 'waterfall',
  cards = [],
  piles = [],
  cw = 0,
  ch = 0,
  viewport = {},
  seed = 1,
  launchMs = LAUNCH_MS,
} = {}) {
  const width = Math.max(0, finite(viewport.width));
  const height = Math.max(0, finite(viewport.height));
  const cardWidth = Math.max(0, finite(cw));
  const cardHeight = Math.max(0, finite(ch));
  const left = finite(viewport.left);
  const top = finite(viewport.top);
  const bottomInset = Math.max(0, finite(viewport.bottomInset));
  const floorY = Number.isFinite(viewport.floorY)
    ? clamp(viewport.floorY, 0, height)
    : Math.max(0, height - bottomInset - cardHeight);
  const safeFloor = Math.max(0, floorY);
  const cadence = Number.isFinite(launchMs) && launchMs > 0 ? launchMs : LAUNCH_MS;
  const rng = seededRandom(seed);

  // Old renderer basis: every speed scaled with card width. Gravity is tied to the stage
  // height so the rise is 5–8% of the screen on a phone and on a tablet alike. The fall is
  // deliberately faster than the shipped 1.3s: at 120ms cadence a slower drop stacks more
  // trails in the air at once into a white wall, and a shorter flight keeps the pass legible.
  const scale = Math.max(0.1, cardWidth / 60);
  const gravity = 4.4 * Math.max(1, height);
  const ordered = launchOrder(cards, piles);

  const items = ordered.map(({ card, pile }, index) => {
    const origin = piles[pile] || {};
    let x = finite(origin.x) - left;
    let y = clamp(finite(origin.y) - top, 0, safeFloor);
    const rise = (0.045 + rng() * 0.03) * height;
    let vy = -Math.sqrt(2 * gravity * rise);
    const vx = (rng() < 0.5 ? -1 : 1) * (120 + rng() * 240) * scale;
    const points = [{ x, y }];
    let steps = 0;
    // Constant horizontal speed means every card eventually leaves the stage. That is the
    // only ending a card gets; the whole canvas fades out afterwards.
    while (steps < 2000) {
      vy += gravity * DT;
      x += vx * DT;
      y += vy * DT;
      if (y >= safeFloor) { y = safeFloor; vy = -vy * FLOOR_BOUNCE; }
      if (y < 0) y = 0;
      steps++;
      points.push({ x, y });
      if (x > width || x + cardWidth < 0) break; // fully off the stage
    }
    const launch = index * cadence;
    const flight = steps * DT * 1000;
    return {
      id: card.id || card.suit + card.rank,
      suit: card.suit,
      rank: card.rank,
      x: points[0].x,
      y: points[0].y,
      vx,
      launch,
      flight,
      end: launch + flight,
      points,
      spin: 0,
    };
  });

  const duration = (items.length ? Math.max(...items.map((item) => item.launch)) : 0) + END_TAIL_MS;
  return { variant, duration, viewport: { width, height, floorY: safeFloor }, items };
}

function sampleAt(item, tau) {
  if (tau <= 0) return { x: item.points[0].x, y: item.points[0].y, alpha: 0 };
  if (tau >= item.flight) {
    const last = item.points[item.points.length - 1];
    return { x: last.x, y: last.y, alpha: 0 };
  }
  const step = tau / (DT * 1000);
  const i = Math.min(item.points.length - 2, Math.max(0, Math.floor(step)));
  const f = clamp(step - i, 0, 1);
  const a = item.points[i];
  const b = item.points[i + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, alpha: 1 };
}

export function sampleSequence(sequence, t) {
  if (!sequence || !Array.isArray(sequence.items)) return [];
  const time = clamp(finite(t), 0, finite(sequence.duration));
  return sequence.items.map((item) => {
    const tau = time - item.launch;
    const point = sampleAt(item, tau);
    return {
      id: item.id,
      x: point.x,
      y: point.y,
      alpha: point.alpha,
      rotation: item.spin || 0,
    };
  });
}
