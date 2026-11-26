// Pure choreography for win celebrations. Builds one sequence from card and viewport data,
// then samples it at a time. No DOM, no canvas, no timers: Node can prove the shape of a win.
//
// Five 2D paths live here and share the seam. `waterfall` is the shipped cascade, which
// leaves trails and lets every card fall off the sides. `vortex` unwinds the four foundations
// into one funnel and bursts. `conga` turns the cards into a queue that files round the stage
// dances to a kick, and is flung off as a ribbon. `fireworks` rains them into launch tubes and fires them up as
// shells that burst and tumble away. `fan` gathers all 52 into one cardsharp's spread, breathes in it, snaps it
// closed into a deck, bows and flicks off. The renderer draws whichever it is handed.
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
// circuit of the stage, neighbours at a fixed distance so the line reads as a chain. It
// dances to a "one, two, three, KICK" count, the kick rolling down the line as a wave, and
// then each card in turn is flung from the head of the line up across the stage, speeding
// up, spinning and tumbling, so the queue leaves as a ribbon and the board is empty for the
// win card.
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
const CONGA_EXIT_SPEED = 0.76;    // px per ms, straight out through the gap
const CONGA_EXIT_MIN_MS = 140;
const CONGA_EXIT_MAX_MS = 1100;
const CONGA_TIP = 0.2;            // radians of side-to-side tip, about 11 degrees
const CONGA_TIP_WAVES = 2;        // sway wavelengths along the queue, so it ripples
const CONGA_TIP_PERIOD_MS = 900;
const CONGA_BOB = 0.06;           // the whole line's vertical bob, as a fraction of card height
const CONGA_BOB_PERIOD_MS = 1100;
const CONGA_RADIUS = 0.4;         // corner radius of the circuit, of its short half-axis
// The conga count: one, two, three, KICK. On the fourth beat every card hops, stretches and
// kicks its tilt out, and the kick rolls down the line from the head to the tail like a
// stadium wave, so the queue is visibly dancing to a beat rather than drifting. The side of
// the kick alternates every bar.
const CONGA_BEAT_LEN_MS = 420;
const CONGA_BAR_MS = CONGA_BEAT_LEN_MS * 4;
const CONGA_KICK_RIPPLE_MS = 24;  // each card kicks this long after the one in front
const CONGA_HOP = 0.28;           // kick height, as a fraction of card height
const CONGA_KICK_TILT = 0.22;     // radians the kick adds to the sway, about 13 degrees
const CONGA_KICK_STRETCH = 0.14;  // how much larger a card is drawn at the top of its hop
const CONGA_SCALE_MAX = 1 + CONGA_KICK_STRETCH;
// The exit: a card dances out of the door slowly, then picks up speed, spinning and flipping
// over as it goes. Acceleration is what turns "slides away" into "flung away".
const CONGA_EXIT_V0 = 0.25;       // px per ms as a card steps through the door
const CONGA_EXIT_ACCEL = 0.0016;  // px per ms per ms
const CONGA_EXIT_SPIN = 0.0028;   // rad per ms once a card is out of the door
const CONGA_EXIT_FLIP = 0.006;    // rad per ms of end-over-end tumble

