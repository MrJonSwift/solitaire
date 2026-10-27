import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardsAt, canMove, moveCards, newGame, drawFromStock } from '../js/game.js';
import { enumerateMoves, scoreMove, findHint } from '../js/hints.js';

// Same shapes as js/game.js uses; kept local so the two suites stay independent.
const card = (suit, rank, faceUp = true) => ({ id: suit + rank, suit, rank, faceUp });
const emptyState = (extra = {}) => ({
  version: 1, drawCount: 1, stock: [], waste: [], foundations: [[], [], [], []],
  tableau: [[], [], [], [], [], [], []], moves: 0, won: false, autoPromptDismissed: false, ...extra,
});

// Asking for advice is not a move. Every read of a position has to leave it byte-for-byte alone.
function hintOf(state) {
  const before = structuredClone(state);
  const hint = findHint(state);
  assert.deepEqual(state, before);
  return hint;
}

function movesOf(state) {
  const before = structuredClone(state);
  const moves = enumerateMoves(state);
  assert.deepEqual(state, before);
  return moves;
}

function scoreOf(state, move) {
  const before = structuredClone(state);
  const score = scoreMove(state, move);
  assert.deepEqual(state, before);
  return score;
}

// The only hint worth having is one the real rules accept, naming the cards it would pick up.
function playable(state, hint) {
  assert.equal(hint.kind, 'move');
  assert.deepEqual(cardsAt(state, hint.from).map((c) => c.id), hint.cardIds);
  const probe = structuredClone(state);
  assert.equal(moveCards(probe, hint.from, hint.to), true);
  return probe;
}

test('hint: an ace on the waste goes home instead of starting a build', () => {
  const s = emptyState({
    waste: [card('S', 1)],
    tableau: [[card('H', 2)], [card('D', 7, false)], [], [], [], [], []],
  });
  // The ace could also start a build, which is exactly the choice the hint has to get right.
  assert.ok(canMove(s, { type: 'waste' }, { type: 'tableau', index: 0 }));
  const hint = hintOf(s);
  assert.deepEqual(hint, {
    kind: 'move', from: { type: 'waste' }, to: { type: 'foundation', index: 0 },
    cardIds: ['S1'], score: 100, because: 'foundation',
  });
  playable(s, hint);
});

test('hint: a move that turns a card over beats a move that only builds', () => {
  const s = emptyState({
    tableau: [
      [card('D', 4, false), card('S', 9), card('H', 8)],
      [card('D', 10)],
      [card('S', 7), card('H', 6)],
      [card('C', 7)],
      [], [], [],
    ],
  });
  const hint = hintOf(s);
  assert.deepEqual(hint.from, { type: 'tableau', index: 0, cardIndex: 1 });
  assert.deepEqual(hint.to, { type: 'tableau', index: 1 });
  assert.deepEqual(hint.cardIds, ['S9', 'H8']);
  assert.equal(hint.because, 'reveal');
  // The aimless build is legal and available; it is simply not the advice.
  const build = movesOf(s).find((m) => m.from.index === 2 && m.from.cardIndex === 1 && m.to.index === 3);
  assert.equal(build.to.type, 'tableau');
  assert.ok(hint.score > scoreMove(s, build));
  playable(s, hint);
});

test('hint: a run moves as one piece, with the right cardIndex and every cardId', () => {
  const s = emptyState({
    tableau: [[card('D', 4, false), card('S', 9), card('H', 8), card('C', 7)], [card('D', 10)], [], [], [], [], []],
  });
  const hint = hintOf(s);
  assert.deepEqual(hint.from, { type: 'tableau', index: 0, cardIndex: 1 });
  assert.deepEqual(hint.cardIds, ['S9', 'H8', 'C7']);
  assert.equal(hint.score, 80);
  const after = playable(s, hint);
  assert.deepEqual(after.tableau[1].map((c) => c.id), ['D10', 'S9', 'H8', 'C7']);
  // The card underneath is what the move was worth having; the rules turn it over.
  assert.equal(after.tableau[0][0].faceUp, true);
});

test('hint: a foundation is never a place to take a card from', () => {
  const s = emptyState({
    foundations: [[card('H', 1), card('H', 2)], [], [], []],
    tableau: [[card('S', 3)], [], [], [], [], [], []],
  });
  // Taking the two back down is legal, which is exactly why the engine has to ignore it.
  assert.ok(canMove(s, { type: 'foundation', index: 0 }, { type: 'tableau', index: 0 }));
  const moves = movesOf(s);
  assert.ok(moves.every((m) => m.from.type !== 'foundation'));
  assert.deepEqual(moves, []);
  assert.deepEqual(hintOf(s), { kind: 'none' });
});

