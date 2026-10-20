import {
  newGame, drawFromStock, cardsAt, canMove, moveCards, moveToFoundation, allTableauFaceUp,
  autoCompleteStep, isValidState, isRed, rankLabel, SUIT_SYMBOLS, createDeck,
  encodeState, pushUndo, popUndo,
} from './game.js';
import { startCelebration, stopCelebration } from './celebrate.js';

const STATE_KEY = 'solitaire.game';
const SETTINGS_KEY = 'solitaire.settings';
const DRAG_THRESHOLD = 8; // px of movement before a press counts as a drag instead of a tap
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const board = document.getElementById('board');
const toolbar = document.getElementById('toolbar');
const btnNew = document.getElementById('btn-new');
const btnUndo = document.getElementById('btn-undo');
const btnDraw = document.getElementById('btn-draw');
const btnHand = document.getElementById('btn-hand');
const btnAuto = document.getElementById('btn-auto');
const canvas = document.getElementById('celebration');
const modal = document.getElementById('modal');

// ---------- Storage ----------
function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/blocked */ }
}
function loadSettings() {
  const s = loadJSON(SETTINGS_KEY) || {};
  return { hand: s.hand === 'left' ? 'left' : 'right', drawCount: s.drawCount === 3 ? 3 : 1 };
}
const saveSettings = () => saveJSON(SETTINGS_KEY, settings);
// The undo history is saved in the same entry as the game so the two can never get out of step.
const saveGame = () => saveJSON(STATE_KEY, { ...state, undo: history });

let settings = loadSettings();
let history = []; // undo snapshots (encodeState strings), oldest first
let state = (() => {
  const s = loadJSON(STATE_KEY);
  if (s && Array.isArray(s.undo)) history = s.undo.filter((x) => typeof x === 'string');
  if (s) delete s.undo;
  if (isValidState(s)) return s;
  history = [];
  return newGame({ drawCount: settings.drawCount });
})();
let layout = null;
let current = { pos: new Map(), locs: new Map() };
let drag = null;
let busy = false; // true while auto-complete is animating

// ---------- DOM setup ----------
function makeSlot(cls, label = '') {
  const el = document.createElement('div');
  el.className = 'slot ' + cls;
  el.textContent = label;
  board.appendChild(el);
  return el;
}
const slots = {
  stock: makeSlot('stock'),
  waste: makeSlot('waste'),
  foundations: [0, 1, 2, 3].map(() => makeSlot('foundation', 'A')),
  tableau: [0, 1, 2, 3, 4, 5, 6].map(() => makeSlot('tableau', 'K')),
};

const cardEls = new Map();
for (const c of createDeck()) {
  const el = document.createElement('div');
  el.className = 'card' + (isRed(c.suit) ? ' red' : '');
  el.dataset.id = c.id;
  const sym = SUIT_SYMBOLS[c.suit];
  el.innerHTML = `<div class="inner"><div class="face"><div class="corner"><span class="rank${c.rank === 10 ? ' ten' : ''}">${rankLabel(c.rank)}</span>` +
    `<span class="suit">${sym}</span></div><div class="pip">${sym}</div></div><div class="back"></div></div>`;
  board.appendChild(el);
  cardEls.set(c.id, el);
}

// ---------- Layout ----------
// Card width comes from the board width so 7 columns always fit (iPhone portrait is ~375-430px).
function computeLayout() {
  const W = board.clientWidth;
  const H = board.clientHeight;
  const phone = W < 500; // squeeze spacing on phones so cards get every spare pixel
  const pad = phone ? 3 : Math.round(W * 0.012);
  const gap = phone ? 3 : Math.round(W * 0.01);
  let cw = Math.floor((W - pad * 2 - gap * 6) / 7);
  cw = Math.max(20, Math.min(cw, Math.floor(H / 5.2 / 1.4), 130));
  const ch = Math.round(cw * 1.4);
  const left = Math.round((W - (cw * 7 + gap * 6)) / 2);
  const colX = (i) => left + i * (cw + gap);
  const tabGap = Math.max(gap * 2, Math.round(ch * 0.16));
  const fdOff = Math.max(4, Math.round(ch * 0.11));
  const fuOff = Math.round(ch * 0.34); // keep in step with the .corner size in styles.css
  // Phones held upright: start the cards about a quarter of the way down so they're within thumb
  // reach. The drop is capped so a long column (6 face-down + 12 face-up) still fits unsquashed.
  let drop = 0;
  if (phone && H > W) {
    const needed = pad * 2 + ch + tabGap + 6 * fdOff + 12 * fuOff + ch;
    drop = Math.max(0, Math.min(Math.round(H * 0.25), H - needed));
  }
  const topY = pad + drop;
  const tabY = topY + ch + tabGap;
  const lefty = settings.hand === 'left';
  // Right-handed: foundations on the left, stock far right. Left-handed mirrors that.
  return {
    cw, ch, gap,
    stock: { x: colX(lefty ? 0 : 6), y: topY },
    waste: { x: colX(lefty ? 1 : 5), y: topY },
    fanDir: lefty ? 1 : -1,
    fan: Math.round(cw * 0.32),
    foundations: [0, 1, 2, 3].map((i) => ({ x: colX(lefty ? 3 + i : i), y: topY })),
    tableau: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: colX(i), y: tabY })),
    tabY,
    tabAvail: H - tabY - pad,
    fdOff,
    fuOff,
  };
}

