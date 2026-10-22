// SPIKE — throwaway. Scene, camera framing, controls, URL params, screenshot mode.
// One question: does a figure made of playing cards read as a woman dancing salsa
// at phone size? Everything here is in service of looking at that.
import * as THREE from './vendor/three.module.js';
import { createFigure } from './figure.js';
import { sample, sampleDegrees, LOOP, countAt } from './motion.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

function fail(msg) {
  const el = $('err');
  el.textContent = `${el.textContent ? `${el.textContent}\n` : ''}${msg}`;
}
window.addEventListener('error', (e) => fail(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => fail(`Error: ${e.reason}`));

// --- settings from the URL ------------------------------------------------
const STYLES = ['queen', 'shell', 'plume', 'ribbon'];
const cfg = {
  style: STYLES.includes(params.get('style')) ? params.get('style') : 'queen',
  cards: clamp(Math.round(num(params.get('cards'), 8)), 2, 16),
  head: params.get('head') !== '0',
  debug: params.get('debug') === '1',
  dist: params.has('dist') ? clamp(num(params.get('dist'), 2.9), 1.5, 9) : 0,
  t: params.has('t') ? ((num(params.get('t'), 0) % LOOP) + LOOP) % LOOP : null,
  ui: params.get('ui') !== '0',
};
if (!cfg.ui) document.documentElement.classList.add('nohud');

const FOV = 40;
const CAM_AZ = 0.16; // camera sits slightly to her left, so the figure is not dead flat
const CAM_EL = 0.05;
const TARGET = new THREE.Vector3(0, 1.02, 0);

// --- renderer -------------------------------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
} catch (err) {
  fail(`WebGL is not available in this browser: ${err.message}`);
}
if (!renderer) {
  // Nothing below can run; say so on the page instead of showing a blank screen.
  throw new Error('no WebGL context');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x0d3a2c, 1);
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

scene.add(new THREE.HemisphereLight(0xffffff, 0x1d4032, 1.5));
const key = new THREE.DirectionalLight(0xfff3e0, 1.9);
key.position.set(2.4, 4.2, 5.0);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fd8ff, 1.1);
rim.position.set(-3.5, 2.0, -3.5);
scene.add(rim);

// A soft contact shadow so the figure stands on something instead of floating.
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(1.5, 1.5),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.002;
scene.add(floor);

// --- figure ---------------------------------------------------------------
const figure = createFigure({ style: cfg.style, cards: cfg.cards, headCard: cfg.head, debug: cfg.debug });
scene.add(figure.group);

// --- camera framing -------------------------------------------------------
// Portrait phone (390 x 844) is the default target. The distance is solved from the
// figure's own silhouette, sampled over the whole loop, instead of from two guessed
// half-extents: the raised hand was being cropped by the guess. 87.5% of the viewport
// height is the target; if the width does not fit at that distance, the width wins.
const FIT_FILL = 0.875;

