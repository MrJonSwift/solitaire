// Pure choreography for win celebrations. Builds one sequence from card and viewport data,
// then samples it at a time. No DOM, no canvas, no timers: Node can prove the shape of a win.
//
// Two paths live here and share the seam. `waterfall` is the shipped cascade, which leaves
// trails and lets every card fall off the sides. `vortex` is the second celebration: the four
// foundations unwind into one funnel and burst. The renderer draws whichever it is handed.
import { seededRandom } from './game.js';

// The one taste knob for density. 52 cards at 120ms is a 6.12s launch window.
export const LAUNCH_MS = 120;

// Trajectories are baked at the old renderer's fixed 60Hz step so sampling is just an
// interpolation. Physics is deliberately the shipped waterfall, not a new animation:
// upward launch, gravity, a damped floor bounce, constant horizontal drift, gone off-screen.
const DT = 1 / 60;
const FLOOR_BOUNCE = 0.78;
const END_TAIL_MS = 1500; // the canvas fade takes the last cards out; no card fades alone

const TAU = Math.PI * 2;
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

// ---------- Waterfall ----------

function buildWaterfall({
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
  return { variant: 'waterfall', duration, viewport: { width, height, floorY: safeFloor }, items };
}

function sampleWaterfall(item, tau) {
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

// ---------- Vortex ----------
// One card's life: it springs from its foundation corner to the foot of the funnel, climbs
// the inside of it while the funnel opens out, and is thrown away from the top rim. The four
// foundations hold four quarter-turn offsets, so the funnel reads as four ribbons rather
// than a crowd of cards.
//
// The ending is the waterfall's, by the same recorded rule: no card fades on its own. Cards
// leave the stage and the whole canvas fades, so the last few are never seen evaporating.
const VORTEX_ENTRY_MS = 800;    // corner to the bottom ring. Long enough that the spring
                                // from the pile stays under the 60px-a-frame rule.
const VORTEX_SPIN_MS = 1300;    // one card's climb up the funnel. Short against the entry
                                // window on purpose: a long climb keeps all 52 cards in the
                                // funnel at once, which is a wall of cards, not a spiral.
const VORTEX_STAGGER_MS = 60;   // one card leaves its foundation every 60ms. The funnel
                                // then holds about twenty cards at a time and the other
                                // thirty are still on their way, so the whole screen moves.
const VORTEX_BURST_MS = 1000;   // longest a card may fly before it must be off the stage
const VORTEX_TURNS = 1.6;       // rounds of the funnel during the climb
const VORTEX_FOOT = 0.3;        // radius at the floor, as a fraction of the widest ring.
                                // The funnel opens upward like a whirlwind: a barrel or a
                                // closed cone silhouettes as a column or a knot of cards.
const VORTEX_SQUASH = 0.6;      // a ring seen from a little below, not a flat circle
const VORTEX_END_MS = 250;      // cut the sequence while the last cards are still in flight,
                                // so the canvas fade has something to take out

const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;

// The card's top-left corner on the funnel. `p` runs 0 at the bottom ring to 1 at the top.
function vortexRing(geometry, p, theta, scale) {
  const r = geometry.R * (VORTEX_FOOT + (1 - VORTEX_FOOT) * p ** 0.55) * scale;
  return {
    x: geometry.cx + r * Math.cos(theta) - geometry.cw / 2,
    y: geometry.baseY + (geometry.apexY - geometry.baseY) * p
      + r * VORTEX_SQUASH * Math.sin(theta) - geometry.ch / 2,
  };
}

function buildVortex({
  cards = [],
  piles = [],
  cw = 0,
  ch = 0,
  viewport = {},
  seed = 1,
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
  const rng = seededRandom(seed);

  // `half` is the corner radius of a card: once a card turns, its corner is what reaches
  // furthest, so every bound below is built from the corner and not from the edges. This is
  // what keeps the funnel off the screen edges at any rotation.
  const half = Math.hypot(cardWidth, cardHeight) / 2;
  // Never widen the funnel past what fits: on a narrow stage a floor of one card width would
  // push the ring itself off the sides. A stage too small for any ring gets a tight one.
  const R = Math.max(1, Math.min(width / 2 - half - 6, height * 0.3));
  const cx = width / 2;
  // The bottom ring sits on the floor at rest, and the flared top ring stays clear of the
  // notch: the ring's own vertical swing is counted, because the funnel is widest at both
  // ends and that is where a corner would leave the stage.
  const baseY = floorY + cardHeight - R * VORTEX_SQUASH - half;
  const apexY = Math.min(
    Math.max(half + R * VORTEX_SQUASH + 16, height * 0.16),
    baseY - cardHeight,
  );
  const geometry = { cx, baseY, apexY, R, cw: cardWidth, ch: cardHeight };

  const ordered = launchOrder(cards, piles);
  const items = ordered.map(({ card, pile }, index) => {
    const origin = piles[pile] || {};
    // A little scatter on the pile, so thirteen cards do not leave from one pixel. The
    // scatter is proportional to the card, so on a tablet it is larger than the gap between
    // the foundation row and the top of the stage: clamp it, or a card starts half off the
    // top edge for its first frames. Cards are unrotated at this instant, so a plain
    // rectangle clamp on the top-left corner is exact.
    const ox = clamp(finite(origin.x) - left + (rng() - 0.5) * cardWidth * 0.3, 0, Math.max(0, width - cardWidth));
    const oy = clamp(finite(origin.y) - top + (rng() - 0.5) * cardHeight * 0.3, 0, Math.max(0, height - cardHeight));
    // One ribbon per foundation, a quarter-turn apart, with a small jitter so the strands
    // do not look printed. The rank order from launchOrder spaces the cards along it.
    const theta0 = ((pile % 4) * TAU) / 4 + (rng() - 0.5) * 0.2;
    const scale = 0.82 + rng() * 0.18;
    const end = theta0 + VORTEX_TURNS * TAU;
    const rim = vortexRing(geometry, 1, end, scale);
    const angle = end + (rng() - 0.5) * 0.8;
    const speed = ((1.6 + rng() * 1.2) * Math.min(width, height)) / 1000; // px per ms
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // Once the card's corners clear the stage it is done. Solved rather than stepped,
    // because the burst is a straight line.
    const centreX = rim.x + cardWidth / 2;
    const centreY = rim.y + cardHeight / 2;
    const exitX = vx > 0 ? (width + half - centreX) / vx : vx < 0 ? (-half - centreX) / vx : Infinity;
    const exitY = vy > 0 ? (height + half - centreY) / vy : vy < 0 ? (-half - centreY) / vy : Infinity;
    const burst = Math.max(120, Math.min(VORTEX_BURST_MS, exitX, exitY));

    const launch = index * VORTEX_STAGGER_MS;
    return {
      id: card.id || card.suit + card.rank,
      suit: card.suit,
      rank: card.rank,
      pile,
      launch,
      entry: VORTEX_ENTRY_MS,
      spinEnd: VORTEX_ENTRY_MS + VORTEX_SPIN_MS,
      flight: VORTEX_ENTRY_MS + VORTEX_SPIN_MS + burst,
      ox,
      oy,
      theta0,
      scale,
      burst: { x: rim.x, y: rim.y, vx, vy, rotation: end + Math.PI / 2 },
    };
  });

  const last = items.length ? Math.max(...items.map((item) => item.launch + item.flight)) : 0;
  const duration = Math.max(1000, last - VORTEX_END_MS);
  return { variant: 'vortex', duration, viewport: { width, height, floorY }, geometry, items };
}

function sampleVortex(item, geometry, tau) {
  if (tau <= 0) return { x: item.ox, y: item.oy, alpha: 0, rotation: 0 };

  if (tau < item.entry) {
    // Spring out of the pile and catch the ring. The card turns to face the funnel as it
    // arrives, so the ribbon has no card sitting flat across it.
    const s = easeOut(tau / item.entry);
    const ring = vortexRing(geometry, 0, item.theta0, item.scale);
    return {
      x: item.ox + (ring.x - item.ox) * s,
      y: item.oy + (ring.y - item.oy) * s,
      alpha: 1,
      rotation: (item.theta0 + Math.PI / 2) * s,
    };
  }

  if (tau < item.spinEnd) {
    const p = (tau - item.entry) / (item.spinEnd - item.entry);
    const theta = item.theta0 + VORTEX_TURNS * TAU * p;
    const ring = vortexRing(geometry, p, theta, item.scale);
    return { x: ring.x, y: ring.y, alpha: 1, rotation: theta + Math.PI / 2 };
  }

  const bt = tau - item.spinEnd;
  const x = item.burst.x + item.burst.vx * bt;
  const y = item.burst.y + item.burst.vy * bt;
  // The spin carries into the flight, so a card never stops dead when it is thrown.
  const rotation = item.burst.rotation + ((VORTEX_TURNS * TAU) / VORTEX_SPIN_MS) * bt;
  return { x, y, alpha: tau < item.flight ? 1 : 0, rotation };
}

// ---------- Conga ----------
// The third 2D path, and the one with a different silhouette: not a shower of cards but a
// queue. Every card leaves its foundation and joins one line that travels around a rounded
// circuit of the stage, neighbours at a fixed distance so the line reads as a chain, then
// the whole queue files off through a single gap in the ring and the board is empty for
// the win card.
//
// The line is a moving walkway: a card joins at the back, travels with the rest, and leaves
// at the front. Positions are arithmetic on one distance, so a card is on the ring for as
// long as the schedule says, and the queue can never bunch up or lap itself.
const CONGA_STAGGER_MS = 65;      // one card leaves its foundation every 65ms
const CONGA_LAP_MS = 2100;        // one circuit of the ring at the design speed
const CONGA_MAX_SPEED = 0.8;      // px per ms. A cap, not a preference: a long circuit on a
                                  // tablet would otherwise step further per frame than a
                                  // phone does, and the queue would strobe on the big screen.
const CONGA_STEP = 0.55;          // neighbour spacing, as a fraction of card width
const CONGA_FILL = 0.8;          // the most of the ring 52 cards may occupy. Leave a gap,
                                  // or the head and tail touch and it reads as a closed ring,
                                  // not a line with a front and a back.
const CONGA_ENTRY_HEADROOM = 1.95; // ms of spring per px of gap, so the ease's peak stays
                                  // smooth even when the slot is across the stage
const CONGA_ENTRY_MIN_MS = 450;
const CONGA_ENTRY_MAX_MS = 2600;
const CONGA_BEAT_MS = 250;        // the ring is whole before the first card leaves it
const CONGA_MIN_MS = 6200;        // the celebration's window, like the other 2D paths
const CONGA_MAX_MS = 8000;
const CONGA_EXIT_SPEED = 0.8;     // px per ms, straight out through the gap
const CONGA_EXIT_MIN_MS = 140;
const CONGA_EXIT_MAX_MS = 900;
const CONGA_TIP = 0.2;            // radians of side-to-side tip, about 11 degrees
const CONGA_TIP_WAVES = 2;        // sway wavelengths along the queue, so it ripples
const CONGA_TIP_PERIOD_MS = 900;
const CONGA_BOB = 0.06;           // the whole line's vertical bob, as a fraction of card height
const CONGA_BOB_PERIOD_MS = 1100;
const CONGA_RADIUS = 0.4;         // corner radius of the circuit, of its short half-axis

// The circuit is a rounded rectangle: the longest closed loop that stays on a stage, which
// is what keeps 52 cards from bunching into a band on a 320px phone. The bounds are built
// from the card's rotated extent, so the tip and the bob can never push a corner off an
// edge; from the floor the other paths rest on, so no card hangs over the home indicator;
// and from the top safe area, so the queue never runs under the notch or the status bar.
function makeCongaLoop(width, top, bottom, cardWidth, cardHeight, tip, bob) {
  const cos = Math.abs(Math.cos(tip));
  const sin = Math.abs(Math.sin(tip));
  const ex = (cos * cardWidth + sin * cardHeight) / 2 + 4;
  const ey = (sin * cardWidth + cos * cardHeight) / 2 + 4 + bob;
  const halfW = Math.max(1, width / 2 - ex);
  const topEdge = Math.max(0, finite(top)) + ey;
  const halfH = Math.max(1, (bottom - topEdge - ey) / 2);
  const r = Math.max(0, Math.min(halfW, halfH) * CONGA_RADIUS);
  const sx = 2 * (halfW - r); // length of one horizontal straight
  const sy = 2 * (halfH - r); // length of one vertical straight
  const arc = (Math.PI * r) / 2;
  return {
    cx: width / 2,
    cy: topEdge + halfH,
    halfW,
    halfH,
    r,
    sx,
    sy,
    arc,
    length: 2 * sx + 2 * sy + 4 * arc,
    cw: cardWidth,
    ch: cardHeight,
  };
}

// Distance along the circuit, clockwise from the top-left of the top straight, to the
// card's top-left corner. One function, no table, so a sample is a few compares and no
// allocation beyond the returned point.
function congaAt(loop, distance) {
  const { cx, cy, halfW, halfH, r, sx, sy, arc, length } = loop;
  let u = distance % length;
  if (u < 0) u += length;
  let x;
  let y;
  if (u < sx) {
    x = cx - halfW + r + u;
    y = cy - halfH;
  } else if ((u -= sx) < arc) {
    const a = -Math.PI / 2 + u / r;
    x = cx + halfW - r + r * Math.cos(a);
    y = cy - halfH + r + r * Math.sin(a);
  } else if ((u -= arc) < sy) {
    x = cx + halfW;
    y = cy - halfH + r + u;
  } else if ((u -= sy) < arc) {
    const a = u / r;
    x = cx + halfW - r + r * Math.cos(a);
    y = cy + halfH - r + r * Math.sin(a);
  } else if ((u -= arc) < sx) {
    x = cx + halfW - r - u;
    y = cy + halfH;
  } else if ((u -= sx) < arc) {
    const a = Math.PI / 2 + u / r;
    x = cx - halfW + r + r * Math.cos(a);
    y = cy + halfH - r + r * Math.sin(a);
  } else if ((u -= arc) < sy) {
    x = cx - halfW;
    y = cy + halfH - r - u;
  } else {
    const a = Math.PI + clamp(u - sy, 0, arc) / r;
    x = cx - halfW + r + r * Math.cos(a);
    y = cy - halfH + r + r * Math.sin(a);
  }
  return { x: x - loop.cw / 2, y: y - loop.ch / 2 };
}

function buildConga({
  cards = [],
  piles = [],
  cw = 0,
  ch = 0,
  viewport = {},
  seed = 1,
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
  // The top of the stage is the safe-area inset where the caller knows it, and otherwise
  // the canvas's own offset from the top of the page. Both are clamped: a path sampled from
  // a bad viewport must still land inside the canvas.
  const topInset = Math.max(0, finite(viewport.topInset, finite(viewport.top)));
  const rng = seededRandom(seed);
  const ordered = launchOrder(cards, piles);
  const bob = cardHeight * CONGA_BOB;
  const loop = makeCongaLoop(width, topInset, floorY + cardHeight, cardWidth, cardHeight, CONGA_TIP, bob);
  // Spacing answers to both the card and the circuit: tight enough to fit every card with
  // a gap left over, loose enough that neighbours overlap only partly and the faces read.
  const count = Math.max(1, ordered.length);
  const spacing = Math.max(1, Math.min(cardWidth * CONGA_STEP, (loop.length * CONGA_FILL) / count));
  const speed = Math.min(loop.length / CONGA_LAP_MS, CONGA_MAX_SPEED);

  // The spring is sized from the distance it has to cover, so a card at the far side of
  // the ring does not have to cross the stage faster than a card that joins beside its
  // foundation. The landing point is fixed at hand-over: a card chases nothing, it lands
  // in the slot the queue will have reached by then, which is what keeps the step smooth.
  const entryFor = (ox, oy, launch, offset) => {
    let entry = CONGA_ENTRY_MIN_MS;
    for (let pass = 0; pass < 40; pass++) {
      const target = congaAt(loop, speed * (launch + entry) - offset);
      const wanted = Math.min(
        CONGA_ENTRY_MAX_MS,
        Math.hypot(target.x - ox, target.y - oy) * CONGA_ENTRY_HEADROOM,
      );
      // Never shrink: the landing point moves forward as the spring grows, and a shrinking
      // estimate would chase it round the ring. The cap is the only thing that can bite.
      const next = Math.max(entry, wanted);
      if (next === entry) break;
      entry = next;
    }
    return Math.max(CONGA_ENTRY_MIN_MS, entry);
  };

  const items = ordered.map(({ card, pile }, index) => {
    const origin = piles[pile] || {};
    // Same small scatter as the vortex, and clamped for the same reason: a tablet's
    // foundations sit close to the edge, and a card may not start half off the stage.
    const ox = clamp(finite(origin.x) - left + (rng() - 0.5) * cardWidth * 0.3, 0, Math.max(0, width - cardWidth));
    // The scatter must not drop a card into the notch either: the inset the ring respects
    // is the ceiling for a card at its foundation, as the stage bottom is the floor.
    const oy = clamp(
      finite(origin.y) - top + (rng() - 0.5) * cardHeight * 0.3,
      Math.min(topInset, height - cardHeight),
      Math.max(0, height - cardHeight),
    );
    const launch = index * CONGA_STAGGER_MS;
    const offset = index * spacing;
    const entry = entryFor(ox, oy, launch, offset);
    const slot = congaAt(loop, speed * (launch + entry) - offset);
    return {
      id: card.id || card.suit + card.rank,
      suit: card.suit,
      rank: card.rank,
      pile,
      launch,
      offset,
      entry,
      tx: slot.x,
      ty: slot.y,
      ox,
      oy,
    };
  });

  // The gap the queue leaves through is wherever the head is when the drain begins. The
  // drain starts once every card has joined — unless the whole pass would run past the
  // celebration's deadline, in which case the head leaves earlier and the queue is still
  // filling as it drains. The band is deliberate: six to eight seconds, like the others.
  const lastEntry = items.reduce((max, item) => Math.max(max, item.launch + item.entry), 0);
  const natural = lastEntry + CONGA_BEAT_MS;
  const exitStep = spacing / speed; // one card's gap passes the exit every step
  const train = Math.max(0, items.length - 1) * exitStep;
  const half = Math.hypot(cardWidth, cardHeight) / 2;

  // No card may leave the ring before it has landed in it, whatever the deadline says.
  let floor = 0;
  items.forEach((item, index) => { floor = Math.max(floor, item.launch + item.entry - index * exitStep); });

  const exitAt = (firstExit) => {
    const door = congaAt(loop, speed * firstExit);
    const doorCx = door.x + cardWidth / 2;
    const doorCy = door.y + cardHeight / 2;
    // Outward from the middle of the stage: every card leaves by the nearest edge, which
    // is the shortest way off the stage and never crosses the queue.
    const away = Math.hypot(doorCx - loop.cx, doorCy - loop.cy) || 1;
    const ux = (doorCx - loop.cx) / away;
    const uy = (doorCy - loop.cy) / away;
    const edgeX = ux > 1e-6 ? (width + half - doorCx) / ux : ux < -1e-6 ? (-half - doorCx) / ux : Infinity;
    const edgeY = uy > 1e-6 ? (height + half - doorCy) / uy : uy < -1e-6 ? (-half - doorCy) / uy : Infinity;
    const burst = clamp(
      Math.min(edgeX, edgeY) / CONGA_EXIT_SPEED,
      CONGA_EXIT_MIN_MS,
      CONGA_EXIT_MAX_MS,
    );
    return { door, ux, uy, burst };
  };

  // One allowance for the whole ending: the longest any card can take to fly off from
  // anywhere on the ring. The burst depends on where the gap sits, so a length that tracked
  // the gap exactly would be a reflection — move the drain, the door moves, the length moves
  // back — and would only land in the band by parity. A single bound makes the length exact
  // in one pass; the price is at most a fraction of a second of empty stage at the very end,
  // which the canvas fade and the win card already cover.
  let exitAllowance = CONGA_EXIT_MIN_MS;
  for (let i = 0; i < 24; i++) {
    exitAllowance = Math.max(exitAllowance, exitAt((i / 24) * (loop.length / speed)).burst);
  }
  const wanted = clamp(natural + train + exitAllowance, CONGA_MIN_MS, CONGA_MAX_MS);
  // Never before the first landing has happened; that is the one thing the deadline cannot
  // buy. Otherwise the length lands on `wanted` exactly.
  const firstExit = Math.max(floor, wanted - train - exitAllowance);
  const exit = exitAt(firstExit);

  items.forEach((item, index) => {
    item.exit = firstExit + index * exitStep;
    item.flight = item.exit + exit.burst;
  });

  // The allowance is what the length is planned on; the cards themselves fly for the burst
  // their shared door actually needs, so every one of them is gone by this time. Ceil, not
  // round: the last card must never be in the air at the instant the sequence ends.
  const duration = items.length ? Math.ceil(firstExit + train + exitAllowance) : 0;
  return {
    variant: 'conga',
    duration,
    viewport: { width, height, floorY },
    geometry: {
      ...loop,
      speed,
      bob,
      tip: CONGA_TIP,
      tipWaves: CONGA_TIP_WAVES,
      doorDistance: ((speed * firstExit) % loop.length + loop.length) % loop.length,
      doorX: exit.door.x,
      doorY: exit.door.y,
      ux: exit.ux,
      uy: exit.uy,
    },
    items,
  };
}

function sampleConga(item, geometry, tau) {
  if (tau <= 0) return { x: item.ox, y: item.oy, alpha: 0, rotation: 0 };
  const now = tau + item.launch;
  const bob = geometry.bob * Math.sin((TAU * now) / CONGA_BOB_PERIOD_MS);
  const distance = finite(geometry.speed * now - item.offset);

  if (tau < item.entry) {
    // Spring from the pile onto the moving line, landing in the slot the queue will have
    // reached at hand-over. A fixed landing point means a straight, evenly paced flight.
    const t = clamp(tau / item.entry, 0, 1);
    const s = t * t * (3 - 2 * t);
    const sway = congaSway(geometry, distance, now);
    return {
      x: item.ox + (item.tx - item.ox) * s,
      y: item.oy + (item.ty + bob - item.oy) * s,
      alpha: 1,
      rotation: sway * s,
    };
  }

  const sway = congaSway(geometry, now < item.exit ? distance : geometry.doorDistance, now);
  if (now < item.exit) {
    const point = congaAt(geometry, distance);
    return { x: point.x, y: point.y + bob, alpha: 1, rotation: sway };
  }

  // The line files out through the gap: straight, outward, still bobbing, gone before the
  // win card arrives. No private fade — a card is either on the stage or off it.
  const bt = now - item.exit;
  return {
    x: geometry.doorX + geometry.ux * CONGA_EXIT_SPEED * bt,
    y: geometry.doorY + bob + geometry.uy * CONGA_EXIT_SPEED * bt,
    alpha: now < item.flight ? 1 : 0,
    rotation: sway,
  };
}

// The ripple runs along the queue as well as through time, so the line looks like it is
// dancing rather than sliding.
function congaSway(geometry, distance, now) {
  const s = (((distance % geometry.length) + geometry.length) % geometry.length) / geometry.length;
  return geometry.tip * Math.sin(TAU * (s * geometry.tipWaves - now / CONGA_TIP_PERIOD_MS));
}

// ---------- The seam ----------

// One sampler per path: a new path is a line here rather than another branch in the loop.
const SAMPLERS = {
  waterfall: (item, tau) => sampleWaterfall(item, tau),
  vortex: (item, tau, geometry) => sampleVortex(item, geometry, tau),
  conga: (item, tau, geometry) => sampleConga(item, geometry, tau),
};

export function buildWinSequence(options = {}) {
  // An unknown name is a coding mistake, not a reason to leave a win uncelebrated: the
  // waterfall is the fallback everywhere else, so it is the fallback here too.
  if (options.variant === 'conga') return buildConga(options);
  if (options.variant === 'vortex') return buildVortex(options);
  return buildWaterfall(options);
}

export function sampleSequence(sequence, t) {
  if (!sequence || !Array.isArray(sequence.items)) return [];
  const time = clamp(finite(t), 0, finite(sequence.duration));
  const sampler = SAMPLERS[sequence.variant] || SAMPLERS.waterfall;
  return sequence.items.map((item) => {
    const tau = time - item.launch;
    const point = sampler(item, tau, sequence.geometry);
    return {
      id: item.id,
      x: point.x,
      y: point.y,
      alpha: point.alpha,
      rotation: finite(point.rotation),
    };
  });
}