// The circuit is a rounded rectangle: the longest closed loop that stays on a stage, which
// is what keeps 52 cards from bunching into a band on a 320px phone. The bounds are built
// from the card's rotated extent, so the tip and the bob can never push a corner off an
// edge; from the floor the other paths rest on, so no card hangs over the home indicator;
// and from the top safe area, so the queue never runs under the notch or the status bar.
function makeCongaLoop(width, top, bottom, cardWidth, cardHeight, tip, bob) {
  const cos = Math.abs(Math.cos(tip));
  const sin = Math.abs(Math.sin(tip));
  // Sized for the card at its largest (the kick stretch), so a kick never crops a corner.
  const ex = ((cos * cardWidth + sin * cardHeight) / 2) * CONGA_SCALE_MAX + 4;
  const ey = ((sin * cardWidth + cos * cardHeight) / 2) * CONGA_SCALE_MAX + 4 + bob;
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
  // The hop is a vertical speed on top of the line's own, and on the side straights the two
  // point the same way, so the hop gets only what is left of the frame budget (1px per ms)
  // once the line is moving at its top speed. The hop's peak speed is pi * hop / beat. On a
  // phone that is the full design hop; a tablet's big cards get a smaller one and lean on
  // the stretch and the tilt instead.
  const bobSpeed = (TAU * cardHeight * CONGA_BOB) / CONGA_BOB_PERIOD_MS;
  const hop = Math.min(
    cardHeight * CONGA_HOP,
    (Math.max(0, 0.97 - CONGA_MAX_SPEED - bobSpeed) * CONGA_BEAT_LEN_MS) / Math.PI,
  );
  const loop = makeCongaLoop(
    width, topInset, floorY + cardHeight, cardWidth, cardHeight, CONGA_TIP + CONGA_KICK_TILT, bob + hop,
  );
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
      index,
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
  const half = (Math.hypot(cardWidth, cardHeight) / 2) * CONGA_SCALE_MAX;

  // No card may leave the ring before it has landed in it, whatever the deadline says.
  let floor = 0;
  items.forEach((item, index) => { floor = Math.max(floor, item.launch + item.entry - index * exitStep); });

  const exitAt = (firstExit) => {
    const door = congaAt(loop, speed * firstExit);
    const doorCx = door.x + cardWidth / 2;
    const doorCy = door.y + cardHeight / 2;
    // A fling across the stage, not a step off it. The door is usually right beside an
    // edge, and leaving through that edge took a card off in a fifth of a second, so the
    // exit was never seen. Instead each card is flung up (or down) across the stage, leaning
    // in toward the middle, over the heads of the line — whichever way gives the longest flight
    // that still fits the time allowed.
    const side = doorCx >= loop.cx ? 1 : -1;
    const edgeFor = (dx, dy) => {
      const n = Math.hypot(dx, dy);
      const vx = dx / n;
      const vy = dy / n;
      const edgeX = vx > 1e-6 ? (width + half - doorCx) / vx : vx < -1e-6 ? (-half - doorCx) / vx : Infinity;
      const edgeY = vy > 1e-6 ? (height + half - doorCy) / vy : vy < -1e-6 ? (-half - doorCy) / vy : Infinity;
      return { vx, vy, d: Math.min(edgeX, edgeY) };
    };
    const options = [edgeFor(-side * 0.35, -1), edgeFor(-side * 0.35, 1)];
    const fits = options.filter((o) => congaExitTime(o.d) <= CONGA_EXIT_MAX_MS);
    const pick = fits.length
      ? fits.reduce((a, b) => (b.d > a.d ? b : a))
      : options.reduce((a, b) => (b.d < a.d ? b : a));
    const ux = pick.vx;
    const uy = pick.vy;
    const burst = clamp(congaExitTime(pick.d), CONGA_EXIT_MIN_MS, CONGA_EXIT_MAX_MS);
    return { door, ux, uy, burst };
  };

  // One allowance for the whole ending: the longest any card can take to fly off from
  // anywhere on the ring. The burst depends on where the gap sits, so a length that tracked
  // the gap exactly would be a reflection — move the drain, the door moves, the length moves
  // back — and would only land in the band by parity. A single bound makes the length exact
  // in one pass; the price is at most a fraction of a second of empty stage at the very end,
  // which the canvas fade and the win card already cover.
  let exitAllowance = CONGA_EXIT_MIN_MS;
  for (let i = 0; i < 96; i++) {
    exitAllowance = Math.max(exitAllowance, exitAt((i / 96) * (loop.length / speed)).burst);
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
  // The fling's direction can switch between up and down as the door moves, so the sampled
  // allowance can fall a little short of the door actually used; the last flight wins.
  const lastFlight = items.reduce((max, item) => Math.max(max, item.flight), 0);
  const duration = items.length ? Math.ceil(Math.max(firstExit + train + exitAllowance, lastFlight)) : 0;
  return {
    variant: 'conga',
    duration,
    viewport: { width, height, floorY },
    geometry: {
      ...loop,
      speed,
      bob,
      hop,
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

// How far a card has flown since it stepped out of the door: it accelerates from a dance
// step up to the frame budget's speed, then holds it. The inverse sizes each card's flight.
function congaExitDist(bt) {
  const tCap = (CONGA_EXIT_SPEED - CONGA_EXIT_V0) / CONGA_EXIT_ACCEL;
  if (bt <= tCap) return CONGA_EXIT_V0 * bt + (CONGA_EXIT_ACCEL * bt * bt) / 2;
  return CONGA_EXIT_V0 * tCap + (CONGA_EXIT_ACCEL * tCap * tCap) / 2 + CONGA_EXIT_SPEED * (bt - tCap);
}

function congaExitTime(distance) {
  const tCap = (CONGA_EXIT_SPEED - CONGA_EXIT_V0) / CONGA_EXIT_ACCEL;
  const dCap = congaExitDist(tCap);
  if (distance >= dCap) return tCap + (distance - dCap) / CONGA_EXIT_SPEED;
  const a = CONGA_EXIT_ACCEL / 2;
  return (-CONGA_EXIT_V0 + Math.sqrt(CONGA_EXIT_V0 * CONGA_EXIT_V0 + 4 * a * Math.max(0, distance))) / (2 * a);
}

// The kick on the fourth beat, for one card at one instant: 0 off the beat, rising to 1 at
// the top of the hop. `side` alternates every bar so the line kicks left, then right.
function congaKick(item, now) {
  const local = now - item.index * CONGA_KICK_RIPPLE_MS;
  const inBar = ((local % CONGA_BAR_MS) + CONGA_BAR_MS) % CONGA_BAR_MS;
  const u = (inBar - CONGA_BEAT_LEN_MS * 3) / CONGA_BEAT_LEN_MS;
  if (u <= 0 || u >= 1) return { lift: 0, side: 1 };
  const bar = Math.floor(local / CONGA_BAR_MS);
  const lift = Math.sin(Math.PI * u);
  return { lift: lift * lift, side: bar % 2 ? -1 : 1 };
}

function sampleConga(item, geometry, tau) {
  if (tau <= 0) return { x: item.ox, y: item.oy, alpha: 0, rotation: 0 };
  const now = tau + item.launch;
  const bob = geometry.bob * Math.sin((TAU * now) / CONGA_BOB_PERIOD_MS);
  const distance = finite(geometry.speed * now - item.offset);
  const kick = congaKick(item, now);
  const hop = -geometry.hop * kick.lift;
  const kickTilt = CONGA_KICK_TILT * kick.lift * kick.side;
  const stretch = 1 + CONGA_KICK_STRETCH * kick.lift;

  if (tau < item.entry) {
    // Spring from the pile onto the moving line, landing in the slot the queue will have
    // reached at hand-over. A fixed landing point means a straight, evenly paced flight;
    // the beat fades in with the landing so the hand-over has nothing to jump over.
    const t = clamp(tau / item.entry, 0, 1);
    const s = t * t * (3 - 2 * t);
    const sway = congaSway(geometry, distance, now);
    return {
      x: item.ox + (item.tx - item.ox) * s,
      y: item.oy + (item.ty + bob + hop - item.oy) * s,
      alpha: 1,
      rotation: (sway + kickTilt) * s,
      scale: 1 + (stretch - 1) * s,
    };
  }

  const sway = congaSway(geometry, now < item.exit ? distance : geometry.doorDistance, now);
  if (now < item.exit) {
    const point = congaAt(geometry, distance);
    return { x: point.x, y: point.y + bob + hop, alpha: 1, rotation: sway + kickTilt, scale: stretch };
  }

  // Out through the gap: a dance step that accelerates into a fling, spinning and tumbling
  // end over end. The hop and stretch it had at the door settle out over the first beat, so
  // nothing jumps. No private fade — a card is either on the stage or off it.
  const bt = now - item.exit;
  const settle = 1 - smoothstep(bt / CONGA_BEAT_LEN_MS);
  const atDoor = congaKick(item, item.exit);
  const travel = congaExitDist(bt);
  const spinSide = item.index % 2 ? -1 : 1;
  return {
    x: geometry.doorX + geometry.ux * travel,
    y: geometry.doorY + bob + geometry.uy * travel - geometry.hop * atDoor.lift * settle,
    alpha: now < item.flight ? 1 : 0,
    rotation: sway + CONGA_KICK_TILT * atDoor.lift * atDoor.side * settle
      + spinSide * CONGA_EXIT_SPIN * bt * smoothstep(bt / 400),
    scale: 1 + CONGA_KICK_STRETCH * Math.max(atDoor.lift * settle, smoothstep(bt / 400)),
    // Each card tumbles at its own rate, so the ribbon is a mix of faces and backs.
    flip: Math.cos(CONGA_EXIT_FLIP * (0.5 + ((item.index * 7) % 11) / 11)
      * Math.max(0, bt - 120) * smoothstep((bt - 120) / 300)),
  };
}

// The ripple runs along the queue as well as through time, so the line looks like it is
// dancing rather than sliding.
function congaSway(geometry, distance, now) {
  const s = (((distance % geometry.length) + geometry.length) % geometry.length) / geometry.length;
  return geometry.tip * Math.sin(TAU * (s * geometry.tipWaves - now / CONGA_TIP_PERIOD_MS));
}

// Smoothstep: eases in and out, and peaks at 1.5x the average speed, which is what every
// "ms per px" rate below is sized against.
const smoothstep = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

// ---------- Fireworks ----------
// The loud one. The cards rain down off the foundations into launch tubes along the bottom,
// a handful to a tube, and each tube fires its packet up as a shell: it climbs, slows, hangs
// for a squeeze, then bursts. The cards fly out as a two-ring flower, pop larger as they go,
// tumble end over end showing their backs, and fall away off the bottom. Six shells, one
// after another, the last one the biggest. The renderer adds the light — the trail, the flash
// and the ring — from the same numbers, via sampleSparks.
//
// Why it feels alive when the old paths did not: nothing moves at one constant speed. The
// shell decelerates into its apex, the burst decelerates under air drag and then gravity
// takes over, and every card spins and flips at its own rate. The frame budget (16px and 6
// degrees a frame) is still respected everywhere: drag and the terminal velocity are chosen
// so no card ever exceeds 0.9px per ms, which is also what makes the fall read as weight.
//
// Every burst is solved against the stage: the shell's apex sits low enough below the notch,
// and far enough from both sides, that the whole flower — including the pop and every
// rotation — stays on the stage. Cards only ever leave through the bottom.
const FW_SHELLS = [8, 8, 8, 8, 8, 12]; // cards per shell; the finale is the big one
const FW_SPEED = 0.9;            // px per ms: the ceiling every phase is sized against
const FW_DROP_MIN_MS = 450;
const FW_LOAD_STAGGER_MS = 45;   // one card lands in a tube every 45ms
const FW_LOAD_HOLD_MS = 160;     // the loaded tube rests a beat before it fires
const FW_SHELL_GAP_MS = 460;     // between one shell firing and the next
const FW_FINALE_GAP_MS = 320;    // a little extra wait before the finale, for suspense
const FW_RISE_MIN_MS = 650;
const FW_HANG_MS = 110;          // the shell hangs at its apex and squeezes before it bursts
const FW_PACKET_SCALE = 0.82;    // a loaded shell is a little smaller than a card at rest
const FW_SQUEEZE = 0.66;         // how small the shell squeezes just before it bursts
const FW_POP = 0.17;             // how far past full size a card pops as it flies out
const FW_POP_MS = 320;
const FW_SCALE_MAX = 1.16;       // the largest a card is ever drawn; bounds are sized by it
const FW_TERMINAL = 0.85;        // px per ms: the fall's terminal velocity
const FW_DRAG_MAX = 0.006;       // per ms: how quickly a burst loses its outward speed
const FW_FALL_RATE = 0.0012;     // per ms: how quickly the fall builds to terminal velocity
const FW_STACK_STEP = 1.5;       // px between cards in a loaded tube, so it reads as a stack
const FW_HUES = [48, 330, 190, 120, 280, 20]; // gold, pink, cyan, green, violet, orange

// The burst flight, in closed form so any instant can be sampled without stepping. The
// outward throw dies under air drag; the fall ramps up to its terminal velocity on a slower
// clock of its own, so the flower opens fully before it droops — tying the two together made
// gravity win within a tenth of a second and the burst never rose. Speed stays bounded by
// max(v0, terminal) because the throw decays faster than the fall builds (drag > fallRate).
function fireworkFlight(item, rocket, bt) {
  const k = rocket.drag;
  const a = (1 - Math.exp(-k * bt)) / k;
  const k2 = rocket.fallRate;
  const b = (1 - Math.exp(-k2 * bt)) / k2;
  return {
    cx: item.bx + item.vx * a,
    cy: item.by + item.vy * a + rocket.terminal * (bt - b),
    rotation: item.rot0 + item.spinEnd * bt + (item.spin - item.spinEnd) * a,
    flip: Math.cos(item.flipRate * bt),
    scale: 1 + (FW_SQUEEZE - 1) * Math.exp(-bt / 70) + FW_POP * Math.sin(Math.PI * Math.min(bt / FW_POP_MS, 1)),
  };
}

// The shell's centre on its climb: velocity falls linearly to nothing at the apex, so the
// peak speed is exactly twice the average and the duration is sized from that.
function shellAt(rocket, t) {
  const u = clamp((t - rocket.fire) / rocket.rise, 0, 1);
  const e = 1 - (1 - u) * (1 - u);
  return {
    x: rocket.padX + (rocket.apexX - rocket.padX) * e,
    y: rocket.padY + (rocket.apexY - rocket.padY) * e,
    u,
    e,
  };
}

function buildFireworks({
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
  const topInset = Math.max(0, finite(viewport.topInset, finite(viewport.top)));
  const rng = seededRandom(seed);
  const ordered = launchOrder(cards, piles);

  // The reach of a card from its centre at its largest, whatever its rotation or flip.
  const reach = (Math.hypot(cardWidth, cardHeight) / 2) * FW_SCALE_MAX;
  const margin = 6;
  const stageBottom = floorY + cardHeight;
  // The tubes sit on the floor, lifted just enough that a tilted card in the stack never
  // dips under the home indicator.
  const padY = stageBottom - reach;

  // The burst radius: a share of the stage, then cut down to what the stage can hold with
  // the apex centred and as high as the notch allows.
  const highest = topInset + margin + reach;
  let radius = clamp(Math.min(width * 0.3, height * 0.22), cardWidth * 0.8, 340);
  radius = Math.max(4, Math.min(radius, width / 2 - reach - margin - 4, (padY - highest) * 0.55));
  const drag = Math.min(FW_DRAG_MAX, (FW_SPEED * 0.98) / radius);
  const apexTop = highest + radius;                          // highest an apex may sit
  const apexLow = apexTop + Math.max(0, padY - apexTop) * 0.32; // lowest an apex may sit
  const apexLeft = Math.min(width / 2, radius + reach + margin + 4);
  const apexRight = Math.max(width / 2, width - apexLeft);

  // Where each shell bursts, as a share of the allowed box. Alternating sides so the eye is
  // pulled around the stage; the finale is dead centre and as high as it may go.
  const SPOTS = [[0.5, 0.35], [0.12, 0.7], [0.88, 0.45], [0.3, 0.05], [0.72, 0.85], [0.5, 0]];

  // Hand the cards to shells in launch order (kings first), so each shell carries a mix of
  // suits and colours rather than one suit.
  const total = Math.max(1, ordered.length);
  const sizes = FW_SHELLS.map((n) => Math.round((n * total) / 52));
  sizes[sizes.length - 1] += total - sizes.reduce((a, b) => a + b, 0);

  const rockets = sizes.map((n, k) => {
    const [fx, fy] = SPOTS[k % SPOTS.length];
    const apexX = apexLeft + (apexRight - apexLeft) * clamp(fx + (rng() - 0.5) * 0.12, 0, 1);
    const apexY = apexTop + (apexLow - apexTop) * clamp(fy + (rng() - 0.5) * 0.1, 0, 1);
    const padX = clamp(apexX + (rng() - 0.5) * radius * 0.5, reach, Math.max(reach, width - reach));
    const distance = Math.hypot(apexX - padX, apexY - padY);
    return {
      n,
      padX,
      padY,
      apexX,
      apexY,
      radius: k === sizes.length - 1 ? radius : radius * (0.82 + rng() * 0.12),
      drag,
      fallRate: Math.min(FW_FALL_RATE, drag * 0.5),
      terminal: FW_TERMINAL,
      rise: Math.max(FW_RISE_MIN_MS, Math.ceil((2 * distance) / FW_SPEED)),
      hue: FW_HUES[k % FW_HUES.length],
      twist: rng() * TAU,
    };
  });

  let cursor = 0;
  const items = ordered.map(({ card, pile }) => {
    let k = 0;
    let j = cursor;
    while (k < rockets.length - 1 && j >= rockets[k].n) { j -= rockets[k].n; k++; }
    cursor++;
    const rocket = rockets[k];
    const n = rocket.n;
    const origin = piles[pile] || {};
    // Same clamped scatter as the other paths: nothing starts off the stage or under the notch.
    const ox = clamp(finite(origin.x) - left + (rng() - 0.5) * cardWidth * 0.3, 0, Math.max(0, width - cardWidth));
    const oy = clamp(
      finite(origin.y) - top + (rng() - 0.5) * cardHeight * 0.3,
      Math.min(topInset, height - cardHeight),
      Math.max(0, height - cardHeight),
    );
    const ocx = ox + cardWidth / 2;
    const ocy = oy + cardHeight / 2;
    const slotX = (j - (n - 1) / 2) * 1.2;
    const slotY = -j * FW_STACK_STEP;
    const tilt = (j - (n - 1) / 2) * 0.05;
    const dropDistance = Math.hypot(rocket.padX + slotX - ocx, padY + slotY - ocy);
    // The drop bows toward the middle of the stage, so the rain is a curve, not a ruler.
    const bend = Math.min(dropDistance * 0.12, 40) * (rocket.padX >= ocx ? 1 : -1);
    const drop = Math.max(FW_DROP_MIN_MS, Math.ceil((1.5 * dropDistance + Math.PI * Math.abs(bend)) / FW_SPEED));

    // Two rings: even cards fly the full radius, odd ones a shorter one, so each burst is a
    // flower with a centre rather than a lone circle.
    const angle = rocket.twist + (TAU * j) / n + (rng() - 0.5) * (TAU / n) * 0.4;
    const reachOut = rocket.radius * (j % 2 ? 0.58 : 1) * (0.92 + rng() * 0.08);
    const speed = reachOut * drag;
    const spinSign = rng() < 0.5 ? -1 : 1;
    return {
      id: card.id || card.suit + card.rank,
      suit: card.suit,
      rank: card.rank,
      pile,
      rocket: k,
      j,
      ocx,
      ocy,
      slotX,
      slotY,
      tilt,
      bend,
      drop,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: spinSign * (0.0035 + rng() * 0.0013),
      spinEnd: spinSign * (0.0012 + rng() * 0.0008),
      flipRate: 0.0007 + rng() * 0.0024, // wide spread, so the tumbles fall out of step
    };
  });

  // Fire times: each shell after the last, then pull the whole show back so the very first
  // card leaves its foundation at zero. A card lands in its tube on a fixed cadence before
  // the shell fires, and leaves its foundation however long before that its drop needs.
  let fireAt = 0;
  rockets.forEach((rocket, k) => {
    rocket.fire = fireAt;
    fireAt += k === rockets.length - 2 ? FW_SHELL_GAP_MS + FW_FINALE_GAP_MS : FW_SHELL_GAP_MS;
  });
  for (const item of items) {
    const rocket = rockets[item.rocket];
    item.land = rocket.fire - FW_LOAD_HOLD_MS - (rocket.n - 1 - item.j) * FW_LOAD_STAGGER_MS;
    item.launch = item.land - item.drop;
  }
  const shift = -Math.min(...items.map((item) => item.launch));
  for (const rocket of rockets) {
    rocket.fire += shift;
    rocket.burstAt = rocket.fire + rocket.rise + FW_HANG_MS;
  }

  // When each card must still be on the stage (`leave`), and when it is fully gone (`gone`).
  // The flight has no closed-form exit, so it is stepped once here at a fine grain; the
  // sampler then only compares against two numbers.
  for (const item of items) {
    const rocket = rockets[item.rocket];
    item.land += shift;
    item.launch += shift;
    item.bx = rocket.apexX + item.slotX * 0.5;
    item.by = rocket.apexY + item.slotY * 0.5;
    item.rot0 = item.tilt;
    item.burstAt = rocket.burstAt;
    let bt = 0;
    item.leave = Infinity;
    for (; bt < 20000; bt += 2) {
      const p = fireworkFlight(item, rocket, bt);
      if (item.leave === Infinity && p.cy + reach > stageBottom) item.leave = item.burstAt + bt;
      if (p.cy - reach > height) break;
    }
    item.gone = item.burstAt + bt;
  }
  items.sort((a, b) => a.launch - b.launch);

  const lastSpark = Math.max(...rockets.map((rocket) => rocket.burstAt + 900));
  const duration = Math.ceil(Math.max(lastSpark, ...items.map((item) => item.gone)) + 1);

  return {
    variant: 'fireworks',
    duration,
    viewport: { width, height, floorY },
    geometry: {
      width,
      height,
      cw: cardWidth,
      ch: cardHeight,
      stageBottom,
      reach,
      rockets,
    },
    items,
  };
}

function sampleFireworks(item, geometry, tau) {
  const { cw: w, ch: h } = geometry;
  const at = (cx, cy, rotation, scale = 1, flip = 1, alpha = 1) => ({
    x: cx - w / 2, y: cy - h / 2, alpha, rotation, scale, flip,
  });
  if (tau <= 0) return at(item.ocx, item.ocy, 0, 1, 1, 0);
  const t = tau + item.launch;
  const rocket = geometry.rockets[item.rocket];
  const slotCx = rocket.padX + item.slotX;
  const slotCy = rocket.padY + item.slotY;

  if (t < item.land) {
    // The rain into the tube: a smooth drop that bows toward the middle and swings once.
    const u = clamp(tau / item.drop, 0, 1);
    const s = smoothstep(u);
    return at(
      item.ocx + (slotCx - item.ocx) * s + item.bend * Math.sin(Math.PI * u),
      item.ocy + (slotCy - item.ocy) * s,
      item.tilt * s + 0.5 * Math.sin(Math.PI * s) * Math.sign(item.bend || 1),
    );
  }

  if (t < rocket.fire) {
    // In the tube: a squash on landing, then the whole stack shrinks into a shell.
    const squash = 0.1 * Math.sin(Math.PI * clamp((t - item.land) / 160, 0, 1));
    const load = smoothstep((t - (rocket.fire - 200)) / 200);
    return at(slotCx, slotCy, item.tilt, (1 - squash) * (1 + (FW_PACKET_SCALE - 1) * load));
  }

  if (t < item.burstAt) {
    // The climb, then the hang: the shell tightens as it rises and squeezes at the top.
    const shell = shellAt(rocket, t);
    const tighten = 1 - 0.5 * shell.e;
    const hang = smoothstep((t - (item.burstAt - FW_HANG_MS)) / FW_HANG_MS);
    const wobble = 0.12 * Math.sin((t - rocket.fire) / 60) * (1 - shell.u);
    return at(
      shell.x + item.slotX * tighten,
      shell.y + item.slotY * tighten,
      item.tilt + wobble,
      FW_PACKET_SCALE + (FW_SQUEEZE - FW_PACKET_SCALE) * hang,
    );
  }

  const p = fireworkFlight(item, rocket, t - item.burstAt);
  return at(p.cx, p.cy, p.rotation, p.scale, p.flip, t < item.gone ? 1 : 0);
}

// The light that goes with the shells: a sparkling trail under each climbing shell, then at
// the burst a flash, an expanding ring and a spray of streaks, all fading. Pure numbers for
// the renderer to draw additively; it never touches a card.
const SPARK_MS = 900;
const SPARK_STREAKS = 14;
export function sampleSparks(sequence, t) {
  if (!sequence || sequence.variant !== 'fireworks') return [];
  const out = [];
  for (const rocket of sequence.geometry.rockets) {
    if (t >= rocket.fire && t < rocket.burstAt) {
      for (let i = 0; i < 7; i++) {
        const tt = t - i * 26;
        if (tt < rocket.fire) break;
        const p = shellAt(rocket, tt);
        const jitter = Math.sin(tt * 0.37 + i) * 3;
        out.push({
          kind: 'dot',
          x: p.x + jitter,
          y: p.y + sequence.geometry.ch * 0.35 + i * 2,
          r: Math.max(0.8, 3.2 - i * 0.35),
          alpha: (1 - i / 7) * 0.9 * (1 - p.u * 0.5),
          hue: rocket.hue,
        });
      }
    }
    const bt = t - rocket.burstAt;
    if (bt >= 0 && bt < SPARK_MS) {
      const life = bt / SPARK_MS;
      const grow = 1 - (1 - Math.min(bt / 600, 1)) ** 3;
      if (bt < 260) {
        out.push({
          kind: 'flash', x: rocket.apexX, y: rocket.apexY,
          r: rocket.radius * (0.35 + 0.5 * (bt / 260)), alpha: (1 - bt / 260) ** 2, hue: rocket.hue,
        });
      }
      out.push({
        kind: 'ring', x: rocket.apexX, y: rocket.apexY,
        r: rocket.radius * 1.15 * grow, alpha: (1 - life) ** 2 * 0.8, hue: rocket.hue,
      });
      for (let i = 0; i < SPARK_STREAKS; i++) {
        const a = rocket.twist + (TAU * (i + 0.5)) / SPARK_STREAKS;
        const r1 = rocket.radius * 1.3 * grow;
        out.push({
          kind: 'streak',
          x: rocket.apexX + Math.cos(a) * r1 * 0.7,
          y: rocket.apexY + Math.sin(a) * r1 * 0.7 + 40 * life * life,
          x2: rocket.apexX + Math.cos(a) * r1,
          y2: rocket.apexY + Math.sin(a) * r1 + 60 * life * life,
          r: 2,
          alpha: (1 - life) * 0.9,
          hue: rocket.hue,
        });
      }
    }
  }
  return out;
}

// ---------- Fan (the flourish) ----------
// The cardsharp ending. All 52 cards gather into one big fan held at the bottom of the
// stage — the classic spread — breathe in it for a beat, fold into a neat half-closed
// packet, bow to the player, then be tossed up off the top of the stage as a ribbon. The
// silhouette is an arc
// of cards radiating from one pivot, which none of the other five produces; there is no
// scatter, no queue and no funnel to lean on.
//
// The fold deliberately stops at a small spread rather than a single deck pose: 52 cards at
// one point draw as one card face, so closing all the way would make the fan visibly
// vanish into a lone card. The held packet keeps the cards overlapping and distinct, which
// is the difference between closing a fan and erasing it.
//
// The spread is solved, not designed: the pivot sits at the bottom edge of the resting
// band, and every slot angle is checked against the card's own rotated extent against the
// notch on the top and the stage sides, so the pass is bisected down from the design spread
// only when a stage cannot hold it. On a phone the fan is lower and wider; on a very wide
// stage the design spread already fits and nothing is given up.
const FAN_SPREAD_MAX = 1.15;      // the design spread, about 132 degrees overall
const FAN_SPREAD_MIN = 0.35;      // the narrowest the solver may leave it
const FAN_DEEP = 2.6;             // deepest slot, as a fraction of card height (to allow small cards)
const FAN_SHALLOW = 1.35;         // shallowest slot. Real fans hold the outer cards deeper,
                                  // which is also what keeps the inner cards clear of the
                                  // bottom edge when they tip wide.
const FAN_FOLD_SPREAD = 0.35;     // rad the folded packet still holds open, about 20 degrees
const FAN_STAGGER_MS = 14;        // one card leaves its foundation every 14ms
const FAN_GATHER_RATE = 1.55;     // ms of spring per px of gap, as the old shuffle's gather:
                                  // smoothstep peaks at 1.5x the average speed and that is
                                  // the frame budget, so the rate is deliberately the cap.
const FAN_GATHER_MIN_MS = 500;
const FAN_SETTLE_MIN_MS = 3600;   // the earliest the fold may begin, whatever the stage
const FAN_SETTLE_GAP_MS = 300;    // rest once every card is home before anything moves
const FAN_FLUTTER_MS = 1400;      // the breathing window, ending as the fold begins
const FAN_FLUTTER_RAMP_MS = 250;  // the sway eases in, so the fan never jumps
const FAN_FLUTTER_LAND_MS = 300;  // a card only sways once it has landed in its slot
const FAN_FLUTTER_WOBBLE = 0.022; // rad a card sways either way, about 1.3 degrees
const FAN_FLUTTER_PERIOD_MS = 900; // one sway cycle. Slower than the fold that follows it,
                                  // so the fan reads as held rather than as already leaving.
const FAN_RIPPLE_TURNS = 0.5;     // half a sway wavelength end to end, so it travels
const FAN_RIPPLE_MS = 240;        // the fold runs left to right down the fan (u is the slot
                                  // position), so the fan collapses like a hand closing.
const FAN_CLOSE_RATE = 1.9;       // ms of fold per px of slot travel. The sine ease peaks
                                  // at 1.57x the average speed and the sweep's arc runs a
                                  // sixth longer than its chord, so this rate is the frame
                                  // budget; shorter would break it on the widest stage.
const FAN_CLOSE_MIN_MS = 450;
const FAN_SNAP_HOLD_MS = 200;     // the folded packet sits before it bows
const FAN_BOW_MS = 800;
const FAN_BOW_RAD = 0.16;         // about 9 degrees: a nod, not a flop
const FAN_EXIT_HOLD_MS = 300;
const FAN_EXIT_SPEED = 0.78;      // px per ms: a toss the eye can follow, not a blur, and
                                  // fast enough that the widest stage still ends inside the
                                  // pass's band.
const FAN_EXIT_UX = 0.12;         // up, a shade to the right. Up, not down: the packet
const FAN_EXIT_UY = -0.99278;     // rests on the floor, so a downward exit leaves the stage
                                  // in about sixty milliseconds and the beat is never seen.
                                  // Rising gives it the full height of the stage to read, and
                                  // the small lean keeps it leaving through the top edge
                                  // rather than the corner.
                                  // The pair is a unit vector (0.0144 + 0.9856 = 1), which is
                                  // what makes exitDur a true flight length.
const FAN_EXIT_MIN_MS = 350;
const FAN_EXIT_SPIN = -0.3;       // rad by the end of the flight: the packet tips as it goes
const FAN_EXIT_RIPPLE_MS = 140;   // the packet unravels upward in a short wave

const sineInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));

// What the stage allows at one slot angle: the shallowest radius (the card's own lowest
// corner stays above the resting band's bottom edge) and the caps the notch and the sides
// put on the deepest. All extents are measured from the rotated card, so the bow, the sway
// and a tablet's wider cards are all counted, never assumed away.
function fanRadiusBounds(theta, view) {
  const s = Math.abs(Math.sin(theta));
  const c = Math.max(0.2, Math.abs(Math.cos(theta)));
  const floor = (4 + (view.cw / 2) * s + (view.ch / 2) * c) / c;
  const top = (view.bottom - view.topInset - 4 - (view.cw / 2) * s - (view.ch / 2) * c) / c;
  const side = Math.abs(Math.sin(theta)) < 0.05
    ? Infinity
    : (view.width / 2 - 6 - (view.cw / 2) * c - (view.ch / 2) * s) / Math.abs(Math.sin(theta));
  return { floor, top, side };
}

// Find the widest spread the stage can hold, the outer card being the binding one: every
// inner slot has a smaller angle and therefore a roomier window.
function fanSpread(view, wobble) {
  const feasible = (spread) => {
    const deep = fanRadiusBounds(spread + wobble, view);
    const eager = fanRadiusBounds(Math.max(0, spread - wobble), view);
    const cap = Math.min(deep.top, deep.side, eager.top, eager.side);
    return cap >= deep.floor + 2;
  };
  // A stage too small for even the narrowest fan still gets one: the per-card clamp below
  // then resolves to the stage's own window, keeping the card on the stage rather than
  // pretending a wider spread fits.
  if (feasible(FAN_SPREAD_MAX)) return FAN_SPREAD_MAX;
  if (!feasible(FAN_SPREAD_MIN)) return FAN_SPREAD_MIN;
  let lo = FAN_SPREAD_MIN;
  let hi = FAN_SPREAD_MAX;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (feasible(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

function buildFan({
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
  const topInset = Math.max(0, finite(viewport.topInset, finite(viewport.top)));
  const rng = seededRandom(seed);
  const ordered = launchOrder(cards, piles);

  const half = Math.hypot(cardWidth, cardHeight) / 2;
  const pivotY = floorY + cardHeight; // the bottom edge of the resting band
  const cx = width / 2;
  const view = { bottom: pivotY, topInset, width, cw: cardWidth, ch: cardHeight };
  const spread = fanSpread(view, FAN_FLUTTER_WOBBLE);

  const count = Math.max(1, ordered.length);

  // The folded packet sits just above the pivot, a shallow arc the fan squashes into: the
  // base keeps the packet's lowest card clear of the bottom edge, the shallow slot keeps
  // its arc in family with the fan it came from.
  const packetBase = Math.max(cardHeight / 2 + 8, cardHeight * 0.55);
  const shallow = Math.max(packetBase + cardHeight * 0.4, cardHeight * FAN_SHALLOW);
  const deep = cardHeight * FAN_DEEP;

  // Launch order is rank-major, so it would paint the same colour four times in a row along
  // the fan. This permutation spreads each suit about the arc and still uses every slot
  // exactly once: seven and a count of 52 share no factor.
  const slotOf = (index) => (index * 7) % count;

  const items = ordered.map(({ card, pile }, index) => {
    const origin = piles[pile] || {};
    // Same clamped scatter as the other paths: nothing may start off the stage or under
    // the notch, on a phone or on a tablet whose foundations reach nearly to an edge.
    const ox = clamp(finite(origin.x) - left + (rng() - 0.5) * cardWidth * 0.3, 0, Math.max(0, width - cardWidth));
    const oy = clamp(
      finite(origin.y) - top + (rng() - 0.5) * cardHeight * 0.3,
      Math.min(topInset, height - cardHeight),
      Math.max(0, height - cardHeight),
    );

    const u = count > 1 ? slotOf(index) / (count - 1) : 0.5;
    const theta = (u * 2 - 1) * spread;
    // The slot radius: deep for the outer cards, then clamped into what this very angle's
    // sway-safe window allows.
    const deepPose = fanRadiusBounds(theta + FAN_FLUTTER_WOBBLE, view);
    const shallowPose = fanRadiusBounds(theta - FAN_FLUTTER_WOBBLE, view);
    const cap = Math.min(deepPose.top, deepPose.side, shallowPose.top, shallowPose.side);
    const floor = Math.max(deepPose.floor, shallowPose.floor);
    const d = clamp(shallow + (deep - shallow) * u, floor, cap);

    const thetaFold = (u - 0.5) * FAN_FOLD_SPREAD;
    // The folded packet keeps a shallow arc: the outer cards end up in front at a radius
    // near the fan's own shallow slot, so the fold is a squashing, not a teleport.
    const dFold = packetBase + (shallow - packetBase) * (0.4 + 0.6 * u);
    const xFold = cx + Math.sin(thetaFold) * dFold - cardWidth / 2;
    const yFold = pivotY - Math.cos(thetaFold) * dFold - cardHeight / 2;

    const x = cx + Math.sin(theta) * d - cardWidth / 2;
    const y = pivotY - Math.cos(theta) * d - cardHeight / 2;

    const distance = Math.hypot(x - ox, y - oy);
    const gather = Math.max(FAN_GATHER_MIN_MS, distance * FAN_GATHER_RATE);
    const launch = index * FAN_STAGGER_MS;
    return {
      id: card.id || card.suit + card.rank,
      suit: card.suit,
      rank: card.rank,
      pile,
      launch,
      gather,
      gatherEnd: launch + gather,
      u,
      theta,
      d,
      thetaFold,
      dFold,
      x,
      y,
      xFold,
      yFold,
      foldDelay: u * FAN_RIPPLE_MS,
      foldMs: Math.max(FAN_CLOSE_MIN_MS, Math.ceil(Math.hypot(xFold - x, yFold - y) * FAN_CLOSE_RATE)),
      ox,
      oy,
    };
  });

  const maxLanded = items.reduce((max, item) => Math.max(max, item.gatherEnd), 0);
  const foldStart = Math.max(FAN_SETTLE_MIN_MS, Math.ceil(maxLanded + FAN_SETTLE_GAP_MS));
  const foldEnd = items.reduce(
    (max, item) => Math.max(max, foldStart + item.foldDelay + item.foldMs),
    foldStart,
  );
  const bowStart = foldEnd + FAN_SNAP_HOLD_MS;
  const exitStart = bowStart + FAN_BOW_MS + FAN_EXIT_HOLD_MS;
  // Up, past the top edge of the stage, one short wave. The packet rests on the floor, so
  // the flight is set by the card furthest from the top edge — the lowest in the packet —
  // because it needs the most travel to clear it: its centre plus a corner radius, which
  // covers the tip the flight adds. Using the highest card instead would drop alpha on
  // cards that still had a sliver on screen.
  const packetTop = Math.max(...items.map((item) => item.yFold));
  const clearance = packetTop + cardHeight / 2 + half;
  const exitDur = Math.max(FAN_EXIT_MIN_MS, clearance / (FAN_EXIT_SPEED * Math.abs(FAN_EXIT_UY)));
  // The wave runs across the packet from left to right, the way it folded: each card's exit
  // is its own absolute time, so the sampler and the tests share one number for "on the
  // stage" versus "flicked away". Every card flies the same length, set by the highest one.
  items.forEach((item) => {
    item.exit = exitStart + item.u * FAN_EXIT_RIPPLE_MS;
  });
  const duration = Math.ceil(exitStart + FAN_EXIT_RIPPLE_MS + exitDur);

  return {
    variant: 'fan',
    duration,
    viewport: { width, height, floorY },
    geometry: {
      width,
      height,
      pivotY,
      cx,
      cw: cardWidth,
      ch: cardHeight,
      spread,
      foldStart,
      flutterStart: foldStart - FAN_FLUTTER_MS,
      bowStart,
      bowMs: FAN_BOW_MS,
      bowRad: FAN_BOW_RAD,
      exitStart,
      exitRipple: FAN_EXIT_RIPPLE_MS,
      exitDur,
    },
    items,
  };
}

// The breathing: each card sways about its slot angle, the wave running along the fan, and
// only once it has landed and only inside the flutter window, easing in from stillness.
function fanSway(item, geometry, t) {
  const ramp = smoothstep((t - geometry.flutterStart) / FAN_FLUTTER_RAMP_MS)
    * smoothstep((t - item.gatherEnd) / FAN_FLUTTER_LAND_MS);
  const wave = Math.sin(TAU * (t / FAN_FLUTTER_PERIOD_MS + item.u * FAN_RIPPLE_TURNS));
  return FAN_FLUTTER_WOBBLE * ramp * wave;
}

function sampleFan(item, geometry, tau) {
  if (tau <= 0) return { x: item.ox, y: item.oy, alpha: 0, rotation: 0 };
  const t = tau + item.launch;
  const settled = geometry.foldStart + item.foldDelay + item.foldMs;

  if (t < item.gatherEnd) {
    // The spring from the pile into the slot, sized from distance like every other path.
    const s = smoothstep(tau / item.gather);
    return {
      x: item.ox + (item.x - item.ox) * s,
      y: item.oy + (item.y - item.oy) * s,
      alpha: 1,
      rotation: item.theta * s,
    };
  }

  if (t < settled) {
    // Hold in the slot, breathe once the flutter window opens, then fold. One expression
    // covers all three: the fold ease and the sway envelope both start from zero, so the
    // hand-overs are continuous by construction rather than by a patch.
    const e = sineInOut((t - geometry.foldStart - item.foldDelay) / item.foldMs);
    const theta = item.theta + (item.thetaFold - item.theta) * e;
    const d = item.d + (item.dFold - item.d) * e;
    return {
      x: geometry.cx + Math.sin(theta) * d - geometry.cw / 2,
      y: geometry.pivotY - Math.cos(theta) * d - geometry.ch / 2,
      alpha: 1,
      rotation: theta + fanSway(item, geometry, t) * (1 - e),
    };
  }

  // The folded packet: sit through the snap hold, bow once, all cards together, sit again,
  // then flick away in a wave. The bow starts from the packet's own tilt and ends at zero,
  // and the wave starts from zero, so no hand-over here has anything to jump over.
  if (t < item.exit) {
    const bow = Math.sin(Math.PI * clamp((t - geometry.bowStart) / geometry.bowMs, 0, 1));
    return {
      x: item.xFold,
      y: item.yFold,
      alpha: 1,
      rotation: item.thetaFold + geometry.bowRad * bow,
    };
  }

  const bt = t - item.exit;
  if (bt >= geometry.exitDur) {
    return { x: item.xFold, y: item.yFold, alpha: 0, rotation: FAN_EXIT_SPIN };
  }
  const f2 = bt / geometry.exitDur;
  return {
    x: item.xFold + FAN_EXIT_UX * FAN_EXIT_SPEED * bt,
    y: item.yFold + FAN_EXIT_UY * FAN_EXIT_SPEED * bt,
    alpha: 1,
    // The card's tilt settles into the flick's spin across the flight, never mid-air.
    rotation: item.thetaFold + (FAN_EXIT_SPIN - item.thetaFold) * f2,
  };
}

// ---------- The seam ----------

// One sampler per path: a new path is a line here rather than another branch in the loop.
const SAMPLERS = {
  waterfall: (item, tau) => sampleWaterfall(item, tau),
  vortex: (item, tau, geometry) => sampleVortex(item, geometry, tau),
  conga: (item, tau, geometry) => sampleConga(item, geometry, tau),
  fireworks: (item, tau, geometry) => sampleFireworks(item, geometry, tau),
  fan: (item, tau, geometry) => sampleFan(item, geometry, tau),
};

export function buildWinSequence(options = {}) {
  // An unknown name is a coding mistake, not a reason to leave a win uncelebrated: the
  // waterfall is the fallback everywhere else, so it is the fallback here too.
  if (options.variant === 'fan') return buildFan(options);
  if (options.variant === 'fireworks') return buildFireworks(options);
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
      // Optional channels: a path that never sets them draws at full size, face up.
      scale: finite(point.scale, 1),
      flip: finite(point.flip, 1),
    };
  });
}
