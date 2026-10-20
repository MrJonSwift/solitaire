// Klondike rules. Pure logic with no DOM access, so it runs in the browser and under `node --test`.
// State is a plain JSON-serialisable object; functions mutate it in place and return true/false.

export const SUITS = ['S', 'H', 'D', 'C'];
// U+FE0E forces text (not emoji) rendering on iOS so the symbols take the CSS colour.
export const SUIT_SYMBOLS = { S: '\u2660\uFE0E', H: '\u2665\uFE0E', D: '\u2666\uFE0E', C: '\u2663\uFE0E' };
const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const STATE_VERSION = 1;

export const rankLabel = (rank) => RANK_LABELS[rank];
export const isRed = (suit) => suit === 'H' || suit === 'D';
const top = (pile) => pile[pile.length - 1];

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: suit + rank, suit, rank, faceUp: false });
  }
  return deck;
}

// Small seeded RNG (mulberry32) so tests can produce repeatable deals.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newGame({ drawCount = 1, rng = Math.random } = {}) {
  const deck = createDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau = [];
  for (let col = 0; col < 7; col++) {
    const pile = deck.splice(0, col + 1);
    top(pile).faceUp = true;
    tableau.push(pile);
  }
  return {
    version: STATE_VERSION,
    drawCount: drawCount === 3 ? 3 : 1,
    stock: deck, // top of every pile is the LAST element
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    won: false,
    autoPromptDismissed: false,
  };
}

// Tap on the stock: draw 1 or 3 cards, or recycle the waste when the stock is empty.
export function drawFromStock(state) {
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return false;
    state.stock = state.waste.reverse();
    state.stock.forEach((c) => { c.faceUp = false; });
    state.waste = [];
  } else {
    const n = Math.min(state.drawCount, state.stock.length);
    for (let i = 0; i < n; i++) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
    }
  }
  state.moves++;
  return true;
}

function pileOf(state, loc) {
  switch (loc.type) {
    case 'stock': return state.stock;
    case 'waste': return state.waste;
    case 'foundation': return state.foundations[loc.index];
    case 'tableau': return state.tableau[loc.index];
    default: return null;
  }
}

function isMovableRun(run) {
  if (!run.length) return false;
  for (let i = 0; i < run.length; i++) {
    if (!run[i].faceUp) return false;
    if (i > 0 && (run[i].rank !== run[i - 1].rank - 1 || isRed(run[i].suit) === isRed(run[i - 1].suit))) return false;
  }
  return true;
}

// Cards that would be picked up from a location, or [] if nothing there can be moved.
// loc: { type: 'waste' } | { type: 'foundation', index } | { type: 'tableau', index, cardIndex }
export function cardsAt(state, loc) {
  if (loc.type === 'waste' || loc.type === 'foundation') {
    const t = top(pileOf(state, loc));
    return t ? [t] : [];
  }
  if (loc.type === 'tableau') {
    const run = state.tableau[loc.index].slice(loc.cardIndex);
    return isMovableRun(run) ? run : [];
  }
  return [];
}

export function canPlaceOnTableau(cards, pile) {
  const first = cards[0];
  const t = top(pile);
  if (!t) return first.rank === 13;
  return t.faceUp && t.rank === first.rank + 1 && isRed(t.suit) !== isRed(first.suit);
}

export function canPlaceOnFoundation(cards, foundation) {
  if (cards.length !== 1) return false;
  const card = cards[0];
  const t = top(foundation);
  if (!t) return card.rank === 1;
  return t.suit === card.suit && t.rank === card.rank - 1;
}

export function canMove(state, from, to) {
  const cards = cardsAt(state, from);
  if (!cards.length) return false;
  if (from.type === to.type && from.index === to.index) return false;
  if (to.type === 'tableau') return canPlaceOnTableau(cards, state.tableau[to.index]);
  if (to.type === 'foundation') return canPlaceOnFoundation(cards, state.foundations[to.index]);
  return false;
}

function flipTableauTops(state) {
  for (const pile of state.tableau) {
    const t = top(pile);
    if (t && !t.faceUp) t.faceUp = true;
  }
}

export function moveCards(state, from, to) {
  if (!canMove(state, from, to)) return false;
  const count = cardsAt(state, from).length;
  const src = pileOf(state, from);
  const moved = src.splice(src.length - count, count);
  pileOf(state, to).push(...moved);
  flipTableauTops(state);
  state.moves++;
  state.won = isWon(state);
  return true;
}

// Which foundation (0-3) this card can go on right now, or -1.
export function foundationIndexFor(state, card) {
  let empty = -1;
  for (let i = 0; i < 4; i++) {
    const t = top(state.foundations[i]);
    if (t) {
      if (t.suit === card.suit) return t.rank === card.rank - 1 ? i : -1;
    } else if (empty < 0) {
      empty = i;
    }
  }
  return card.rank === 1 ? empty : -1;
}

