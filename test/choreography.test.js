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