test('hint: freeing a column is worth more than shuffling a build', () => {
  const s = emptyState({
    tableau: [[card('H', 6)], [card('S', 7)], [card('C', 9), card('D', 8)], [card('S', 9)], [], [], []],
  });
  const hint = hintOf(s);
  assert.deepEqual(hint.from, { type: 'tableau', index: 0, cardIndex: 0 });
  assert.deepEqual(hint.to, { type: 'tableau', index: 1 });
  assert.equal(hint.because, 'empty-column');
  assert.ok(hint.score > 0);
  // A whole column moved to an empty one is the same board twice over, so it is never offered.
  const toEmpty = movesOf(s).filter((m) => m.to.type === 'tableau' && s.tableau[m.to.index].length === 0);
  assert.ok(toEmpty.every((m) => m.from.cardIndex !== 0));
  playable(s, hint);
});

test('hint: a whole column is never carried into an empty one', () => {
  const s = emptyState({ tableau: [[card('S', 13)], [card('H', 12)], [], [], [], [], []] });
  // Both moves are legal: the queen onto the king, and the king into the empty column. The second
  // leaves the board exactly as it was, one pile to the right.
  assert.ok(canMove(s, { type: 'tableau', index: 0, cardIndex: 0 }, { type: 'tableau', index: 2 }));
  const moves = movesOf(s);
  assert.ok(moves.every((m) => !(m.from.index === 0 && m.to.index === 2)));
  const hint = hintOf(s);
  assert.deepEqual(hint.from, { type: 'tableau', index: 1, cardIndex: 0 });
  assert.deepEqual(hint.to, { type: 'tableau', index: 0 });
  playable(s, hint);
});

test('hint: the score table is additive and each situation is worth its stated weight', () => {
  // Foundation: +100, plus the flip that sending a covered single card home buys (+80).
  const home = emptyState({
    foundations: [[], [], [], []],
    tableau: [[card('S', 2, false), card('H', 1)], [card('S', 2)], [], [], [], [], []],
  });
  const toFoundation = { from: { type: 'tableau', index: 0, cardIndex: 1 }, to: { type: 'foundation', index: 0 } };
  assert.equal(scoreOf(home, toFoundation), 180);

  // Reveal alone: +80. Same run landing on an empty column loses 25, so +55.
  const reveal = emptyState({ tableau: [[card('D', 4, false), card('S', 9), card('H', 8)], [card('D', 10)], [], [], [], [], []] });
  assert.equal(scoreOf(reveal, { from: { type: 'tableau', index: 0, cardIndex: 1 }, to: { type: 'tableau', index: 1 } }), 80);
  assert.equal(scoreOf(reveal, { from: { type: 'tableau', index: 0, cardIndex: 1 }, to: { type: 'tableau', index: 2 } }), 55);

  // Emptying a column into a non-empty pile: +35. Waste onto the tableau: +25.
  const empty = emptyState({ tableau: [[card('H', 6)], [card('S', 7)], [], [], [], [], []] });
  assert.equal(scoreOf(empty, { from: { type: 'tableau', index: 0, cardIndex: 0 }, to: { type: 'tableau', index: 1 } }), 35);
  const waste = emptyState({ waste: [card('H', 6)], tableau: [[card('S', 7)], [], [], [], [], [], []] });
  assert.equal(scoreOf(waste, { from: { type: 'waste' }, to: { type: 'tableau', index: 0 } }), 25);
  // A waste king has nowhere useful to go on an empty board: +25 for the waste, −25 for the column.
  const kingToEmpty = emptyState({ waste: [card('S', 13)] });
  assert.equal(scoreOf(kingToEmpty, { from: { type: 'waste' }, to: { type: 'tableau', index: 0 } }), 0);

  // A build that reveals nothing and frees nothing is a step backwards: −10.
  const aimless = emptyState({ tableau: [[card('S', 7), card('H', 6)], [card('C', 7)], [], [], [], [], []] });
  assert.equal(scoreOf(aimless, { from: { type: 'tableau', index: 0, cardIndex: 1 }, to: { type: 'tableau', index: 1 } }), -10);
});

test('hint: a waste king is not worth spending an empty column on', () => {
  const s = emptyState({ waste: [card('S', 13)], tableau: [[card('D', 9)], [card('C', 4)], [], [], [], [], []] });
  // The king can only go to the empty column, which nets nothing, so drawing is the honest advice.
  assert.ok(canMove(s, { type: 'waste' }, { type: 'tableau', index: 2 }));
  assert.deepEqual(hintOf(s), { kind: 'draw' });
});

test('hint: when nothing is worth doing, the advice is to draw', () => {
  const s = emptyState({
    tableau: [[card('S', 7), card('H', 6)], [card('C', 7)], [], [], [], [], []],
    stock: [card('D', 9, false)],
  });
  const moves = movesOf(s);
  assert.ok(moves.length > 0); // a legal shuffling move exists; this is not a "no moves" position
  assert.ok(moves.every((m) => scoreMove(s, m) <= 0));
  assert.deepEqual(hintOf(s), { kind: 'draw' });
});

test('hint: nothing to move and nothing to draw gives no hint', () => {
  const s = emptyState({ tableau: [[card('S', 5)], [card('D', 9)], [], [], [], [], []] });
  assert.deepEqual(movesOf(s), []);
  assert.deepEqual(hintOf(s), { kind: 'none' });
});

