// Which celebration plays next. Pure and tiny on purpose: it is the part of the rotation
// that can be proved in Node, and it is where a stale stored value can only ever cost the
// player the order of the animations, never the win.
//
// The stored number is the index of the celebration that plays *next*, not the one that
// played last, so a reload resumes the rotation where it left off instead of repeating it.

// The index to play now: the stored one if it still names a celebration, otherwise the
// first. A removed variant, a hand-edited value or a first-ever win all land on zero.
export function resolveIndex(stored, count) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  const index = Number(stored);
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

// The index to store for the following win: one on, wrapping. A single celebration therefore
// always returns 0 and always plays; a nonsensical list returns 0 rather than throwing.
export function nextVariant(index, count) {
  const current = Number(index);
  if (!Number.isInteger(count) || count <= 0) return 0;
  if (!Number.isInteger(current) || current < 0 || current >= count) return 0;
  return (current + 1) % count;
}
