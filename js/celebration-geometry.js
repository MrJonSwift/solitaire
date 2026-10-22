// Pure geometry for the celebration canvas. The canvas box and the safe-area insets are
// measured at the call site (iOS toolbars and notches make window.innerWidth/innerHeight
// unreliable) and the renderer obeys the result. No DOM here, so Node can prove the floor.
export function computeCelebrationGeometry({ rect = {}, insets = {}, dpr = 1, cardWidth = 0, cardHeight = 0 } = {}) {
  const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
  const box = rect || {};
  const safe = insets || {};
  const requestedDpr = finite(dpr, 1);
  const ratio = requestedDpr > 0 ? requestedDpr : 1;
  const width = Math.max(0, finite(box.width));  const height = Math.max(0, finite(box.height));
  // Only the bottom inset moves the floor. Top/right/left are accepted because the call
  // site passes the full safe-area box, but the stage itself stays full-bleed.
  const bottom = Math.max(0, finite(safe.bottom));
  const cw = Math.max(0, finite(cardWidth));
  const ch = Math.max(0, finite(cardHeight));

  // floorY is the top edge of a card at rest, in canvas CSS pixels. Keeping the card's
  // bottom above the home indicator is the whole point: no resting card may be sliced.
  const floorY = Math.max(0, height - bottom - ch);

  return {
    width,
    height,
    dpr: ratio,
    pixelWidth: Math.round(width * ratio),
    pixelHeight: Math.round(height * ratio),
    left: finite(box.left),
    top: finite(box.top),
    floorY,
    cardWidth: cw,
    cardHeight: ch,
  };
}
