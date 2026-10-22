// SPIKE — throwaway. Skeleton of Object3D bones, and every bone dressed in a fan of
// card-shaped planes. Four treatments: `queen` is the best-case attempt (wrapped,
// tangent, with a skirt and hair); shell / plume / ribbon stay for comparison.
import * as THREE from './vendor/three.module.js';
import { makeCardTextures, CARD_W, CARD_H } from './cards2d.js';

const CARD_H_WORLD = 0.13;
const CARD_W_WORLD = CARD_H_WORLD * (CARD_W / CARD_H);
const QUEEN = 1.15; // queen cards are a touch larger than the comparison styles
const HIP_Y = 1.01; // hip joint height: feet rest on the floor at y = 0
const EPS = 0.0012; // back face sits just behind the front face
const TAU = Math.PI * 2;

// up: +1 spine chain (bone runs upward), -1 limb (bone hangs down), 'z' foot (runs forward).
// flare: a fan of cards at one end, used by the plume treatment (skirt, hands).
// qr: radius (or [root, tip] taper) used by the queen wrap.
const BONE_DEFS = [
  { name: 'hips', parent: null, at: [0, 0, 0], len: 0.10, up: 1, r: 0.155, qr: [0.155, 0.125],
    flare: { at: 'root', rad: 0.135, tilt: 2.0, density: 2.2 } },
  { name: 'spine', parent: 'hips', at: [0, 0.08, 0], len: 0.20, up: 1, r: 0.125, qr: [0.118, 0.095] },
  { name: 'chest', parent: 'spine', at: [0, 0.20, 0], len: 0.22, up: 1, r: 0.15, qr: [0.10, 0.145],
    flare: { at: 'tip', rad: 0.10, tilt: 0.55, density: 0.7 } },
  { name: 'neck', parent: 'chest', at: [0, 0.20, 0], len: 0.07, up: 1, r: 0.05, qr: [0.045, 0.038] },
  { name: 'head', parent: 'neck', at: [0, 0.07, 0], len: 0.16, up: 1, r: 0.085, qr: 0.085 },

  // Arms are 10% shorter than the first pass: at 2.6 they read as tubes and put the
  // hand out of frame at the top of the raise.
  { name: 'armL', parent: 'chest', at: [0.155, 0.17, 0], len: 0.234, up: -1, r: 0.048, qr: [0.042, 0.030] },
  { name: 'foreL', parent: 'armL', at: [0, -0.234, 0], len: 0.216, up: -1, r: 0.042, qr: [0.036, 0.024] },
  { name: 'handL', parent: 'foreL', at: [0, -0.216, 0], len: 0.085, up: -1, r: 0.038, qr: 0.032 },
  { name: 'armR', parent: 'chest', at: [-0.155, 0.17, 0], len: 0.234, up: -1, r: 0.048, qr: [0.042, 0.030] },
  { name: 'foreR', parent: 'armR', at: [0, -0.234, 0], len: 0.216, up: -1, r: 0.042, qr: [0.036, 0.024] },
  { name: 'handR', parent: 'foreR', at: [0, -0.216, 0], len: 0.085, up: -1, r: 0.038, qr: 0.032 },

  { name: 'thighL', parent: 'hips', at: [0.085, -0.02, 0], len: 0.46, up: -1, r: 0.078, qr: [0.080, 0.053],
    flare: { at: 'root', rad: 0.10, tilt: 0.85, density: 1.1 } },
  { name: 'shinL', parent: 'thighL', at: [0, -0.46, 0], len: 0.46, up: -1, r: 0.058, qr: [0.054, 0.035] },
  { name: 'footL', parent: 'shinL', at: [0, -0.46, 0], len: 0.155, up: 'z', r: 0.045, qr: 0.040 },
  { name: 'thighR', parent: 'hips', at: [-0.085, -0.02, 0], len: 0.46, up: -1, r: 0.078, qr: [0.080, 0.053],
    flare: { at: 'root', rad: 0.10, tilt: 0.85, density: 1.1 } },
  { name: 'shinR', parent: 'thighR', at: [0, -0.46, 0], len: 0.46, up: -1, r: 0.058, qr: [0.054, 0.035] },
  { name: 'footR', parent: 'shinR', at: [0, -0.46, 0], len: 0.155, up: 'z', r: 0.045, qr: 0.040 },
];

const SPINE_CHAIN = new Set(['hips', 'spine', 'chest', 'neck', 'head']);

// Deterministic jitter: screenshots must match between runs, so no Math.random.
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const GOLDEN = 2.39996323;