// Squash a column's fan when it would run off the bottom of the screen.
function tableauOffsets(pile) {
  let fd = 0;
  let fu = 0;
  for (let i = 0; i < pile.length - 1; i++) pile[i].faceUp ? fu++ : fd++;
  const need = fd * layout.fdOff + fu * layout.fuOff;
  const room = Math.max(0, layout.tabAvail - layout.ch);
  const scale = need > room ? room / need : 1;
  return { fd: layout.fdOff * scale, fu: layout.fuOff * scale };
}

function computePositions() {
  const L = layout;
  const pos = new Map();
  const locs = new Map();
  const put = (c, x, y, z, loc) => { pos.set(c.id, { x: Math.round(x), y: Math.round(y), z, up: c.faceUp }); locs.set(c.id, loc); };

  state.stock.forEach((c, i) => put(c, L.stock.x, L.stock.y, i + 1, { type: 'stock' }));
  const fanCount = state.drawCount === 3 ? Math.min(3, state.waste.length) : 1;
  const firstFan = state.waste.length - fanCount;
  state.waste.forEach((c, i) => put(c, L.waste.x + Math.max(0, i - firstFan) * L.fan * L.fanDir, L.waste.y, i + 1, { type: 'waste' }));
  state.foundations.forEach((f, fi) => f.forEach((c, i) =>
    put(c, L.foundations[fi].x, L.foundations[fi].y, i + 1, { type: 'foundation', index: fi })));
  state.tableau.forEach((pile, ti) => {
    const off = tableauOffsets(pile);
    let y = L.tabY;
    pile.forEach((c, i) => {
      put(c, L.tableau[ti].x, y, i + 1, { type: 'tableau', index: ti, cardIndex: i });
      y += c.faceUp ? off.fu : off.fd;
    });
  });
  return { pos, locs };
}

function setXY(el, x, y) {
  el._x = x;
  el._y = y;
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function placeSlot(el, p) {
  el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
}

// ---------- Rendering ----------
function render({ animate = true } = {}) {
  layout = computeLayout();
  board.style.setProperty('--cw', layout.cw + 'px');
  board.style.setProperty('--ch', layout.ch + 'px');
  if (!animate) board.classList.add('no-anim');

  placeSlot(slots.stock, layout.stock);
  placeSlot(slots.waste, layout.waste);
  slots.stock.classList.toggle('recycle', state.stock.length === 0 && state.waste.length > 0);
  layout.foundations.forEach((p, i) => placeSlot(slots.foundations[i], p));
  layout.tableau.forEach((p, i) => placeSlot(slots.tableau[i], p));

  current = computePositions();
  for (const [id, p] of current.pos) {
    const el = cardEls.get(id);
    el.classList.toggle('up', p.up);
    const moving = animate && (el._x !== p.x || el._y !== p.y);
    clearTimeout(el._zTimer);
    if (moving) {
      // Lift moving cards above everything until they land.
      el.style.zIndex = 500 + p.z;
      el._zTimer = setTimeout(() => { el.style.zIndex = p.z; }, 260);
    } else {
      el.style.zIndex = p.z;
    }
    setXY(el, p.x, p.y);
  }

  if (!animate) {
    void board.offsetWidth; // apply positions before transitions are re-enabled
    board.classList.remove('no-anim');
  }
  updateToolbar();
}

function updateToolbar() {
  btnDraw.querySelector('.num').textContent = settings.drawCount;
  btnDraw.setAttribute('aria-label', `Draw ${settings.drawCount} (tap to change)`);
  const lefty = settings.hand === 'left';
  btnHand.classList.toggle('left', lefty);
  btnHand.querySelector('.badge').textContent = lefty ? 'L' : 'R';
  btnHand.setAttribute('aria-label', `${lefty ? 'Left' : 'Right'}-handed layout (tap to switch)`);
  toolbar.classList.toggle('lefty', lefty); // mirror the button order so Undo stays by your thumb
  btnAuto.hidden = state.won || !allTableauFaceUp(state);
  [btnNew, btnDraw, btnHand, btnAuto].forEach((b) => { b.disabled = busy; });
  btnUndo.disabled = busy || state.won || history.length === 0;
}

// ---------- Dialogs ----------
function showModal({ title, message = '', buttons, variant = '' }) {
  modal.className = 'modal' + (variant ? ' ' + variant : '');
  modal.querySelector('.modal-title').textContent = title;
  modal.querySelector('.modal-message').textContent = message;
  const row = modal.querySelector('.modal-buttons');
  row.replaceChildren();
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.label;
    if (b.primary) btn.classList.add('primary');
    btn.addEventListener('click', () => { hideModal(); if (b.onClick) b.onClick(); });
    row.appendChild(btn);
  }
  modal.hidden = false;
}
const hideModal = () => { modal.hidden = true; };

