import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../js/game.js';
import { buildWinSequence, sampleSequence, LAUNCH_MS } from '../js/choreography.js';

// Phone-sized stage. The card size and floor come from the same numbers the board uses on
// an iPhone in portrait, so a sample outside these bounds is a card the player would not see.
const cw = 48;
const ch = 67;
const viewport = { width: 393, height: 852, left: 0, top: 0, floorY: 852 - 34 - ch };

function board() {
  const cards = createDeck().map((c) => ({ ...c, faceUp: true }));
  const piles = ['S', 'H', 'D', 'C'].map((suit, i) => ({
    x: 12 + i * 54,
    y: 47,
    cards: cards.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank),
  }));
  return { cards, piles };
}

const build = (seed = 7, variant = 'waterfall') =>
  buildWinSequence({ variant, ...board(), cw, ch, viewport, seed });

test('one sequence uses all 52 cards exactly once', () => {
  const sequence = build();
  assert.equal(sequence.variant, 'waterfall');
  assert.equal(sequence.items.length, 52);
  const ids = sequence.items.map((item) => item.id);
  assert.equal(new Set(ids).size, 52);
});

test('cards launch in order, at the exported cadence', () => {
  const sequence = build();
  let previous = -Infinity;
  for (const item of sequence.items) {
    assert.ok(Number.isFinite(item.launch), `${item.id} has no launch time`);
    assert.ok(item.launch >= previous, `${item.id} launched before the card before it`);
    previous = item.launch;
  }
  assert.equal(sequence.items[0].launch, 0);
  for (let i = 1; i < sequence.items.length; i++) {
    assert.equal(sequence.items[i].launch - sequence.items[i - 1].launch, LAUNCH_MS);
  }
});

test('a full pass lasts between four and nine seconds', () => {
  const { duration } = build();
  // Launch window (51 * 120 = 6120ms) plus the fixed tail the canvas fade runs over.
  assert.ok(duration >= 4000, `duration ${duration}ms is shorter than 4s`);
  assert.ok(duration <= 9000, `duration ${duration}ms is longer than 9s`);
});

test('every live card stays inside the viewport at every phase', () => {
  const sequence = build();
  const times = [0, 250, LAUNCH_MS * 10, sequence.duration / 2, sequence.duration - 1, sequence.duration];
  for (const t of times) {
    const cards = sampleSequence(sequence, t);
    assert.equal(cards.length, 52, `sample at ${t}ms lost cards`);
    for (const card of cards) {
      assert.ok(Number.isFinite(card.x), `${card.id} x is not finite at ${t}ms`);
      assert.ok(Number.isFinite(card.y), `${card.id} y is not finite at ${t}ms`);
      assert.ok(Number.isFinite(card.alpha), `${card.id} alpha is not finite at ${t}ms`);
      assert.ok(Number.isFinite(card.rotation), `${card.id} rotation is not finite at ${t}ms`);
      assert.ok(card.alpha >= 0 && card.alpha <= 1, `${card.id} alpha ${card.alpha} at ${t}ms`);
      if (card.alpha <= 0) continue; // not launched yet, or already out of play
      // Cards leave through the sides throughout the pass; until fully gone their
      // rectangle may be partly cropped, exactly like the shipped cascade.
      assert.ok(card.x >= -cw && card.x <= viewport.width,
        `${card.id} is fully past a side at ${t}ms (x=${card.x})`);
      assert.ok(card.y >= 0 && card.y + ch <= viewport.height + 1e-6,
        `${card.id} left the top or bottom at ${t}ms (y=${card.y})`);
    }
  }
});

test('there is no single-frame teleport: 16ms never moves a live card 60px', () => {
  const sequence = build();
  const frame = 16;
  // Step across the whole pass, not just a few spots: the old floor-clamp jumped hundreds
  // of pixels on one frame and would fail here.
  for (let t = 0; t + frame <= sequence.duration; t += 100) {
    const before = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
    for (const card of sampleSequence(sequence, t + frame)) {
      const previous = before.get(card.id);
      if (!previous || previous.alpha <= 0 || card.alpha <= 0) continue;
      const live = (c) => c.x >= -cw && c.x <= viewport.width;
      if (!live(previous) || !live(card)) continue;
      const moved = Math.hypot(card.x - previous.x, card.y - previous.y);
      assert.ok(moved <= 60, `${card.id} moved ${moved.toFixed(1)}px in 16ms at ${t}ms`);
    }
  }
});