// --- comparison treatments (unchanged apart from card size and the new back) ---

function layout(b, style, count, seed) {
  const L = b.len;
  const out = [];
  if (style === 'shell') {
    // Cards spiralling down the bone, overlapping like scales.
    const n = Math.max(2, Math.round(count));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      out.push({
        along: u * L,
        az: i * GOLDEN + seed * 6.283,
        radial: b.r * (0.82 + 0.18 * hash(i * 7 + seed * 31)),
        tilt: 0.32 + 0.22 * hash(i * 3 + seed * 13),
        spin: (hash(i * 11 + seed * 5) - 0.5) * 0.24,
      });
    }
  } else if (style === 'plume') {
    // A narrow line down the bone, then a burst at the flare end.
    const n = Math.max(3, Math.round(count * 0.65));
    const az0 = seed * 6.283;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      out.push({ along: u * L, az: az0 + i * 0.5, radial: b.r * 0.8, tilt: 0.16, spin: (hash(i + seed * 3) - 0.5) * 0.2 });
    }
    if (b.flare) {
      const f = b.flare;
      const nf = Math.max(4, Math.round(count * f.density));
      for (let i = 0; i < nf; i++) {
        const az = (i / nf) * TAU + seed * 1.7;
        out.push({
          along: f.at === 'tip' ? L * 0.98 : L * 0.04,
          az,
          radial: f.rad,
          tilt: f.tilt,
          spin: (hash(i + seed * 9) - 0.5) * 0.4,
        });
      }
    }
  } else {
    // A single sparse chain that trails past the bone.
    const n = Math.max(2, Math.round(count * 0.7));
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : i / (n - 1);
      out.push({
        along: u * L * 1.25,
        az: i * 0.75 + seed * 6.283,
        radial: b.r * 1.15,
        tilt: 0.1,
        spin: 0.35 + i * 0.28,
      });
    }
  }
  return out;
}

// --- queen: cards wrapped tangent to the bone, 55-60% overlap ---------------

// Hands and shoes are authored as explicit local matrices rather than as a wrap around
// the bone: a wrapped tube is exactly what read as a sleeve. A hand is a small fan of
// three cards with their bases at the wrist, splayed like fingers and a little smaller
// than a body card. A shoe is a fat cluster over the toe, so the figure stands on
// something instead of tapering into a column.
const HAND_SCALE = 0.86;
function handFan() {
  const H = CARD_H_WORLD * HAND_SCALE;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.62; // splay: index, middle, little finger
    const d = new THREE.Vector3(Math.sin(a), -Math.cos(a), 0);
    const m = new THREE.Matrix4()
      .makeTranslation(d.x * H * 0.44, d.y * H * 0.44, (i - 1) * 0.004)
      .multiply(new THREE.Matrix4().makeRotationZ(Math.PI + a))
      .multiply(new THREE.Matrix4().makeRotationY((i - 1) * 0.30))
      .multiply(new THREE.Matrix4().makeScale(HAND_SCALE, HAND_SCALE, HAND_SCALE));
    out.push({ matrix: m });
  }
  return out;
}

function shoeCluster(side) {
  // Foot bone points +Z and inherits the shin frame, so an unrotated card stands up
  // facing the camera. Three cards stepping forward over the toe make the wedge.
  const turn = side === 'L' ? 1 : -1;
  const specs = [
    { x: -0.021 * turn, y: 0.0, z: 0.03, s: 0.80, rx: 0.10, rz: 0.10 * turn },
    { x: 0.022 * turn, y: -0.005, z: 0.035, s: 0.84, rx: 0.16, rz: -0.08 * turn },
    { x: 0.0, y: -0.012, z: 0.082, s: 0.94, rx: 0.50, rz: 0.05 * turn },
    { x: 0.0, y: -0.024, z: 0.122, s: 0.80, rx: 0.92, rz: -0.04 * turn },
  ];
  return specs.map((c) => ({
    matrix: new THREE.Matrix4()
      .makeTranslation(c.x, c.y, c.z)
      .multiply(new THREE.Matrix4().makeRotationX(c.rx))
      .multiply(new THREE.Matrix4().makeRotationZ(c.rz))
      .multiply(new THREE.Matrix4().makeScale(c.s, c.s, c.s)),
  }));
}