function confirmModal(title, message, okLabel, onOk) {
  showModal({ title, message, buttons: [{ label: 'Cancel' }, { label: okLabel, primary: true, onClick: onOk }] });
}

// ---------- Game flow ----------
// Run a state change; if it succeeds, remember the position before it so it can be undone.
function act(change) {
  const before = encodeState(state);
  if (!change()) return false;
  pushUndo(history, before);
  afterMove();
  return true;
}

function undo() {
  if (busy || drag || state.won || !history.length) return;
  const prev = popUndo(history);
  if (prev) state = prev;
  saveGame();
  render(); // no auto-complete prompt here; the Finish button is still available
}

function afterMove() {
  saveGame();
  render();
  if (state.won) { onWin(); return; }
  maybePromptAutoComplete();
}

function maybePromptAutoComplete() {
  if (busy || state.won || state.autoPromptDismissed || !allTableauFaceUp(state) || !modal.hidden) return;
  showModal({
    title: 'All cards are face up',
    message: 'Finish the game automatically?',
    buttons: [
      { label: 'Not now', onClick: () => { state.autoPromptDismissed = true; saveGame(); } },
      { label: 'Finish', primary: true, onClick: runAutoComplete },
    ],
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runAutoComplete() {
  if (busy || state.won) return;
  busy = true;
  const before = encodeState(state);
  if (autoCompleteStep(state)) {
    pushUndo(history, before); // the whole auto-finish is one undo step
    updateToolbar();
    do {
      saveGame();
      render();
      await sleep(reducedMotion ? 20 : 110);
    } while (!state.won && autoCompleteStep(state));
  }
  busy = false;
  saveGame();
  render();
  if (state.won) onWin();
}

async function onWin() {
  await sleep(400);
  if (!state.won) return;
  if (!reducedMotion) {
    const rect = board.getBoundingClientRect();
    startCelebration(canvas, {
      cw: layout.cw,
      ch: layout.ch,
      piles: state.foundations.map((f, i) => ({
        x: rect.left + layout.foundations[i].x,
        y: rect.top + layout.foundations[i].y,
        cards: f.map((c) => ({ rank: c.rank, suit: c.suit })),
      })),
    });
  }
  showModal({
    title: 'You won!',
    message: `Finished in ${state.moves} moves.`,
    variant: 'win',
    buttons: [{ label: 'New deal', primary: true, onClick: dealNew }],
  });
}

function dealNew() {
  stopCelebration();
  hideModal();
  state = newGame({ drawCount: settings.drawCount });
  history = [];
  saveGame();
  // Gather every card on the stock pile, then let render() fly them out to their places.
  layout = computeLayout();
  board.classList.add('no-anim');
  for (const el of cardEls.values()) { el.classList.remove('up'); setXY(el, layout.stock.x, layout.stock.y); }
  void board.offsetWidth;
  board.classList.remove('no-anim');
  render();
}

function requestNewDeal() {
  if (busy) return;
  if (state.moves > 0 && !state.won) confirmModal('Start a new deal?', 'Your current game will be lost.', 'New deal', dealNew);
  else dealNew();
}

function toggleDraw() {
  if (busy) return;
  const next = settings.drawCount === 1 ? 3 : 1;
  const apply = () => { settings.drawCount = next; saveSettings(); };
  if (state.moves === 0 && !state.won) {
    apply();
    state.drawCount = next;
    saveGame();
    render();
  } else if (state.won) {
    apply();
    dealNew();
  } else {
    confirmModal(`Switch to Draw ${next}?`, 'This starts a new deal. Your current game will be lost.', 'New deal', () => { apply(); dealNew(); });
  }
}

function toggleHand() {
  if (busy) return;
  settings.hand = settings.hand === 'left' ? 'right' : 'left';
  saveSettings();
  render();
}

// ---------- Touch / mouse input ----------
function shake(els) {
  for (const el of els) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  }
}

function onPointerDown(e) {
  if (busy || drag || !e.isPrimary || !modal.hidden) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const cardEl = e.target.closest('.card');
  let loc = cardEl ? current.locs.get(cardEl.dataset.id) : null;
  if (!loc && e.target.closest('.slot') === slots.stock) loc = { type: 'stock' };
  if (!loc) return;

  const base = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, dx: 0, dy: 0 };
  if (loc.type === 'stock') {
    drag = { ...base, stock: true };
  } else {
    const cards = cardsAt(state, loc);
    if (!cards.length) return; // face-down card
    drag = {
      ...base,
      from: loc,
      cards,
      els: cards.map((c) => cardEls.get(c.id)),
      origins: cards.map((c) => current.pos.get(c.id)),
    };
  }
  try { board.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    if (drag.stock) return;
    drag.els.forEach((el, i) => { clearTimeout(el._zTimer); el.classList.add('dragging'); el.style.zIndex = 1000 + i; });
  }
  if (drag.stock) return;
  drag.dx = dx;
  drag.dy = dy;
  drag.els.forEach((el, i) => setXY(el, drag.origins[i].x + dx, drag.origins[i].y + dy));
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  if (d.stock) {
    if (!d.moved) act(() => drawFromStock(state));
    return;
  }
  d.els.forEach((el) => el.classList.remove('dragging'));
  if (!d.moved) {
    // Tap: send to a foundation if legal.
    if (d.from.type !== 'foundation' && act(() => moveToFoundation(state, d.from))) return;
    shake(d.els);
    render();
    return;
  }
  const target = findDropTarget(d);
  if (!target || !act(() => moveCards(state, d.from, target))) render(); // snap back
}

function onPointerCancel(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (drag.els) drag.els.forEach((el) => el.classList.remove('dragging'));
  drag = null;
  render();
}

function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// Pick the legal pile that the dragged card overlaps the most.
function findDropTarget(d) {
  const L = layout;
  const lead = d.origins[0];
  const r = { x: lead.x + d.dx, y: lead.y + d.dy, w: L.cw, h: L.ch };
  const candidates = [];
  state.tableau.forEach((pile, i) => {
    const t = pile[pile.length - 1];
    const bottom = (t ? current.pos.get(t.id).y : L.tabY) + L.ch;
    candidates.push({ loc: { type: 'tableau', index: i }, rect: { x: L.tableau[i].x, y: L.tabY, w: L.cw, h: bottom - L.tabY } });
  });
  L.foundations.forEach((p, i) => candidates.push({ loc: { type: 'foundation', index: i }, rect: { x: p.x, y: p.y, w: L.cw, h: L.ch } }));

  let best = null;
  let bestArea = 0;
  for (const c of candidates) {
    if (!canMove(state, d.from, c.loc)) continue;
    const area = overlapArea(r, c.rect);
    if (area > bestArea) { best = c.loc; bestArea = area; }
  }
  return best;
}

board.addEventListener('pointerdown', onPointerDown);
board.addEventListener('pointermove', onPointerMove);
board.addEventListener('pointerup', onPointerUp);
board.addEventListener('pointercancel', onPointerCancel);
board.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch-zoom
document.addEventListener('dblclick', (e) => e.preventDefault());

btnNew.addEventListener('click', requestNewDeal);
btnUndo.addEventListener('click', undo);
btnDraw.addEventListener('click', toggleDraw);
btnHand.addEventListener('click', toggleHand);
btnAuto.addEventListener('click', () => { if (!busy) runAutoComplete(); });

// iOS can kill a backgrounded home-screen app without warning, so save whenever we're hidden too.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });
window.addEventListener('pagehide', saveGame);

new ResizeObserver(() => { if (!drag) render({ animate: false }); }).observe(board);

// ---------- Start ----------
render({ animate: false });
if (state.won) onWin();
else maybePromptAutoComplete();

// Offline support. Skipped on localhost so development always loads fresh files.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // iOS often resumes the app instead of relaunching it, so also check for updates on resume.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