test('the ending belongs to the canvas, not to individual cards', () => {
  const sequence = build();
  const cards = sampleSequence(sequence, sequence.duration);
  for (const card of cards) {
    // No card may be mid-fade when the sequence ends: it is either gone because it left
    // the stage, or fully opaque and still in play for the canvas fade to take out.
    assert.ok(card.alpha === 0 || card.alpha === 1,
      `${card.id} has an individual fade alpha ${card.alpha} at the end`);
    if (card.alpha === 1) {
      assert.ok(card.x >= -cw && card.x <= viewport.width,
        `${card.id} is opaque but already off the stage at the end`);
      assert.ok(card.y >= 0 && card.y + ch <= viewport.height + 1e-6,
        `${card.id} is opaque but outside the stage at the end`);
    }
    assert.equal(card.rotation, 0, `${card.id} rotated on the waterfall`);
  }
});

test('a fixed seed is repeatable and sampling does not depend on call order', () => {
  const a = build(11);
  const b = build(11);
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(sampleSequence(a, 1234), sampleSequence(b, 1234));

  const mid = sampleSequence(a, 1234);
  sampleSequence(a, 0);
  assert.deepEqual(sampleSequence(a, 1234), mid);

  const other = build(12);
  assert.notDeepEqual(other.items, a.items);
});

// ---------- Vortex ----------
const vortex = (seed = 7) => build(seed, 'vortex');

// A spinning card's corners define what the player actually sees, so every bound here is
// measured from the rotated rectangle, not from the card's unrotated edges. The default is
// the phone stage; a sweep or a safe-area test passes its own bounds.
const phoneStage = {
  width: viewport.width,
  top: 0,
  bottom: viewport.floorY + ch, // where a card at rest puts its bottom edge
  cw,
  ch,
};
const inside = (card, stage = phoneStage) => {
  const cos = Math.abs(Math.cos(card.rotation));
  const sin = Math.abs(Math.sin(card.rotation));
  const ex = (cos * stage.cw + sin * stage.ch) / 2;
  const ey = (sin * stage.cw + cos * stage.ch) / 2;
  const cx = card.x + stage.cw / 2;
  const cy = card.y + stage.ch / 2;
  return cx - ex >= -0.6 && cx + ex <= stage.width + 0.6
    && cy - ey >= stage.top - 0.6 && cy + ey <= stage.bottom + 0.6;
};

test('the vortex uses all 52 cards exactly once, and says so', () => {
  const sequence = vortex();
  assert.equal(sequence.variant, 'vortex');
  assert.equal(sequence.items.length, 52);
  assert.equal(new Set(sequence.items.map((item) => item.id)).size, 52);
});

test('a vortex pass lasts between four and nine seconds', () => {
  const { duration } = vortex();
  assert.ok(duration >= 4000, `duration ${duration}ms is shorter than 4s`);
  assert.ok(duration <= 9000, `duration ${duration}ms is longer than 9s`);
});

test('the funnel never puts a card past an edge while it is on the way up', () => {
  const sequence = vortex();
  for (let t = 0; t <= sequence.duration; t += 25) {
    const cards = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
    for (const item of sequence.items) {
      const tau = t - item.launch;
      // Not launched yet, or already thrown off the stage on purpose. Up to the neck nothing
      // may be cropped: that is the whole of ticket 01's geometry promise.
      if (tau <= 0 || tau >= item.spinEnd) continue;
      const card = cards.get(item.id);
      assert.ok(inside(card), `${card.id} is cropped at ${t}ms (x=${card.x}, y=${card.y})`);
    }
  }
});