function placeCameraAt(target, d) {
  camera.position.set(
    target.x + Math.sin(CAM_AZ) * Math.cos(CAM_EL) * d,
    target.y + Math.sin(CAM_EL) * d,
    target.z + Math.cos(CAM_AZ) * Math.cos(CAM_EL) * d,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

let dist = cfg.dist || 3.0;
let distTouched = cfg.dist > 0;
const framing = { fill: 0, maxAbsX: 0, top: 0, bottom: 0 };

function fitFraming() {
  const points = [];
  const saved = time;
  for (let i = 0; i < 16; i++) {
    time = (i / 16) * LOOP;
    figure.apply(sample(time));
    figure.group.updateMatrixWorld(true);
    figure.updateCards();
    figure.faceCamera(camera);
    figure.extentPoints(points);
  }
  time = saved;

  const target = TARGET.clone();
  let d = 3.0;
  const v = new THREE.Vector3();
  const extent = () => {
    placeCameraAt(target, d);
    let lo = Infinity;
    let hi = -Infinity;
    let mx = 0;
    for (const p of points) {
      v.copy(p).project(camera);
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
      mx = Math.max(mx, Math.abs(v.x));
    }
    return { lo, hi, mx };
  };

  let e = extent();
  for (let iter = 0; iter < 12; iter++) {
    const fill = (e.hi - e.lo) / 2;
    const centre = (e.hi + e.lo) / 2;
    const worldPerNdc = Math.tan((FOV * Math.PI) / 360) * d;
    target.y += centre * worldPerNdc * 0.9;
    d *= fill / FIT_FILL;
    e = extent();
    if (Math.abs((e.hi - e.lo) / 2 - FIT_FILL) < 0.002 && Math.abs((e.hi + e.lo) / 2) < 0.006) break;
  }
  // A wide arm transient must not be cropped; if it would be, back off and say so.
  if (e.mx > 0.93) {
    d *= e.mx / 0.93;
    e = extent();
  }
  TARGET.y = target.y;
  dist = d;
  framing.fill = (e.hi - e.lo) / 2;
  framing.maxAbsX = e.mx;
  framing.top = e.hi;
  framing.bottom = e.lo;
  window.__framing = framing;
}

function placeCamera() {
  placeCameraAt(TARGET, dist);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!distTouched) fitFraming();
  placeCamera();
  $('dist').value = dist.toFixed(2);
  $('distv').textContent = dist.toFixed(2);
}

// --- state ----------------------------------------------------------------
let time = cfg.t ?? 0;
let paused = cfg.t !== null;
let scrubbing = false;
let ready = false;
let frameCount = 0;
let fps = 0;
let fpsWindow = performance.now();

const styleRadios = [...document.querySelectorAll('input[name=style]')];
function syncControls() {
  styleRadios.forEach((r) => { r.checked = r.value === cfg.style; });
  $('cards').value = cfg.cards;
  $('cardsv').textContent = cfg.cards;
  $('head').checked = cfg.head;
  $('debug').checked = cfg.debug;
  $('play').textContent = paused ? 'play' : 'pause';
  $('scrub').value = time.toFixed(2);
  $('timev').textContent = `${time.toFixed(2)}s`;
}

function syncURL() {
  const q = new URLSearchParams();
  q.set('style', cfg.style);
  q.set('cards', cfg.cards);
  q.set('head', cfg.head ? '1' : '0');
  q.set('dist', dist.toFixed(2));
  if (cfg.debug) q.set('debug', '1');
  if (!cfg.ui) q.set('ui', '0');
  if (paused) q.set('t', time.toFixed(2));
  history.replaceState(null, '', `?${q}`);
}

// --- controls -------------------------------------------------------------
styleRadios.forEach((r) => r.addEventListener('change', () => {
  if (!r.checked) return;
  cfg.style = r.value;
  figure.setStyle(cfg.style, cfg.cards, cfg.head);
  syncURL();
}));
$('cards').addEventListener('input', (e) => {
  cfg.cards = Number(e.target.value);
  $('cardsv').textContent = cfg.cards;
  figure.setStyle(cfg.style, cfg.cards, cfg.head);
  syncURL();
});
$('head').addEventListener('change', (e) => {
  cfg.head = e.target.checked;
  figure.setStyle(cfg.style, cfg.cards, cfg.head);
  syncURL();
});
$('debug').addEventListener('change', (e) => {
  cfg.debug = e.target.checked;
  figure.setDebug(cfg.debug);
  syncURL();
});
$('dist').addEventListener('input', (e) => {
  dist = Number(e.target.value);
  distTouched = true;
  $('distv').textContent = dist.toFixed(2);
  placeCamera();
  syncURL();
});
$('play').addEventListener('click', () => {
  paused = !paused;
  $('play').textContent = paused ? 'play' : 'pause';
  syncURL();
});
$('scrub').addEventListener('pointerdown', () => { scrubbing = true; });
$('scrub').addEventListener('pointerup', () => { scrubbing = false; });
$('scrub').addEventListener('input', (e) => {
  time = Number(e.target.value);
  paused = true;
  $('play').textContent = 'play';
  $('timev').textContent = `${time.toFixed(2)}s`;
  update();
});
window.addEventListener('resize', resize);

// --- frame loop -----------------------------------------------------------
let hudAt = 0;

function update() {
  const pose = sample(time);
  figure.apply(pose);
  figure.group.updateMatrixWorld(true);
  figure.updateCards();
  figure.faceCamera(camera);
  floor.position.x = pose.root[0] * 0.6;
  floor.position.z = pose.root[2] * 0.6;
  return pose;
}

function drawHUD(pose) {
  if (!scrubbing) $('scrub').value = time.toFixed(2);
  $('timev').textContent = `${time.toFixed(2)}s`;
  const now = performance.now();
  if (now - hudAt < 120) return;
  hudAt = now;
  const deg = sampleDegrees(time).joints;
  const info = renderer.info.render;
  $('state').innerHTML =
    `count <b>${countAt(time)}</b> · hips y <b>${deg.hips[1].toFixed(0)}°</b>` +
    ` · chest y <b>${deg.chest[1].toFixed(0)}°</b> · head y <b>${deg.head[1].toFixed(0)}°</b>` +
    ` · root z <b>${pose.root[2].toFixed(3)}</b><br>` +
    `fps <b>${fps.toFixed(0)}</b> · cards <b>${figure.stats.cards}</b>` +
    ` · draws <b>${info.calls}</b> · tris <b>${(info.triangles / 1000).toFixed(1)}k</b>` +
    ` · fill <b>${(framing.fill * 100).toFixed(0)}%</b> · w <b>${framing.maxAbsX.toFixed(2)}</b>` +
    `${paused ? ' · paused' : ''}${cfg.t !== null ? ' · screenshot mode' : ''}`;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused && !scrubbing) time = (time + dt) % LOOP;
  const pose = update();
  renderer.render(scene, camera);

  frameCount++;
  if (now - fpsWindow >= 500) {
    fps = (frameCount * 1000) / (now - fpsWindow);
    frameCount = 0;
    fpsWindow = now;
  }
  drawHUD(pose);
  if (!ready) {
    ready = true;
    window.__ready = true; // screenshot handshake: first frame is on screen
  }
  requestAnimationFrame(frame);
}

resize();
syncControls();
requestAnimationFrame(frame);
