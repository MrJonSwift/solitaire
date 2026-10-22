// The card dancer's renderer: one transparent WebGL layer over the board, one 4 s loop of
// the rig from dancer-figure.js, then a fade so the win card can follow. Lifecycle only.
// The dispatcher in celebrate.js decides whether this runs at all and owns the skip tap.
import * as THREE from '../vendor/three.module.js';
import { createFigure } from './dancer-figure.js';
import { sample, LOOP } from './dancer-motion.js';
import { readStage, FADE_MS, SKIP_FADE_MS } from './celebration-stage.js';

const FADE_SETTLE_MS = 40; // slack after the CSS transition; never wait on transitionend
const FOV = 40;
const CAM_AZ = 0.16; // camera sits slightly to her left, so the figure is not dead flat
const CAM_EL = 0.05;
const BASE_TARGET = new THREE.Vector3(0, 1.02, 0);
// The spike solved this against the whole viewport. Here the same fraction is applied to
// the safe rectangle, so a raised hand cannot land under the notch or home indicator.
const FIT_FILL = 0.875;

let active = null;

function createLayer() {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '10',
    pointerEvents: 'none',
    display: 'block',
  });
  document.body.appendChild(canvas);
  return canvas;
}

// A soft contact shadow so the figure stands on the felt instead of floating above it.
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

// Hand back every GPU resource this dancer took: the figure, the contact shadow the scene
// owns, and the context itself. Freeing the context now rather than waiting for GC matters
// because repeated wins on a phone must not run into the browser's WebGL context limit.
function releaseDancer(resources) {
  if (resources.released) return;
  resources.released = true;
  const { figure, shadowMap, floor, renderer } = resources;
  if (figure) figure.dispose();
  if (shadowMap) shadowMap.dispose();
  if (floor) {
    floor.geometry.dispose();
    floor.material.dispose();
  }
  if (renderer) {
    renderer.dispose();
    if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
  }
}

export function startDancer() {
  cancelDancer();
  const canvas = createLayer();

  // Whatever was built before a failure is recorded here, so a synchronous error anywhere
  // below can give exactly that back and then rethrow. A swallowed half-built dancer would
  // otherwise leave a layer and a context behind on every win.
  const resources = {
    renderer: null,
    figure: null,
    shadowMap: null,
    floor: null,
    released: false,
  };

  try {
    return buildDancer(canvas, resources);
  } catch (err) {
    releaseDancer(resources);
    canvas.remove();
    throw err; // the dispatcher decides whether this is a missing WebGL or a real bug
  }
}