test('a vortex card springs from its own foundation, and the suits hold four ribbons', () => {
  const { cards, piles } = board();
  const sequence = vortex();
  for (const item of sequence.items) {
    const card = sampleSequence(sequence, item.launch + 1).find((c) => c.id === item.id);
    const origin = piles[item.pile];
    assert.ok(card.alpha > 0, `${card.id} is invisible at its launch`);
    assert.ok(Math.abs(card.x - origin.x) <= cw * 0.15 + 5,
      `${card.id} started at x=${card.x}, not at its pile (${origin.x})`);
    assert.ok(Math.abs(card.y - origin.y) <= ch * 0.15 + 5,
      `${card.id} started at y=${card.y}, not at its pile (${origin.y})`);
  }
  // Every card must *begin* on the stage. The launch scatter is proportional to the card,
  // so on a tablet it is wider than the gap between the foundation row and the top edge:
  // unclamped, a card starts above the top for the first frames of its spring. Checked on
  // the origins rather than on sampled frames, because the ease-out clears the pile within
  // one frame and a time-sampled test cannot see it.
  for (const k of [
    { cw, ch, name: 'phone' },
    { cw: 105, ch: 147, name: 'tablet' },
  ]) {
    const stage = { width: 393, height: 852, left: 0, top: 0, floorY: 852 - 34 - k.ch };
    const laid = ['S', 'H', 'D', 'C'].map((suit, i) => ({
      x: 12 + i * (k.cw + 6),
      y: 8, // the foundation row, near the top of the stage
      cards: piles[i].cards,
    }));
    const seq = buildWinSequence({
      variant: 'vortex', cards, piles: laid, cw: k.cw, ch: k.ch, viewport: stage, seed: 9,
    });
    for (const item of seq.items) {
      assert.ok(item.ox >= -0.001 && item.ox + k.cw <= stage.width + 0.001,
        `${k.name}: ${item.id} starts off the side (x=${item.ox})`);
      assert.ok(item.oy >= -0.001 && item.oy + k.ch <= stage.height + 0.001,
        `${k.name}: ${item.id} starts off the top or bottom (y=${item.oy})`);
    }
  }

  // Each suit holds one angular offset, a quarter turn apart. Without that the funnel is a
  // crowd of cards rather than four reading ribbons.
  const bySuit = new Map();
  for (const item of sequence.items) {
    if (!bySuit.has(item.suit)) bySuit.set(item.suit, []);
    bySuit.get(item.suit).push(item.theta0);
  }
  const means = [...bySuit.values()].map((list) => {
    const x = list.reduce((sum, t) => sum + Math.cos(t), 0);
    const y = list.reduce((sum, t) => sum + Math.sin(t), 0);
    return Math.atan2(y, x);
  }).sort((a, b) => a - b);
  const gaps = means.map((angle, i) => (i === 0
    ? means[0] + Math.PI * 2 - means[means.length - 1]
    : angle - means[i - 1]));
  for (const gap of gaps) {
    assert.ok(Math.abs(gap - Math.PI / 2) < 0.35, `ribbon gap ${gap.toFixed(2)}rad is not a quarter turn`);
  }
});

test('the vortex never teleports: 16ms never moves a live card 60px', () => {
  const sequence = vortex();
  const frame = 16;
  for (let t = 0; t + frame <= sequence.duration; t += 50) {
    const before = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
    for (const card of sampleSequence(sequence, t + frame)) {
      const previous = before.get(card.id);
      if (!previous || previous.alpha <= 0 || card.alpha <= 0) continue;
      const moved = Math.hypot(card.x - previous.x, card.y - previous.y);
      assert.ok(moved <= 60, `${card.id} moved ${moved.toFixed(1)}px in 16ms at ${t}ms`);
    }
  }
});

test('the vortex ends on the canvas fade, not on 52 cards evaporating', () => {
  const sequence = vortex();
  const cards = sampleSequence(sequence, sequence.duration);
  assert.equal(cards.length, 52);
  assert.ok(cards.some((card) => card.alpha === 1), 'the fade had nothing left to take out');
  for (const card of cards) {
    // Either still flying for the canvas fade, or already gone. Never mid-fade: a card seen
    // fading on its own is the defect the waterfall's ending already fixed.
    assert.ok(card.alpha === 0 || card.alpha === 1, `${card.id} has a private fade (${card.alpha})`);
  }
});

test('a vortex seed is repeatable and a different seed is a different pass', () => {
  const a = vortex(11);
  const b = vortex(11);
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(sampleSequence(a, 1234), sampleSequence(b, 1234));
  assert.notDeepEqual(vortex(12).items, a.items);
});

// ---------- Conga ----------
const conga = (seed = 7) => build(seed, 'conga');

test('the conga uses all 52 cards exactly once, and says so', () => {
  const sequence = conga();
  assert.equal(sequence.variant, 'conga');
  assert.equal(sequence.items.length, 52);
  assert.equal(new Set(sequence.items.map((item) => item.id)).size, 52);
});

