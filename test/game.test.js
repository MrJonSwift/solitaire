import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, seededRandom, drawFromStock, moveCards, moveToFoundation, cardsAt,
  allTableauFaceUp, autoCompleteStep, isValidState, createDeck,
  encodeState, decodeState, pushUndo, popUndo, UNDO_LIMIT,
} from '../js/game.js';

const card = (suit, rank, faceUp = true) => ({ id: suit + rank, suit, rank, faceUp });
const emptyState = (extra = {}) => ({
  version: 1, drawCount: 1, stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [[], [], [], [], [], [], []], moves: 0, won: false, autoPromptDismissed: false, ...extra,
});

test('deal: 7 columns of 1..7 with only the top card face up, 24 in stock', () => {
  const s = newGame({ rng: seededRandom(1) });
  s.tableau.forEach((pile, i) => {
    assert.equal(pile.length, i + 1);
    pile.forEach((c, j) => assert.equal(c.faceUp, j === i));
  });
  assert.equal(s.stock.length, 24);
  assert.ok(s.stock.every((c) => !c.faceUp));
  assert.ok(isValidState(s));
});

test('seeded deals are repeatable and differ by seed', () => {
  const a = JSON.stringify(newGame({ rng: seededRandom(7) }));
  assert.equal(a, JSON.stringify(newGame({ rng: seededRandom(7) })));
  assert.notEqual(a, JSON.stringify(newGame({ rng: seededRandom(8) })));
});

test('draw 1 moves one card face up to the waste', () => {
  const s = newGame({ rng: seededRandom(2) });
  const topId = s.stock[s.stock.length - 1].id;
  assert.ok(drawFromStock(s));
  assert.equal(s.waste.length, 1);
  assert.equal(s.waste[0].id, topId);
  assert.ok(s.waste[0].faceUp);
  assert.equal(s.moves, 1);
});

test('draw 3 moves three cards (or what is left) and recycles the waste in order', () => {
  const s = emptyState({ drawCount: 3, stock: [card('S', 1, false), card('S', 2, false), card('S', 3, false), card('S', 4, false)] });
  drawFromStock(s);
  assert.deepEqual(s.waste.map((c) => c.id), ['S4', 'S3', 'S2']);
  drawFromStock(s);
  assert.deepEqual(s.waste.map((c) => c.id), ['S4', 'S3', 'S2', 'S1']);
  assert.equal(s.stock.length, 0);
  drawFromStock(s); // recycle
  assert.deepEqual(s.stock.map((c) => c.id), ['S1', 'S2', 'S3', 'S4']);
  assert.ok(s.stock.every((c) => !c.faceUp));
  assert.equal(s.waste.length, 0);
  assert.equal(drawFromStock(emptyState()), false);
});

test('tableau: only kings on empty columns; descending alternating colours', () => {
  const s = emptyState({ waste: [card('H', 12)], tableau: [[card('S', 13)], [], [card('C', 13)], [], [], [], []] });
  assert.equal(moveCards(s, { type: 'waste' }, { type: 'tableau', index: 1 }), false); // queen on empty
  assert.ok(moveCards(s, { type: 'waste' }, { type: 'tableau', index: 0 })); // red Q on black K
  s.waste.push(card('D', 12));
  assert.equal(moveCards(s, { type: 'waste' }, { type: 'tableau', index: 0 }), false); // K has a Q already
  s.waste = [card('S', 12)];
  assert.equal(moveCards(s, { type: 'waste' }, { type: 'tableau', index: 2 }), false); // black on black
});

test('moving a run flips the newly exposed card', () => {
  const s = emptyState({ tableau: [[card('D', 4, false), card('S', 9), card('H', 8)], [card('D', 10)], [], [], [], [], []] });
  assert.deepEqual(cardsAt(s, { type: 'tableau', index: 0, cardIndex: 0 }), []); // face-down not movable
  assert.ok(moveCards(s, { type: 'tableau', index: 0, cardIndex: 1 }, { type: 'tableau', index: 1 }));
  assert.deepEqual(s.tableau[1].map((c) => c.id), ['D10', 'S9', 'H8']);
  assert.ok(s.tableau[0][0].faceUp);
});

test('foundations: ace first, then same suit ascending, one card at a time', () => {
  const s = emptyState({ waste: [card('H', 2), card('H', 1)], tableau: [[card('C', 3), card('H', 2)], [], [], [], [], [], []] });
  assert.ok(moveToFoundation(s, { type: 'waste' }));
  assert.ok(moveToFoundation(s, { type: 'waste' }));
  assert.deepEqual(s.foundations[0].map((c) => c.id), ['H1', 'H2']);
  assert.equal(moveToFoundation(s, { type: 'tableau', index: 0, cardIndex: 0 }), false); // not the top card
});

test('auto-complete finishes once every tableau card is face up', () => {
  const deck = createDeck();
  const s = emptyState({
    tableau: [[deck.find((c) => c.id === 'H13'), deck.find((c) => c.id === 'S12')], [], [], [], [], [], []],
    stock: deck.filter((c) => c.id !== 'H13' && c.id !== 'S12'),
  });
  s.tableau[0].forEach((c) => { c.faceUp = true; });
  assert.ok(allTableauFaceUp(s));
  let steps = 0;
  while (autoCompleteStep(s)) steps++;
  assert.equal(steps, 52);
  assert.ok(s.won);
});

test('isValidState rejects corrupt saves', () => {
  assert.equal(isValidState(null), false);
  assert.equal(isValidState({}), false);
  const s = newGame();
  s.stock.pop();
  assert.equal(isValidState(s), false);
});

test('undo snapshots round-trip exactly and are compact', () => {
  const s = newGame({ drawCount: 3, rng: seededRandom(3) });
  drawFromStock(s);
  s.autoPromptDismissed = true;
  const text = encodeState(s);
  assert.ok(text.length < 400, `snapshot is ${text.length} chars`);
  assert.deepEqual(decodeState(text), s);
});

test('undo restores earlier positions in order, back to the deal', () => {
  const s = newGame({ rng: seededRandom(4) });
  const dealt = JSON.stringify(s);
  const history = [];
  pushUndo(history, encodeState(s));
  drawFromStock(s);
  const afterOne = JSON.stringify(s);
  pushUndo(history, encodeState(s));
  drawFromStock(s);
  assert.equal(JSON.stringify(popUndo(history)), afterOne);
  assert.equal(JSON.stringify(popUndo(history)), dealt);
  assert.equal(popUndo(history), null);
});

test('undo history is capped and skips corrupt entries', () => {
  const s = newGame({ rng: seededRandom(5) });
  const history = [];
  for (let i = 0; i < UNDO_LIMIT + 10; i++) pushUndo(history, encodeState(s));
  assert.equal(history.length, UNDO_LIMIT);
  const good = encodeState(s);
  const h2 = [good, 'garbage', '1;2;0;0;S1'];
  assert.equal(JSON.stringify(popUndo(h2)), JSON.stringify(decodeState(good)));
  assert.equal(h2.length, 0);
});