function queenCards(b, count, seed) {
  const out = [];
  const H = CARD_H_WORLD * QUEEN;
  const W = CARD_W_WORLD * QUEEN;
  const density = Math.min(2, Math.max(0.6, count / 8));

  if (b.name.startsWith('hand')) return handFan();
  if (b.name.startsWith('foot')) return shoeCluster(b.name.endsWith('L') ? 'L' : 'R');

  const [r0, r1] = Array.isArray(b.qr) ? b.qr : [b.qr, b.qr];
  const rowStep = H * 0.45; // ~55% overlap along the bone
  const ringStep = W * 0.5; // ~50% overlap around it
  const span = b.len + H * 0.44; // cards meet across the joints
  const rows = Math.max(2, Math.round((span / rowStep) * density));

  for (let i = 0; i < rows; i++) {
    const u = rows === 1 ? 0 : i / (rows - 1);
    const along = -H * 0.22 + u * span;
    const t = Math.min(1, Math.max(0, along / b.len));
    const r = r0 + (r1 - r0) * t;
    const nRing = Math.max(5, Math.round((TAU * r) / ringStep * density));
    for (let j = 0; j < nRing; j++) {
      const az = (j / nRing) * TAU + (i % 2) * (Math.PI / nRing) + seed * TAU;
      out.push({
        along,
        az,
        radial: r + 0.003,
        tilt: 0.06 + 0.05 * hash(i * 3 + j * 7 + seed),
        upright: true,
        spin: 0,
        scale: QUEEN,
      });
    }
  }

  // Two-tier skirt: the lower tier is wider and hangs further, so it moves.
  if (b.name === 'hips') {
    const tiers = [
      { along: 0.06, radial: 0.16, tilt: 2.3, n: 17, scale: 1.3 },
      { along: -0.05, radial: 0.19, tilt: 2.72, n: 21, scale: 1.45 },
    ];
    for (const tier of tiers) {
      for (let i = 0; i < tier.n; i++) {
        out.push({
          along: tier.along,
          az: (i / tier.n) * TAU + seed * TAU + (tier.scale > 1.35 ? 0.16 : 0),
          radial: tier.radial,
          tilt: tier.tilt,
          upright: true,
          spin: (hash(i + tier.along * 10) - 0.5) * 0.22,
          scale: tier.scale,
        });
      }
    }
  }
  return out;
}

function cardsFor(b, style, count) {
  return style === 'queen' ? queenCards(b, count, b.seed) : layout(b, style, count, b.seed);
}

function upAxisOf(b) {
  if (b.up === 'z') return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, b.up, 0);
}

// A card's local frame: +Y along the (possibly flared) bone, +Z facing outward.
// With upright set, the card stays upright in bone space and lies tangent to the surface.
function cardMatrix(b, c) {
  const axis = upAxisOf(b);
  const e1 = new THREE.Vector3(1, 0, 0);
  const e2 = b.up === 'z' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const radial = new THREE.Vector3()
    .addScaledVector(e1, Math.cos(c.az))
    .addScaledVector(e2, Math.sin(c.az))
    .normalize();
  const pos = new THREE.Vector3()
    .addScaledVector(axis, c.along)
    .addScaledVector(radial, c.radial);
  let up;
  if (c.upright) {
    up = new THREE.Vector3(0, 1, 0)
      .multiplyScalar(Math.cos(c.tilt))
      .addScaledVector(radial, Math.sin(c.tilt))
      .normalize();
  } else {
    up = new THREE.Vector3()
      .addScaledVector(axis, Math.cos(c.tilt))
      .addScaledVector(radial, Math.sin(c.tilt))
      .normalize();
  }
  const right = new THREE.Vector3().crossVectors(up, radial).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
  const m = new THREE.Matrix4().makeBasis(right, up, fwd);
  m.setPosition(pos);
  if (c.spin) m.multiply(new THREE.Matrix4().makeRotationZ(c.spin));
  if (c.scale) m.multiply(new THREE.Matrix4().makeScale(c.scale, c.scale, c.scale));
  return m;
}