test('a conga pass lasts between six and eight seconds', () => {
  const { duration } = conga();
  assert.ok(duration >= 6000, `duration ${duration}ms is shorter than 6s`);
  assert.ok(duration <= 8000, `duration ${duration}ms is longer than 8s`);
});

test('every conga card starts on the stage', () => {
  const sequence = conga();
  for (const item of sequence.items) {
    const card = sampleSequence(sequence, item.launch + 1).find((c) => c.id === item.id);
    assert.ok(card.alpha > 0, `${item.id} is invisible at its launch`);
    assert.ok(inside(card), `${item.id} starts off the stage (x=${card.x}, y=${card.y})`);
  }
});

test('the conga chain stays on the stage and never returns a NaN', () => {
  const sequence = conga();
  for (let t = 0; t <= sequence.duration; t += 25) {
    const cards = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
    assert.equal(cards.size, 52, `sample at ${t}ms lost cards`);
    for (const item of sequence.items) {
      const card = cards.get(item.id);
      assert.ok(Number.isFinite(card.x), `${card.id} x is not finite at ${t}ms`);
      assert.ok(Number.isFinite(card.y), `${card.id} y is not finite at ${t}ms`);
      const tau = t - item.launch;
      // Not launched yet, or already flying out through the gap on purpose. Everything on
      // the ring itself is inside the stage: that is the whole geometry promise.
      // item.exit is an absolute time, not a per-card duration: a card that has reached
      // the gap is flying off the stage on purpose.
      if (tau <= 0 || t >= item.exit) continue;
      assert.ok(inside(card), `${card.id} is cropped at ${t}ms (x=${card.x}, y=${card.y})`);
    }
  }
});

test('the conga ends on an empty board', () => {
  const sequence = conga();
  const cards = sampleSequence(sequence, sequence.duration);
  assert.equal(cards.length, 52);
  for (const card of cards) {
    // Every card is already off the stage when the sequence ends, so the win card opens
    // on an empty board. No card is left for the canvas fade to take out.
    assert.equal(card.alpha, 0, `${card.id} is still on the board at the end`);
  }
});

test('a conga seed is repeatable, and a different seed is a different pass', () => {
  // The seed scatters where each card leaves its foundation, which sizes its spring, so
  // unlike the geometry it is not decoration: the same win must look the same twice.
  const a = conga(11);
  const b = conga(11);
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(sampleSequence(a, 1234), sampleSequence(b, 1234));
  assert.notDeepEqual(conga(12).items, a.items);
});

test('conga alphas are on or off and the tip never over-rotates', () => {
  const sequence = conga();
  for (let t = 0; t <= sequence.duration; t += 25) {
    for (const card of sampleSequence(sequence, t)) {
      assert.ok(card.alpha === 0 || card.alpha === 1, `${card.id} has a private fade (${card.alpha})`);
      assert.ok(Number.isFinite(card.rotation), `${card.id} rotation is not finite at ${t}ms`);
      assert.ok(Math.abs(card.rotation) <= 0.2 + 1e-9, `${card.id} tips ${card.rotation}rad at ${t}ms`);
    }
  }
});