// Single-tap behaviour: send the top card at `from` to a foundation if legal.
export function moveToFoundation(state, from) {
  const cards = cardsAt(state, from);
  if (cards.length !== 1) return false;
  if (from.type === 'tableau' && from.cardIndex !== state.tableau[from.index].length - 1) return false;
  const index = foundationIndexFor(state, cards[0]);
  if (index < 0) return false;
  return moveCards(state, from, { type: 'foundation', index });
}

export const allTableauFaceUp = (state) => state.tableau.every((pile) => pile.every((c) => c.faceUp));
export const isWon = (state) => state.foundations.reduce((n, f) => n + f.length, 0) === 52;

// One auto-complete step: moves the lowest-ranked card that fits a foundation, taken from a
// tableau top or from anywhere in the stock/waste. Once every tableau card is face up, the lowest
// card still missing is always a tableau top or in the stock/waste, so this always finishes.
// Returns the moved card id, or null when nothing can move.
export function autoCompleteStep(state) {
  let best = null;
  const consider = (card, pile) => {
    const f = foundationIndexFor(state, card);
    if (f >= 0 && (!best || card.rank < best.card.rank)) best = { card, pile, f };
  };
  for (const pile of state.tableau) {
    const t = top(pile);
    if (t && t.faceUp) consider(t, pile);
  }
  for (const c of state.waste) consider(c, state.waste);
  for (const c of state.stock) consider(c, state.stock);
  if (!best) return null;
  best.pile.splice(best.pile.indexOf(best.card), 1);
  best.card.faceUp = true;
  state.foundations[best.f].push(best.card);
  flipTableauTops(state);
  state.moves++;
  state.won = isWon(state);
  return best.card.id;
}

// ---------- Undo ----------
// Undo snapshots use a compact text form (~300 bytes instead of ~3 KB of JSON), so a long history
// fits comfortably in localStorage. Cards are written like "S13"; a lowercase suit means face down.
export const UNDO_LIMIT = 1000;
const encodePile = (pile) => pile.map((c) => (c.faceUp ? c.suit : c.suit.toLowerCase()) + c.rank).join(',');

export function encodeState(s) {
  const piles = [s.stock, s.waste, ...s.foundations, ...s.tableau].map(encodePile).join('|');
  return [s.drawCount, s.moves, s.won ? 1 : 0, s.autoPromptDismissed ? 1 : 0, piles].join(';');
}

export function decodeState(text) {
  try {
    const [drawCount, moves, won, dismissed, piles] = String(text).split(';');
    const lists = piles.split('|').map((p) => (p ? p.split(',').map((code) => {
      const suit = code[0].toUpperCase();
      const rank = Number(code.slice(1));
      return { id: suit + rank, suit, rank, faceUp: code[0] === suit };
    }) : []));
    if (lists.length !== 13) return null;
    const s = {
      version: STATE_VERSION,
      drawCount: Number(drawCount),
      stock: lists[0],
      waste: lists[1],
      foundations: lists.slice(2, 6),
      tableau: lists.slice(6, 13),
      moves: Number(moves),
      won: won === '1',
      autoPromptDismissed: dismissed === '1',
    };
    return isValidState(s) ? s : null;
  } catch {
    return null;
  }
}

// Record the position *before* a move so it can be restored later.
export function pushUndo(history, snapshot) {
  history.push(snapshot);
  if (history.length > UNDO_LIMIT) history.splice(0, history.length - UNDO_LIMIT);
}

// Returns the previous state, or null when there is nothing (valid) to go back to.
export function popUndo(history) {
  while (history.length) {
    const s = decodeState(history.pop());
    if (s) return s;
  }
  return null;
}

// Guards against corrupt or outdated saved data before restoring it.
export function isValidState(s) {
  try {
    if (!s || s.version !== STATE_VERSION || (s.drawCount !== 1 && s.drawCount !== 3)) return false;
    if (!Array.isArray(s.stock) || !Array.isArray(s.waste)) return false;
    if (!Array.isArray(s.foundations) || s.foundations.length !== 4) return false;
    if (!Array.isArray(s.tableau) || s.tableau.length !== 7) return false;
    const all = [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flat()];
    if (all.length !== 52 || new Set(all.map((c) => c.id)).size !== 52) return false;
    return all.every((c) => SUITS.includes(c.suit) && c.rank >= 1 && c.rank <= 13 &&
      c.id === c.suit + c.rank && typeof c.faceUp === 'boolean');
  } catch {
    return false;
  }
}
