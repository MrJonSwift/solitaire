import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintSentence } from '../js/hint-copy.js';

// Same shapes as js/game.js uses; kept local so this suite stays independent of the engine.
const card = (suit, rank, faceUp = true) => ({ id: suit + rank, suit, rank, faceUp });
const emptyState = (extra = {}) => ({
  version: 1, drawCount: 1, stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [[], [], [], [], [], [], []], moves: 0, won: false, autoPromptDismissed: false, ...extra,
});
const move = (over) => ({
  kind: 'move', from: { type: 'waste' }, to: { type: 'tableau', index: 0 },
  cardIds: ['H7'], score: 100, because: 'waste', ...over,
});

test('hint sentence: sending a card home names which foundation, for every suit', () => {
  // There are four foundations; "to the foundation" leaves a screen-reader user guessing which
  // one to look at. The card's own suit names it, and the same card always says the same words.
  const suits = [['S', 'spades'], ['H', 'hearts'], ['D', 'diamonds'], ['C', 'clubs']];
  for (const [suit, suitName] of suits) {
    const s = emptyState({ waste: [card(suit, 7)] });
    const hint = move({
      cardIds: [`${suit}7`],
      to: { type: 'foundation', index: 0 },
      because: 'foundation',
    });
    const sentence = hintSentence(hint, s);
    assert.equal(sentence, `Seven of ${suitName} to the ${suitName} foundation.`);
  }
});

test('hint sentence: the foundation index is ignored even when the position is impossible', () => {
  // A seven can never be first onto an empty foundation, and the four foundations here are
  // empty, so the probe is deliberately illegal: it isolates the wording from the pile index.
  const s = emptyState({ waste: [card('H', 7)] });
  const sentences = [0, 1, 2, 3].map((index) => hintSentence(
    move({ to: { type: 'foundation', index }, because: 'foundation' }),
    s,
  ));
  assert.deepEqual(new Set(sentences).size, 1);
  assert.equal(sentences[0], 'Seven of hearts to the hearts foundation.');
});

test('hint sentence: a reveal names the card it lands on and says what the move buys', () => {
  const s = emptyState({
    tableau: [[card('D', 4, false), card('H', 7)], [card('S', 8)], [], [], [], [], []],
  });
  const hint = move({
    from: { type: 'tableau', index: 0, cardIndex: 1 },
    to: { type: 'tableau', index: 1 },
    because: 'reveal',
  });
  assert.equal(hintSentence(hint, s), 'Seven of hearts onto the eight of spades, revealing a card.');
});

test('hint sentence: freeing a column still names the pile the card lands on', () => {
  // 'empty-column' means the move *empties* the column it leaves; the engine only emits it when
  // the destination already holds cards. Saying "to the empty column" would send a screen-reader
  // user looking in the wrong place, so the destination card is named and the gain is spoken.
  const s = emptyState({ tableau: [[card('S', 13)], [card('H', 12)], [], [], [], [], []] });
  const hint = move({
    from: { type: 'tableau', index: 0, cardIndex: 0 },
    to: { type: 'tableau', index: 1 },
    cardIds: ['S13'],
    because: 'empty-column',
  });
  assert.equal(hintSentence(hint, s), 'King of spades onto the queen of hearts, emptying a column.');
});

test('hint sentence: a waste card says where it came from', () => {
  const s = emptyState({ waste: [card('H', 7)], tableau: [[card('S', 8)], [], [], [], [], [], []] });
  const hint = move({ to: { type: 'tableau', index: 0 }, because: 'waste' });
  assert.equal(hintSentence(hint, s), 'Seven of hearts from the waste onto the eight of spades.');
});

test('hint sentence: a reveal can still land on an empty column', () => {
  const s = emptyState({ tableau: [[card('D', 4, false), card('S', 13)], [], [], [], [], [], []] });
  const hint = move({
    from: { type: 'tableau', index: 0, cardIndex: 1 },
    to: { type: 'tableau', index: 2 },
    cardIds: ['S13'],
    because: 'reveal',
  });
  assert.equal(hintSentence(hint, s), 'King of spades onto the empty column, revealing a card.');
});

test('hint sentence: the unused build reason still has words, so no hint is speechless', () => {
  // The engine cannot produce this token today. The fallback is here for the day it can;
  // without it a build would reach the screen reader as nothing at all.
  const s = emptyState({ tableau: [[card('H', 7)], [card('S', 8)], [], [], [], [], []] });
  const hint = move({
    from: { type: 'tableau', index: 0, cardIndex: 0 },
    to: { type: 'tableau', index: 1 },
    because: 'build',
  });
  assert.equal(hintSentence(hint, s), 'Seven of hearts onto the eight of spades.');
});

test('hint sentence: drawing from the stock is the whole sentence', () => {
  assert.equal(hintSentence({ kind: 'draw' }, emptyState()), 'Draw from the stock.');
});

test('hint sentence: no advice is said out loud too, not left silent', () => {
  assert.equal(hintSentence({ kind: 'none' }, emptyState()), 'No move to suggest.');
});