export function createFigure({ style = 'queen', cards = 8, headCard = true, debug = false } = {}) {
  const group = new THREE.Group();
  const textures = makeCardTextures();
  const cardGeo = new THREE.PlaneGeometry(CARD_W_WORLD, CARD_H_WORLD);

  const faceMats = textures.faces.map((map) => new THREE.MeshLambertMaterial({
    map, alphaTest: 0.5, side: THREE.FrontSide,
  }));
  const backMat = new THREE.MeshLambertMaterial({
    map: textures.back, alphaTest: 0.5, side: THREE.FrontSide,
  });

  const bones = [];
  const byName = {};
  for (const def of BONE_DEFS) {
    const obj = new THREE.Object3D();
    obj.name = def.name;
    const parent = def.parent ? byName[def.parent] : null;
    if (parent) {
      parent.obj.add(obj);
      obj.position.set(def.at[0], def.at[1], def.at[2]);
    } else {
      group.add(obj);
      obj.position.set(0, HIP_Y, 0);
    }
    const b = {
      def, obj, name: def.name, len: def.len, r: def.r, qr: def.qr, up: def.up, flare: def.flare,
      seed: (bones.length * 0.618) % 1, index: bones.length,
    };
    bones.push(b);
    byName[def.name] = b;
  }
  const hips = byName.hips;

  // --- head: one queen card, billboarded at the camera, with hair behind it ----
  // Everything hangs off headBillboard, so the hair turns with the face.
  const headBillboard = new THREE.Object3D();
  headBillboard.position.set(0, 0.225, 0.02); // high enough to leave a neck below the card
  byName.head.obj.add(headBillboard);

  const headMesh = new THREE.Mesh(cardGeo, faceMats[0]); // Q of hearts
  headMesh.scale.setScalar(1.8);
  headMesh.visible = headCard;
  // Back face rides on the front mesh, so it inherits the billboard and the size.
  const headBack = new THREE.Mesh(cardGeo, backMat);
  headBack.rotation.y = Math.PI;
  headBack.position.set(0, 0, -EPS);
  headMesh.add(headBack);
  headBillboard.add(headMesh);

  // Hair: behind the skull, not beside it. A fan out to the side floated free of the
  // head and merged with the raised arm; this is a cap over the crown and a mass down
  // the back, kept inside 1.5 head widths (head card is 0.168 wide), plus one strand
  // that falls over her left shoulder.
  const hair = new THREE.Group();
  const HAIR = [
    // crown, tucked just behind the top edge of the face card
    { x: -0.032, y: 0.112, z: -0.028, s: 0.72, rz: 0.14, ry: 0.10 },
    { x: 0.040, y: 0.108, z: -0.032, s: 0.66, rz: -0.20, ry: -0.10 },
    // the back mass: hangs below the jaw onto the neck and shoulders
    { x: -0.048, y: -0.030, z: -0.036, s: 0.84, rz: 0.10, ry: 0.04 },
    { x: 0.004, y: -0.048, z: -0.040, s: 0.95, rz: 0.0, ry: -0.04 },
    { x: 0.052, y: -0.028, z: -0.036, s: 0.82, rz: -0.12, ry: 0.06 },
    { x: 0.016, y: -0.140, z: -0.042, s: 0.82, rz: -0.06, ry: -0.05 },
    { x: -0.026, y: -0.186, z: -0.040, s: 0.68, rz: 0.09, ry: 0.08 },
    // one strand over her left shoulder, angled out and down
    { x: 0.070, y: -0.150, z: -0.020, s: 0.58, rz: -0.46, ry: 0.12 },
    { x: 0.092, y: -0.205, z: -0.018, s: 0.48, rz: -0.34, ry: 0.18 },
  ];
  HAIR.forEach((h, i) => {
    // Faces for hair are the back of the pack: a card back reads as hair far better
    // than a rank and a pip, and it keeps the head card the only face up there.
    const card = new THREE.Mesh(cardGeo, i % 3 === 2 ? faceMats[(i * 5 + 3) % faceMats.length] : backMat);
    card.position.set(h.x, h.y, h.z);
    card.rotation.set(0, h.ry, h.rz);
    card.scale.setScalar(h.s);
    const back = new THREE.Mesh(cardGeo, backMat);
    back.rotation.y = Math.PI;
    back.position.z = -EPS;
    card.add(back);
    hair.add(card);
  });
  headBillboard.add(hair);

  // --- debug skeleton ------------------------------------------------------
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, depthTest: false, transparent: true, opacity: 0.9 });
  const jointMat = new THREE.MeshBasicMaterial({ color: 0xff3366, depthTest: false });
  const jointGeo = new THREE.SphereGeometry(0.012, 6, 4);
  const debugLines = [];
  for (const b of bones) {
    const tip = b.up === 'z' ? new THREE.Vector3(0, 0, b.len) : new THREE.Vector3(0, b.up * b.len, 0);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), tip]);
    const line = new THREE.Line(geo, lineMat);
    line.renderOrder = 5;
    const dot = new THREE.Mesh(jointGeo, jointMat);
    dot.renderOrder = 6;
    b.obj.add(line, dot);
    line.visible = debug;
    dot.visible = debug;
    debugLines.push(line, dot);
  }

  // --- card dressing -------------------------------------------------------
  let fronts = []; // InstancedMesh, one per face texture in use
  let backs = null;
  let instances = []; // { bone, local, face, mesh, index, backIndex }
  const stats = { cards: 0 };

  function buildCards() {
    for (const m of fronts) { group.remove(m); m.dispose(); }
    fronts = [];
    if (backs) { group.remove(backs); backs.dispose(); backs = null; }

    const list = [];
    for (const b of bones) {
      if (headCard && b.name === 'head') continue;
      for (const c of cardsFor(b, style, cards)) {
        list.push({ bone: b, local: c.matrix ? c.matrix.clone() : cardMatrix(b, c) });
      }
    }

    const perFace = faceMats.map(() => []);
    list.forEach((it, i) => {
      // Skirt and body cards should show mostly pips and ranks, not a run of one face.
      it.face = Math.floor(hash(i * 1.37 + (it.bone.index + 1) * 0.77) * faceMats.length);
      perFace[it.face].push(it);
    });
    perFace.forEach((items, f) => {
      if (!items.length) return;
      const mesh = new THREE.InstancedMesh(cardGeo, faceMats[f], items.length);
      mesh.frustumCulled = false;
      items.forEach((it, k) => { it.mesh = mesh; it.index = k; });
      group.add(mesh);
      fronts.push(mesh);
    });

    backs = new THREE.InstancedMesh(cardGeo, backMat, list.length);
    backs.frustumCulled = false;
    group.add(backs);
    instances = list;
    instances.forEach((it, i) => { it.backIndex = i; });
    stats.cards = instances.length;
    updateCards();
  }

  const tmp = new THREE.Matrix4();
  const backOffset = new THREE.Matrix4()
    .makeTranslation(0, 0, -EPS)
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI));

  function updateCards() {
    if (!instances.length) return;
    for (const it of instances) {
      tmp.multiplyMatrices(it.bone.obj.matrixWorld, it.local);
      it.mesh.setMatrixAt(it.index, tmp);
      tmp.multiply(backOffset);
      backs.setMatrixAt(it.backIndex, tmp);
    }
    for (const m of fronts) m.instanceMatrix.needsUpdate = true;
    backs.instanceMatrix.needsUpdate = true;
  }

  // --- per-frame -----------------------------------------------------------
  function apply(pose) {
    const r = pose.root;
    hips.obj.position.set(r[0], HIP_Y + r[1], r[2]);
    for (const b of bones) {
      const j = pose.joints[b.name];
      if (!j) continue;
      // Limbs hang downward, so a positive x must be negated to swing the free
      // end toward the camera. Feet point forward and are authored directly.
      const sign = SPINE_CHAIN.has(b.name) || b.up === 'z' ? 1 : -1;
      b.obj.rotation.set(j[0] * sign, j[1], j[2]);
    }
  }

  function faceCamera(camera) {
    const camQ = camera.getWorldQuaternion(new THREE.Quaternion());
    const headQ = byName.head.obj.getWorldQuaternion(new THREE.Quaternion());
    headBillboard.quaternion.copy(headQ.invert().multiply(camQ));
  }

  function setStyle(nextStyle, nextCards, nextHead) {
    style = nextStyle;
    cards = nextCards;
    headCard = nextHead;
    headMesh.visible = headCard;
    buildCards();
  }

  function setDebug(on) {
    for (const o of debugLines) o.visible = on;
  }

  // World-space corners of every card in the current pose, for framing. The renderer
  // owns the camera; the figure only says where its silhouette actually is.
  const _m = new THREE.Matrix4();
  const _c = new THREE.Vector3();
  function extentPoints(out) {
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const push = (world) => {
      for (const [cx, cy] of corners) {
        _c.set(cx * CARD_W_WORLD, cy * CARD_H_WORLD, 0).applyMatrix4(world);
        out.push(_c.clone());
      }
    };
    for (const it of instances) {
      it.mesh.getMatrixAt(it.index, _m);
      _m.premultiply(it.mesh.matrixWorld);
      push(_m);
    }
    headMesh.updateWorldMatrix(true, false);
    if (headMesh.visible) push(headMesh.matrixWorld);
    hair.updateWorldMatrix(true, false);
    for (const card of hair.children) push(card.matrixWorld);
    return out;
  }

  setDebug(debug);
  buildCards();

  return {
    group, bones, apply, faceCamera, updateCards, setStyle, setDebug, stats, extentPoints,
    headBone: byName.head,
  };
}