test('the conga frames itself from a 320px phone to a landscape iPad, without a jump', () => {
  // The circuit is sized from the stage and the card, so every size needs to be swept: a
  // ring that fits an iPhone can still be cropped on a tablet, and the per-frame step is
  // measured against the same 16px the other paths are held to.
  const stages = [
    { name: 'smallest phone', width: 320, height: 568, cw: 42, ch: 59 },
    { name: 'phone', width: 393, height: 852, cw: 48, ch: 67 },
    { name: 'iPad', width: 1024, height: 768, cw: 105, ch: 147 },
    { name: 'iPad Pro landscape', width: 1366, height: 1024, cw: 130, ch: 182 },
  ];
  for (const stage of stages) {
    const cards = createDeck().map((c) => ({ ...c, faceUp: true }));
    const piles = ['S', 'H', 'D', 'C'].map((suit, i) => ({
      x: 12 + i * (stage.cw + 6),
      y: 8, // the foundation row, near the top of the stage
      cards: cards.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank),
    }));
    const view = {
      width: stage.width,
      height: stage.height,
      left: 0,
      top: 0,
      floorY: stage.height - 34 - stage.ch,
    };
    const sequence = buildWinSequence({
      variant: 'conga', cards, piles, cw: stage.cw, ch: stage.ch, viewport: view, seed: 9,
    });
    const bounds = {
      width: stage.width,
      top: 0,
      bottom: view.floorY + stage.ch,
      cw: stage.cw,
      ch: stage.ch,
    };

    for (const item of sequence.items) {
      const card = sampleSequence(sequence, item.launch + 1).find((c) => c.id === item.id);
      assert.ok(card.alpha > 0 && inside(card, bounds),
        `${stage.name}: ${item.id} starts off the stage (x=${card.x}, y=${card.y})`);
    }

    for (let t = 0; t <= sequence.duration; t += 25) {
      const byId = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
      for (const item of sequence.items) {
        const tau = t - item.launch;
        if (tau <= 0 || t >= item.exit) continue;
        const card = byId.get(item.id);
        assert.ok(inside(card, bounds), `${stage.name}: ${item.id} is cropped at ${t}ms`);
      }
    }

    const frame = 16;
    for (let t = 0; t + frame <= sequence.duration; t += 50) {
      const before = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
      for (const card of sampleSequence(sequence, t + frame)) {
        const previous = before.get(card.id);
        if (!previous || previous.alpha <= 0 || card.alpha <= 0) continue;
        const moved = Math.hypot(card.x - previous.x, card.y - previous.y);
        assert.ok(moved <= 16, `${stage.name}: ${card.id} moved ${moved.toFixed(1)}px in 16ms at ${t}ms`);
      }
    }

    assert.equal(sampleSequence(sequence, sequence.duration).filter((c) => c.alpha > 0).length, 0,
      `${stage.name}: the board is not empty at the end`);
    assert.ok(sequence.duration >= 6200, `${stage.name}: duration ${sequence.duration}ms is under 6.2s`);
    assert.ok(sequence.duration <= 8000, `${stage.name}: duration ${sequence.duration}ms is over 8s`);
  }
});

test('the conga stays under the notch, not just above the home indicator', () => {
  // The top straight is built from the top safe area the way the bottom is built from the
  // floor: no card's rotated extent may cross it, or the queue runs under the Dynamic
  // Island. The foundations here sit below the notch, as they do inside the app's padding.
  const notch = 59;
  const cards = createDeck().map((c) => ({ ...c, faceUp: true }));
  const piles = ['S', 'H', 'D', 'C'].map((suit, i) => ({
    x: 12 + i * (cw + 6),
    y: notch + 8,
    cards: cards.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank),
  }));
  const view = { ...viewport, top: 0, topInset: notch };
  const sequence = buildWinSequence({
    variant: 'conga', cards, piles, cw, ch, viewport: view, seed: 4,
  });
  const bounds = { ...phoneStage, top: notch };
  for (let t = 0; t <= sequence.duration; t += 25) {
    const byId = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
    for (const item of sequence.items) {
      const tau = t - item.launch;
      if (tau <= 0 || t >= item.exit) continue;
      const card = byId.get(item.id);
      assert.ok(inside(card, bounds),
        `${item.id} crosses the notch at ${t}ms (y=${card.y.toFixed(1)})`);
    }
  }
});

test('the conga length lands in its band at both ends of the stage sweep', () => {
  // A stage too small to fill the window is stretched to the short end; one too large to
  // drain in time is cut to the long end. Both ends are the promise of the ticket.
  const cards = createDeck().map((c) => ({ ...c, faceUp: true }));
  const lengths = (width, height, cw, ch) => {
    const piles = ['S', 'H', 'D', 'C'].map((suit, i) => ({
      x: 12 + i * (cw + 6),
      y: 8,
      cards: cards.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank),
    }));
    const view = { width, height, left: 0, top: 0, floorY: height - 34 - ch };
    return buildWinSequence({ variant: 'conga', cards, piles, cw, ch, viewport: view, seed: 2 }).duration;
  };
  const short = lengths(320, 240, 30, 42);
  assert.ok(short >= 6200 && short <= 6201, `short stage lasted ${short}ms, not the 6.2s floor`);
  const long = lengths(1600, 1400, 200, 280);
  assert.ok(long >= 7999 && long <= 8000, `huge stage lasted ${long}ms, not the 8s ceiling`);
});

// ---------- Shuffle ----------
const shuffle = (seed = 7) => build(seed, 'shuffle');

