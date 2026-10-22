// SPIKE — throwaway. Card art drawn in the app's own style (see js/celebrate.js
// makeSprite and styles.css .face/.back), rendered to canvases so Three can use
// them as textures. Same layout as the real game: rounded white card, rank top-left,
// suit top-right, one big suit centred at the bottom.
import * as THREE from './vendor/three.module.js';

const SUIT_SYMBOLS = { S: '\u2660\uFE0E', H: '\u2665\uFE0E', D: '\u2666\uFE0E', C: '\u2663\uFE0E' };
const RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rankLabel = (rank) => RANK_LABELS[rank] || String(rank);
const isRed = (suit) => suit === 'H' || suit === 'D';

// CSS pixels of the source art; textures are drawn at 2x for crisp edges on a phone.
export const CARD_W = 96;
export const CARD_H = 134;
const SCALE = 2;
const FONT = '-apple-system, Helvetica, Arial, sans-serif';

function roundedCard(g, cw, ch) {
  const r = cw * 0.09;
  g.beginPath();
  g.moveTo(r, 0.5);
  g.arcTo(cw - 0.5, 0.5, cw - 0.5, ch - 0.5, r);
  g.arcTo(cw - 0.5, ch - 0.5, 0.5, ch - 0.5, r);
  g.arcTo(0.5, ch - 0.5, 0.5, 0.5, r);
  g.arcTo(0.5, 0.5, cw - 0.5, 0.5, r);
  g.closePath();
}

function newCanvas() {
  const c = document.createElement('canvas');
  c.width = CARD_W * SCALE;
  c.height = CARD_H * SCALE;
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  return { c, g };
}

function faceCanvas(rank, suit) {
  const cw = CARD_W;
  const ch = CARD_H;
  const { c, g } = newCanvas();
  roundedCard(g, cw, ch);
  g.fillStyle = '#fff';
  g.fill();
  g.strokeStyle = '#9a9a9a'; // a readable edge: the cards have to read as separate cards
  g.lineWidth = 1.3;
  g.stroke();
  g.save();
  g.clip();
  g.fillStyle = isRed(suit) ? '#d1162c' : '#1b1b1b';
  const sym = SUIT_SYMBOLS[suit];
  g.textBaseline = 'top';
  g.font = `700 ${cw * 0.4}px ${FONT}`;
  g.textAlign = 'left';
  g.fillText(rankLabel(rank), cw * 0.06, cw * 0.05);
  g.textAlign = 'right';
  g.font = `700 ${cw * 0.45}px ${FONT}`;
  g.fillText(sym, cw * 0.94, cw * 0.03);
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.font = `${cw * 0.98}px ${FONT}`;
  g.fillText(sym, cw / 2, ch * 0.98);
  g.restore();
  return c;
}

function backCanvas() {
  // Warm ivory, not blue: the figure has to read from the white/red card faces, and a
  // saturated back turns every reversed card into a hole in the silhouette.
  const cw = CARD_W;
  const ch = CARD_H;
  const { c, g } = newCanvas();
  roundedCard(g, cw, ch);
  g.fillStyle = '#fff';
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = '#f6f1e6';
  g.fillRect(0, 0, cw, ch);
  // Faint pink diamond lattice: a rotated grid of hairlines.
  g.save();
  g.translate(cw / 2, ch / 2);
  g.rotate(Math.PI / 4);
  g.strokeStyle = 'rgba(206, 96, 112, 0.28)';
  g.lineWidth = 1;
  for (let x = -cw; x <= cw; x += 9) {
    g.beginPath(); g.moveTo(x, -ch); g.lineTo(x, ch); g.stroke();
  }
  for (let y = -ch; y <= ch; y += 9) {
    g.beginPath(); g.moveTo(-cw, y); g.lineTo(cw, y); g.stroke();
  }
  g.restore();
  g.restore();
  // Thin red double border, so a face-down card still looks like a card, not a blank.
  g.strokeStyle = '#c8102e';
  g.lineWidth = 1.4;
  roundedCard(g, cw, ch);
  g.stroke();
  for (const inset of [5, 8]) {
    const r = cw * 0.055;
    const x = inset;
    const y = inset;
    const w = cw - inset * 2;
    const h = ch - inset * 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.lineWidth = 1;
    g.stroke();
  }
  return c;
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The deck used by the figure. A card dancer only needs a handful of faces; keeping
// the count low keeps draw calls low on a phone.
export const DECK = [
  [12, 'H'], [13, 'S'], [1, 'D'], [11, 'C'], [7, 'H'], [10, 'S'],
  [3, 'D'], [9, 'C'], [5, 'H'], [2, 'S'], [8, 'D'], [6, 'C'], [4, 'S'],
];

export function makeCardTextures() {
  const faces = DECK.map(([rank, suit]) => toTexture(faceCanvas(rank, suit)));
  const back = toTexture(backCanvas());
  return { faces, back };
}