test('hint: draw 3 only ever offers the top of the waste fan', () => {
  const s = emptyState({
    drawCount: 3,
    waste: [card('S', 1), card('D', 5), card('H', 9)],
    tableau: [[card('D', 3)], [card('C', 10)], [], [], [], [], []],
    stock: [card('H', 13, false)],
  });
  // The ace buried under the fan would go straight home, but it is not the card a player can pick up.
  const fromWaste = movesOf(s).filter((m) => m.from.type === 'waste');
  assert.ok(fromWaste.length > 0);
  assert.ok(fromWaste.every((m) => m.cardIds.join() === 'H9'));
  const hint = hintOf(s);
  assert.deepEqual(hint.from, { type: 'waste' });
  assert.deepEqual(hint.to, { type: 'tableau', index: 1 });
  assert.deepEqual(hint.cardIds, ['H9']);
  assert.equal(hint.because, 'waste');
  playable(s, hint);
});

test('hint: the same position always gets the same advice', () => {
  // Two flips of equal value, so only the tie-break can decide between them.
  const s = emptyState({
    tableau: [
      [card('D', 4, false), card('S', 9)],
      [card('D', 10)],
      [card('C', 3, false), card('H', 7)],
      [card('S', 8)],
      [], [], [],
    ],
  });
  const first = hintOf(s);
  const second = hintOf(structuredClone(s));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.because, 'reveal');
  assert.deepEqual(first.from, { type: 'tableau', index: 0, cardIndex: 1 });
  playable(s, first);
});

// --- Seeded stress: the advice must stay legal and honest on messy, mid-game positions ---
// A small deterministic PRNG keeps the whole walk reproducible without adding a dependency.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Everything the rules allow, including taking a card back off a foundation. The hint engine
// deliberately never suggests those, so the walk has to reach them: otherwise it never visits a
// position where only a foundation move is left, which is exactly where the engine has to answer
// "none" honestly instead of inventing advice.
function allLegalMoves(state) {
  const froms = [];
  if (state.waste.length) froms.push({ type: 'waste' });
  for (let i = 0; i < 4; i++) if (state.foundations[i].length) froms.push({ type: 'foundation', index: i });
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < state.tableau[i].length; j++) {
      const loc = { type: 'tableau', index: i, cardIndex: j };
      if (cardsAt(state, loc).length) froms.push(loc);
    }
  }
  const moves = [];
  for (const from of froms) {
    for (let i = 0; i < 4; i++) if (canMove(state, from, { type: 'foundation', index: i })) moves.push({ from, to: { type: 'foundation', index: i } });
    for (let i = 0; i < 7; i++) if (canMove(state, from, { type: 'tableau', index: i })) moves.push({ from, to: { type: 'tableau', index: i } });
  }
  return moves;
}

const STRESS_SEED = 20261026;
const STRESS_DEALS = 200;
const STRESS_TURNS = 20;

test('hint: advice stays legal and honest over seeded deals with random play', () => {
  for (let deal = 0; deal < STRESS_DEALS; deal++) {
    const rng = lcg(STRESS_SEED + deal);
    const state = newGame({ drawCount: deal % 2 ? 3 : 1, rng });
    for (let turn = 0; turn < STRESS_TURNS; turn++) {
      const where = `deal ${deal} turn ${turn}`;
      const before = structuredClone(state);
      const hint = findHint(state);
      assert.deepEqual(state, before, `${where}: findHint mutated the position`);

      if (hint.kind === 'move') {
        assert.deepEqual(cardsAt(state, hint.from).map((c) => c.id), hint.cardIds, `${where}: cardIds did not match the source`);
        const probe = structuredClone(state);
        assert.equal(moveCards(probe, hint.from, hint.to), true, `${where}: suggested move was rejected by the rules`);
      } else if (hint.kind === 'draw') {
        assert.ok(state.stock.length > 0 || state.waste.length > 0, `${where}: draw with nothing left to draw`);
        // The floor: a draw is only honest when nothing on the board scores above zero.
        assert.ok(
          enumerateMoves(state).every((m) => scoreMove(state, m) <= 0),
          `${where}: draw despite a move worth making`,
        );
      } else {
        assert.equal(hint.kind, 'none', `${where}: unexpected hint kind ${hint.kind}`);
        // "Nothing legal" means nothing the engine would ever suggest; foundation moves are excluded by design.
        assert.equal(enumerateMoves(state).length, 0, `${where}: none despite a legal move`);
        assert.equal(state.stock.length + state.waste.length, 0, `${where}: none with cards still to draw`);
      }

      const moves = allLegalMoves(state);
      const drawable = state.stock.length > 0 || state.waste.length > 0;
      if (moves.length && (rng() < 0.75 || !drawable)) {
        const move = moves[Math.floor(rng() * moves.length)];
        moveCards(state, move.from, move.to);
      } else if (drawable) {
        drawFromStock(state);
      } else {
        break;
      }
    }
  }
});