test('the shuffle uses all 52 cards exactly once, and says so', () => {
  const sequence = shuffle();
  assert.equal(sequence.variant, 'shuffle');
  assert.equal(sequence.items.length, 52);
  assert.equal(new Set(sequence.items.map((item) => item.id)).size, 52);
});

test('a shuffle pass lasts between six and seven seconds', () => {
  const { duration } = shuffle();
  assert.ok(duration >= 6000, `duration ${duration}ms is shorter than 6s`);
  assert.ok(duration <= 7000, `duration ${duration}ms is longer than 7s`);
});

test('every shuffle card starts on the stage', () => {
  const sequence = shuffle();
  for (const item of sequence.items) {
    const card = sampleSequence(sequence, item.launch + 1).find((c) => c.id === item.id);
    assert.ok(card.alpha > 0, `${item.id} is invisible at its launch`);
    assert.ok(inside(card), `${item.id} starts off the stage (x=${card.x}, y=${card.y})`);
  }
});

test('the shuffle deck stays on the stage and never returns a NaN', () => {
  const sequence = shuffle();
  for (let t = 0; t <= sequence.duration; t += 25) {
    const cards = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
    assert.equal(cards.size, 52, `sample at ${t}ms lost cards`);
    for (const item of sequence.items) {
      const card = cards.get(item.id);
      assert.ok(Number.isFinite(card.x), `${card.id} x is not finite at ${t}ms`);
      assert.ok(Number.isFinite(card.y), `${card.id} y is not finite at ${t}ms`);
      assert.ok(Number.isFinite(card.rotation), `${card.id} rotation is not finite at ${t}ms`);
      const tau = t - item.launch;
      // Not launched yet, or already sliding off the stage on purpose at the very end.
      if (tau <= 0 || t >= item.exit) continue;
      assert.ok(inside(card), `${card.id} is cropped at ${t}ms (x=${card.x}, y=${card.y})`);
    }
  }
});

test('the shuffle ends on an empty board', () => {
  const sequence = shuffle();
  const cards = sampleSequence(sequence, sequence.duration);
  assert.equal(cards.length, 52);
  for (const card of cards) {
    // The deck slides off the stage as one before the sequence ends, so the win card opens
    // on an empty board. No card is left for the canvas fade to take out.
    assert.equal(card.alpha, 0, `${card.id} is still on the board at the end`);
  }
});

test('shuffle alphas are on or off, never a private fade', () => {
  const sequence = shuffle();
  for (let t = 0; t <= sequence.duration; t += 25) {
    for (const card of sampleSequence(sequence, t)) {
      assert.ok(card.alpha === 0 || card.alpha === 1, `${card.id} has a private fade (${card.alpha})`);
    }
  }
});

test('the shuffle frames itself from a 320px phone to a landscape iPad, without a jump', () => {
  const stages = [
    { name: 'smallest phone', width: 320, height: 568, cw: 42, ch: 59 },
    { name: 'phone', width: 393, height: 852, cw: 48, ch: 67 },
    { name: 'iPad', width: 1024, height: 768, cw: 105, ch: 147 },
    { name: 'iPad Pro landscape', width: 1366, height: 1024, cw: 130, ch: 182 },
  ];
  for (const stage of stages) {
    const cards = createDeck().map((c) => ({ ...c, faceUp: true }));
    const piles = ['S', 'H', 'D', 'C'].map((suit, i) => ({
      x: 12 + i * (stage.cw + 6),
      y: 8,
      cards: cards.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank),
    }));
    const view = {
      width: stage.width,
      height: stage.height,
      left: 0,
      top: 0,
      floorY: stage.height - 34 - stage.ch,
    };
    const sequence = buildWinSequence({
      variant: 'shuffle', cards, piles, cw: stage.cw, ch: stage.ch, viewport: view, seed: 9,
    });
    const bounds = {
      width: stage.width,
      top: 0,
      bottom: view.floorY + stage.ch,
      cw: stage.cw,
      ch: stage.ch,
    };

    for (const item of sequence.items) {
      const card = sampleSequence(sequence, item.launch + 1).find((c) => c.id === item.id);
      assert.ok(card.alpha > 0 && inside(card, bounds),
        `${stage.name}: ${item.id} starts off the stage (x=${card.x}, y=${card.y})`);
    }

    for (let t = 0; t <= sequence.duration; t += 25) {
      const byId = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
      for (const item of sequence.items) {
        const tau = t - item.launch;
        if (tau <= 0 || t >= item.exit) continue;
        const card = byId.get(item.id);
        assert.ok(inside(card, bounds), `${stage.name}: ${item.id} is cropped at ${t}ms`);
      }
    }

    const frame = 16;
    for (let t = 0; t + frame <= sequence.duration; t += 50) {
      const before = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
      for (const card of sampleSequence(sequence, t + frame)) {
        const previous = before.get(card.id);
        if (!previous || previous.alpha <= 0 || card.alpha <= 0) continue;
        const moved = Math.hypot(card.x - previous.x, card.y - previous.y);
        assert.ok(moved <= 16, `${stage.name}: ${card.id} moved ${moved.toFixed(1)}px in 16ms at ${t}ms`);
      }
    }

    assert.equal(sampleSequence(sequence, sequence.duration).filter((c) => c.alpha > 0).length, 0,
      `${stage.name}: the board is not empty at the end`);
    assert.ok(sequence.duration >= 6000, `${stage.name}: duration ${sequence.duration}ms is under 6s`);
    assert.ok(sequence.duration <= 7000, `${stage.name}: duration ${sequence.duration}ms is over 7s`);
  }
});