function buildDancer(canvas, resources) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  resources.renderer = renderer;
  renderer.setClearColor(0x000000, 0); // transparent: the app's own felt shows through
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1d4032, 1.5));
  const key = new THREE.DirectionalLight(0xfff3e0, 1.9);
  key.position.set(2.4, 4.2, 5.0);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 1.1);
  rim.position.set(-3.5, 2.0, -3.5);
  scene.add(rim);

  const shadowMap = shadowTexture();
  resources.shadowMap = shadowMap;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
  );
  resources.floor = floor; // the scene owns it, so teardown must free it too
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  scene.add(floor);

  const figure = createFigure();
  resources.figure = figure;
  scene.add(figure.group);

  // --- camera framing ------------------------------------------------------
  // Distance is solved from the figure's own silhouette sampled over the loop, inside the
  // safe rectangle measured from the canvas box. Two guessed half-extents cropped the
  // raised hand, so the projection is measured instead.
  let dist = 3.0;
  let targetX = BASE_TARGET.x;
  let targetY = BASE_TARGET.y;
  let lastStage = null;

  function placeCameraAt(target, d) {
    camera.position.set(
      target.x + Math.sin(CAM_AZ) * Math.cos(CAM_EL) * d,
      target.y + Math.sin(CAM_EL) * d,
      target.z + Math.cos(CAM_AZ) * Math.cos(CAM_EL) * d,
    );
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
  }

  function fitFraming() {
    if (!lastStage) return;
    const points = [];
    for (let i = 0; i < 16; i++) {
      figure.apply(sample((i / 16) * LOOP));
      figure.group.updateMatrixWorld(true);
      figure.updateCards();
      figure.faceCamera(camera);
      figure.extentPoints(points);
    }

    const rect = lastStage.rect;
    const insets = lastStage.insets;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const top = Math.max(0, insets.top);
    const bottom = Math.max(0, insets.bottom);
    const left = Math.max(0, insets.left);
    const right = Math.max(0, insets.right);
    // NDC runs -1..1, so the safe box is a half-size and a centre offset in each axis.
    // Both axes matter: on an iPhone in landscape one side has the notch, and the figure
    // belongs in the middle of the safe box, not the middle of the layout viewport.
    const safeHalfY = Math.max(0.2, 1 - (top + bottom) / height);
    const safeCentreY = (bottom - top) / height;
    const safeHalfX = Math.max(0.2, 1 - (left + right) / width);
    const safeCentreX = (left - right) / width;
    const desiredHalf = safeHalfY * FIT_FILL;
    const desiredCentre = safeCentreY;

    const target = new THREE.Vector3(targetX, targetY, BASE_TARGET.z);
    let d = dist;
    const v = new THREE.Vector3();
    const extent = () => {
      placeCameraAt(target, d);
      let lo = Infinity;
      let hi = -Infinity;
      let loX = Infinity;
      let hiX = -Infinity;
      for (const p of points) {
        v.copy(p).project(camera);
        lo = Math.min(lo, v.y);
        hi = Math.max(hi, v.y);
        loX = Math.min(loX, v.x);
        hiX = Math.max(hiX, v.x);
      }
      return { lo, hi, loX, hiX };
    };

    let e = extent();
    for (let iter = 0; iter < 14; iter++) {
      const fill = (e.hi - e.lo) / 2;
      const centre = (e.hi + e.lo) / 2;
      const centreX = (e.hiX + e.loX) / 2;
      const worldPerNdc = Math.tan((FOV * Math.PI) / 360) * d;
      target.y += (centre - desiredCentre) * worldPerNdc * 0.9;
      // The horizontal correction is the same one divided by the aspect: a world unit
      // covers `aspect` times more NDC width than height.
      target.x += (centreX - safeCentreX) * worldPerNdc * camera.aspect * 0.9;
      d *= fill / desiredHalf;
      e = extent();
      if (Math.abs((e.hi - e.lo) / 2 - desiredHalf) < 0.002
        && Math.abs((e.hi + e.lo) / 2 - desiredCentre) < 0.006
        && Math.abs((e.hiX + e.loX) / 2 - safeCentreX) < 0.006) break;
    }
    // A wide arm transient must not be cropped; if it would be, back off.
    const maxX = Math.min(0.93, safeHalfX * 0.95);
    const halfX = (e.hiX - e.loX) / 2;
    if (halfX > maxX) {
      d *= halfX / maxX;
      e = extent();
    }
    dist = d;
    targetX = target.x;
    targetY = target.y;
    placeCameraAt(new THREE.Vector3(targetX, targetY, BASE_TARGET.z), dist);
  }

  function measure() {
    const stage = readStage(canvas);
    lastStage = stage;
    const width = Math.max(1, stage.rect.width);
    const height = Math.max(1, stage.rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fitFraming();
  }

  function update(t) {
    const pose = sample(t);
    figure.apply(pose);
    figure.group.updateMatrixWorld(true);
    figure.updateCards();
    figure.faceCamera(camera);
    floor.position.x = pose.root[0] * 0.6;
    floor.position.z = pose.root[2] * 0.6;
  }

  // --- lifecycle -----------------------------------------------------------
  const session = {
    canvas,
    raf: 0,
    fadeTimer: 0,
    ending: false,
    done: false,
    resolve: null,
  };

  function detachResize() {
    window.removeEventListener('resize', handleResize);
    const viewport = window.visualViewport;
    if (viewport) viewport.removeEventListener('resize', handleResize);
  }

  function teardown(completed) {
    if (session.done) return;
    session.done = true;
    cancelAnimationFrame(session.raf);
    session.raf = 0;
    clearTimeout(session.fadeTimer);
    detachResize();
    releaseDancer(resources);
    canvas.remove();
    if (active === session) active = null;
    if (session.resolve) session.resolve(completed);
  }

  function beginFade(ms) {
    if (session.ending || session.done) return;
    session.ending = true;
    cancelAnimationFrame(session.raf);
    session.raf = 0;
    update(LOOP); // hold the closing pose while the layer dims
    renderer.render(scene, camera);
    void canvas.offsetWidth;
    canvas.style.transition = `opacity ${ms}ms ease-out`;
    canvas.style.opacity = '0';
    // Timers, not transitionend: a background tab can freeze transitions, and the win card
    // must never wait on an event that will not arrive.
    session.fadeTimer = setTimeout(() => teardown(true), ms + FADE_SETTLE_MS);
  }

  // Resize arrives in bursts while Safari animates its toolbars, and measuring re-poses the
  // rig 16 times and re-solves the camera. Mark dirty here and measure once in the next
  // frame, the convention celebrate.js already follows.
  let dirty = false;
  function handleResize() {
    dirty = true;
  }

  const startedAt = performance.now();
  function frame(now) {
    if (session.done || session.ending) return;
    if (dirty) {
      dirty = false;
      measure();
    }
    const elapsed = now - startedAt;
    if (elapsed >= LOOP * 1000) {
      beginFade(FADE_MS);
      return;
    }
    update(elapsed / 1000);
    renderer.render(scene, camera);
    session.raf = requestAnimationFrame(frame);
  }

  // Measure and attach before handing the promise out: the first frame needs a stage, and
  // a synchronous failure here must reach the dispatcher rather than become a dead promise.
  measure();
  window.addEventListener('resize', handleResize);
  const viewport = window.visualViewport;
  if (viewport) viewport.addEventListener('resize', handleResize);

  const finished = new Promise((resolve) => {
    session.resolve = resolve;
    active = session;
    session.raf = requestAnimationFrame(frame);
  });

  // Skip is the quick fade the dispatcher calls on a tap; cancel is the hard stop used
  // when a new deal replaces the board.
  const cancel = () => teardown(false);
  session.cancel = cancel;
  return { finished, stop: () => beginFade(SKIP_FADE_MS), cancel };
}

// Hard cancel: no fade, no orphaned layer, and the promise resolves false.
export function cancelDancer() {
  if (active) active.cancel();
}
