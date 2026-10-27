// The hint's only words. The board is silent, so this one sentence is what a screen reader gets
// when the glow appears; it is kept pure so the wording can be checked in Node alongside the
// engine that chooses the move.

// Spoken card names, not the short rank labels on the faces: a screen reader should hear
// "seven of hearts", not "7 of hearts".
const RANK_NAMES = {
  1: 'ace', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six',
  7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king',
};
const SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

const rankName = (rank) => RANK_NAMES[rank] || '';
const cardName = (card) => `${rankName(card.rank)} of ${SUIT_NAMES[card.suit]}`;

function findCard(state, id) {
  for (const pile of [state.stock, state.waste, ...state.foundations, ...state.tableau]) {
    for (const card of pile) if (card.id === id) return card;
  }
  return null;
}

// Where the cards would land, as a phrase. An occupied pile is named by its top card, because
// that is the card the glow sits on. Foundations are deliberately absent: naming one needs the
// card's suit, and moveSentence's 'foundation' case is the single place allowed to say it, so a
// second wording here could only drift from it unseen.
function destinationPhrase(state, to) {
  if (to.type === 'tableau') {
    const pile = state.tableau[to.index] || [];
    const top = pile[pile.length - 1];
    return top ? `the ${cardName(top)}` : 'the empty column';
  }
  return 'a new pile';
}

function moveSentence(hint, state) {
  const card = findCard(state, hint.cardIds?.[0]);
  if (!card) return 'A card can move.';
  const name = cardName(card);
  const onto = destinationPhrase(state, hint.to);
  switch (hint.because) {
    // Four foundations share one name, so the suit says which one. The card's suit and the
    // foundation's suit are always the same once a foundation is seeded, and an empty foundation
    // takes whichever Ace reaches it first, so the pile index says nothing the words could use.
    case 'foundation': return `${name} to the ${SUIT_NAMES[card.suit]} foundation.`;
    case 'reveal': return `${name} onto ${onto}, revealing a card.`;
    // This token is a column being emptied by a move onto a pile that already has cards, so the
    // destination is named like any other build and the gain is spoken instead of the location.
    case 'empty-column': return `${name} onto ${onto}, emptying a column.`;
    case 'waste': return `${name} from the waste onto ${onto}.`;
    // 'build' is unreachable in the engine today, but saying nothing would be worse than
    // saying the plain move if a future scoring change ever lets it through.
    default: return `${name} onto ${onto}.`;
  }
}

export function hintSentence(hint, state) {
  if (!hint) return '';
  if (hint.kind === 'draw') return 'Draw from the stock.';
  if (hint.kind === 'none') return 'No move to suggest.';
  if (hint.kind !== 'move') return '';
  const sentence = moveSentence(hint, state);
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