test('the shuffle stays under the notch, not just above the home indicator', () => {
  const notch = 59;
  const cards = createDeck().map((c) => ({ ...c, faceUp: true }));
  const piles = ['S', 'H', 'D', 'C'].map((suit, i) => ({
    x: 12 + i * (cw + 6),
    y: notch + 8,
    cards: cards.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank),
  }));
  const view = { ...viewport, top: 0, topInset: notch };
  const sequence = buildWinSequence({
    variant: 'shuffle', cards, piles, cw, ch, viewport: view, seed: 4,
  });
  const bounds = { ...phoneStage, top: notch };
  for (let t = 0; t <= sequence.duration; t += 25) {
    const byId = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
    for (const item of sequence.items) {
      const tau = t - item.launch;
      if (tau <= 0 || t >= item.exit) continue;
      const card = byId.get(item.id);
      assert.ok(inside(card, bounds),
        `${item.id} crosses the notch at ${t}ms (y=${card.y.toFixed(1)})`);
    }
  }
});

test('a shuffle seed is repeatable, and a different seed is a different pass', () => {
  const a = shuffle(11);
  const b = shuffle(11);
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(sampleSequence(a, 1234), sampleSequence(b, 1234));
  assert.notDeepEqual(shuffle(12).items, a.items);
});

test('the vortex frames itself on a tablet as well as on a phone', () => {
  // The funnel is sized from the stage, so a landscape iPad gets a different composition.
  // It still may not crop a rising card: ticket 01's rule is not a phone-only rule.
  const wideCw = 105;
  const wideCh = 147;
  const wide = { width: 1024, height: 768, left: 0, top: 0, floorY: 601 };
  const cards = createDeck().map((c) => ({ ...c, faceUp: true }));
  const piles = ['S', 'H', 'D', 'C'].map((suit, i) => ({
    x: 40 + i * 120,
    y: 24,
    cards: cards.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank),
  }));
  const sequence = buildWinSequence({
    variant: 'vortex', cards, piles, cw: wideCw, ch: wideCh, viewport: wide, seed: 3,
  });
  const bottom = wide.floorY + wideCh;
  for (let t = 0; t <= sequence.duration; t += 20) {
    const byId = new Map(sampleSequence(sequence, t).map((card) => [card.id, card]));
    for (const item of sequence.items) {
      const tau = t - item.launch;
      if (tau <= 0 || tau >= item.spinEnd) continue;
      const card = byId.get(item.id);
      const cos = Math.abs(Math.cos(card.rotation));
      const sin = Math.abs(Math.sin(card.rotation));
      const ex = (cos * wideCw + sin * wideCh) / 2;
      const ey = (sin * wideCw + cos * wideCh) / 2;
      const cx = card.x + wideCw / 2;
      const cy = card.y + wideCh / 2;
      assert.ok(cx - ex >= -0.6 && cx + ex <= wide.width + 0.6
        && cy - ey >= -0.6 && cy + ey <= bottom + 0.6,
        `${card.id} is cropped at ${t}ms on the tablet (x=${card.x}, y=${card.y})`);
    }
  }
});
