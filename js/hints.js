// What to do next. Reads the rules in game.js, ranks every legal move it can find, and offers the
// best one. It only looks: the position it is given is left exactly as it was, and the player still
// makes the move. Pure like game.js — no DOM, no timers, no randomness — so the advice can be
// judged in Node before it ever reaches a phone.

import { cardsAt, canMove } from './game.js';

// Additive weights, a starting point rather than a truth. Turning over a hidden card is the only
// gain that cannot be undone, so it outweighs tidy board-keeping; sending a card home is nearly
// always right for a beginner to see. Spending an empty column for nothing is the mistake this
// table exists to prevent, so it scores negative and only survives when the move buys a flip.
const FOUNDATION = 100;
const REVEAL = 80;
const EMPTIES_COLUMN = 35;
const WASTE_TO_TABLEAU = 25;
const LAND_ON_EMPTY = -25;
const AIMLESS_BUILD = -10;

const isTableau = (loc) => loc.type === 'tableau';

// A run that starts at the bottom of a column takes the whole column with it.
const clearsColumn = (from) => isTableau(from) && from.cardIndex === 0;

// The card the run was sitting on turns face up as the run leaves.
function reveals(state, from) {
  if (!isTableau(from)) return false;
  const buried = state.tableau[from.index]?.[from.cardIndex - 1];
  return Boolean(buried && !buried.faceUp);
}

// Every place a move could start. Foundations are deliberately absent: pulling a card back off one
// is legal, but it is never advice worth giving — it teaches a beginner the wrong instinct.
function sources(state) {
  const from = state.waste.length ? [{ type: 'waste' }] : [];
  state.tableau.forEach((pile, index) => {
    for (let cardIndex = 0; cardIndex < pile.length; cardIndex++) {
      const loc = { type: 'tableau', index, cardIndex };
      if (cardsAt(state, loc).length) from.push(loc);
    }
  });
  return from;
}

// Foundations first, then the columns, never the pile the cards came from. Which of these actually
// work is not decided here: canMove has the final say.
function destinations(state, from) {
  const to = [];
  for (let index = 0; index < state.foundations.length; index++) to.push({ type: 'foundation', index });
  state.tableau.forEach((pile, index) => {
    if (!(isTableau(from) && from.index === index)) to.push({ type: 'tableau', index });
  });
  return to;
}

export function enumerateMoves(state) {
  const moves = [];
  for (const from of sources(state)) {
    const cards = cardsAt(state, from);
    for (const to of destinations(state, from)) {
      // Carrying a whole column to an empty one leaves the same board in a different place. It
      // changes nothing, so the player would be tapping for no reason.
      if (clearsColumn(from) && isTableau(to) && !state.tableau[to.index].length) continue;
      if (!canMove(state, from, to)) continue;
      moves.push({ from, to, cardIds: cards.map((card) => card.id) });
    }
  }
  return moves;
}

export function scoreMove(state, move) {
  const { from, to } = move;
  let score = 0;
  if (to.type === 'foundation') score += FOUNDATION;
  if (reveals(state, from)) score += REVEAL;
  if (clearsColumn(from) && isTableau(to) && state.tableau[to.index].length) score += EMPTIES_COLUMN;
  if (from.type === 'waste' && isTableau(to)) score += WASTE_TO_TABLEAU;
  if (isTableau(to) && !state.tableau[to.index].length) score += LAND_ON_EMPTY;
  if (isTableau(from) && isTableau(to) && !reveals(state, from) && !clearsColumn(from)) score += AIMLESS_BUILD;
  return score;
}

// Why the move is worth showing, as a stable token. The words belong to the UI, not here.
function becauseOf(state, move) {
  const { from, to } = move;
  if (to.type === 'foundation') return 'foundation';
  if (reveals(state, from)) return 'reveal';
  if (clearsColumn(from) && isTableau(to) && state.tableau[to.index].length) return 'empty-column';
  if (from.type === 'waste') return 'waste';
  return 'build';
}

const destinationRank = (to) => (to.type === 'foundation' ? 0 : 1);
const sourceRank = (from) => (from.type === 'waste' ? 0 : 1);
const pileIndexOf = (from) => (isTableau(from) ? from.index : -1);
const cardIndexOf = (from) => (isTableau(from) ? from.cardIndex : -1);

// Pressing the button twice on one position must answer the same way both times, so ties are
// settled by where the move sits on the board: foundations before the tableau, the waste before
// the tableau, then left to right and top to bottom — the order the player's eye travels.
function compareRanked(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  return destinationRank(a.move.to) - destinationRank(b.move.to)
    || sourceRank(a.move.from) - sourceRank(b.move.from)
    || pileIndexOf(a.move.from) - pileIndexOf(b.move.from)
    || cardIndexOf(a.move.from) - cardIndexOf(b.move.from)
    || a.move.to.index - b.move.to.index;
}

// The advice, or an honest admission that there is none. Anything that scores nothing or worse is
// not worth a tap: the stock is a better suggestion than a move that only rearranges the board,
// and when that is gone too, saying so is better than inventing a tip.
export function findHint(state) {
  const best = enumerateMoves(state)
    .map((move) => ({ move, score: scoreMove(state, move) }))
    .sort(compareRanked)[0];

  if (!best || best.score <= 0) {
    const canDraw = state.stock.length > 0 || state.waste.length > 0;
    return canDraw ? { kind: 'draw' } : { kind: 'none' };
  }

  return {
    kind: 'move',
    from: best.move.from,
    to: best.move.to,
    cardIds: best.move.cardIds,
    score: best.score,
    because: becauseOf(state, best.move),
  };
}
