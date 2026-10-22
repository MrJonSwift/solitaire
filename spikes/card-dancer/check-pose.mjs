// SPIKE — throwaway check, not part of the page. Forward kinematics over motion.js,
// in Node, so arm geometry can be judged as numbers before spending a render pass.
//
// Question it answers for the fix ticket:
//   - are the two arm chains ever mirror-symmetric, at any 0.25 s step?
//   - does the raised arm keep a card's width of sky between forearm and head?
//   - is the raised hand above and outside the head?
//   - where does the figure's silhouette reach, for framing?
//
// Run: node spikes/card-dancer/check-pose.mjs
import * as THREE from './vendor/three.module.js';
import { sample, LOOP, COUNT } from './motion.js';

const HIP_Y = 1.01;
const CARD_W_WORLD = 0.13 * (96 / 134); // cards2d CARD_W/CARD_H, see figure.js
const QUEEN = 1.15;
const CARD_W = CARD_W_WORLD * QUEEN;
const HEAD_SCALE = 1.8;
const HEAD_HALF_W = (CARD_W_WORLD * HEAD_SCALE) / 2;
const HEAD_HALF_H = (0.13 * HEAD_SCALE) / 2;
const HEAD_AT = [0, 0.225, 0.02]; // headBillboard on the head bone

// Same skeleton as figure.js, with the arms shortened 10%.
const BONES = [
  ['hips', null, [0, 0, 0], 0.10, 1],
  ['spine', 'hips', [0, 0.08, 0], 0.20, 1],
  ['chest', 'spine', [0, 0.20, 0], 0.22, 1],
  ['neck', 'chest', [0, 0.20, 0], 0.07, 1],
  ['head', 'neck', [0, 0.07, 0], 0.16, 1],
  ['armL', 'chest', [0.155, 0.17, 0], 0.234, -1],
  ['foreL', 'armL', [0, -0.234, 0], 0.216, -1],
  ['handL', 'foreL', [0, -0.216, 0], 0.085, -1],
  ['armR', 'chest', [-0.155, 0.17, 0], 0.234, -1],
  ['foreR', 'armR', [0, -0.234, 0], 0.216, -1],
  ['handR', 'foreR', [0, -0.216, 0], 0.085, -1],
  ['thighL', 'hips', [0.085, -0.02, 0], 0.46, -1],
  ['shinL', 'thighL', [0, -0.46, 0], 0.46, -1],
  ['footL', 'shinL', [0, -0.46, 0], 0.155, 'z'],
  ['thighR', 'hips', [-0.085, -0.02, 0], 0.46, -1],
  ['shinR', 'thighR', [0, -0.46, 0], 0.46, -1],
  ['footR', 'shinR', [0, -0.46, 0], 0.155, 'z'],
];
const SPINE = new Set(['hips', 'spine', 'chest', 'neck', 'head']);

const objs = {};
const root = new THREE.Object3D();
for (const [name, parent, at, len, up] of BONES) {
  const o = new THREE.Object3D();
  o.name = name;
  if (parent) { objs[parent].add(o); o.position.set(...at); } else { root.add(o); o.position.set(0, HIP_Y, 0); }
  objs[name] = o;
  o.userData.len = len;
  o.userData.up = up;
}

// A second chest-rooted copy, for a mirror test that ignores the torso twist:
// symmetry of the arms is a property of the arms, not of the spine.
const chestRoot = new THREE.Object3D();
const cm = {};
for (const name of ['armL', 'foreL', 'handL', 'armR', 'foreR', 'handR']) {
  const [, parent, at] = BONES.find((b) => b[0] === name);
  const o = new THREE.Object3D();
  if (parent === 'chest') { chestRoot.add(o); o.position.set(...at); } else { cm[parent].add(o); o.position.set(...at); }
  cm[name] = o;
}

function poseAt(t) {
  const pose = sample(t);
  objs.hips.position.set(pose.root[0], HIP_Y + pose.root[1], pose.root[2]);
  for (const [name, , , , up] of BONES) {
    const j = pose.joints[name];
    const sign = SPINE.has(name) || up === 'z' ? 1 : -1;
    objs[name].rotation.set(j[0] * sign, j[1], j[2]);
    if (cm[name]) cm[name].rotation.copy(objs[name].rotation);
  }
  root.updateMatrixWorld(true);
  chestRoot.updateMatrixWorld(true);
  return pose;
}

function tip(o, up, len, out = new THREE.Vector3()) {
  out.set(0, up === 'z' ? 0 : up * len, up === 'z' ? len : 0);
  return o.localToWorld(out);
}

function joint(oName) {
  return new THREE.Vector3().setFromMatrixPosition(objs[oName].matrixWorld);
}

// Point-to-segment distance, used against the head card rectangle.
function rectGap(p, a, b) {
  // Distance in the card's own plane (billboarded to the camera: treat as upright,
  // facing +Z) between the head rectangle and segment a-b, measured in x/y only.
  let best = Infinity;
  for (let i = 0; i <= 24; i++) {
    const s = a.clone().lerp(b, i / 24);
    // Skip points far in front of or behind the head: they are not in its silhouette.
    if (Math.abs(s.z - p.z) > 0.10) continue;
    const dx = Math.max(0, Math.abs(s.x - p.x) - HEAD_HALF_W);
    const dy = Math.max(0, Math.abs(s.y - p.y) - HEAD_HALF_H);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

const rows = [];
let worstMirror = { d: Infinity, t: 0 };
let worstGap = { d: Infinity, t: 0, side: '' };
let worstLift = { d: Infinity, t: 0, side: '' };

for (let t = 0; t < LOOP - 1e-9; t += 0.25) {
  poseAt(t);

  // Mirror test in chest space: p_L against x-negated p_R.
  const L = ['armL', 'foreL', 'handL'].map((n) => tip(cm[n], -1, objs[n].userData.len));
  const R = ['armR', 'foreR', 'handR'].map((n) => tip(cm[n], -1, objs[n].userData.len));
  let d = 0;
  for (let i = 0; i < 3; i++) {
    d = Math.max(d, Math.hypot(L[i].x + R[i].x, L[i].y - R[i].y));
  }
  if (d < worstMirror.d) worstMirror = { d, t };

  // Head card centre: billboard on the head bone.
  const head = joint('head').add(new THREE.Vector3(...HEAD_AT));

  const arms = {};
  for (const side of ['L', 'R']) {
    const sh = joint(`arm${side}`);
    const el = tip(objs[`arm${side}`], -1, objs[`arm${side}`].userData.len);
    const wr = tip(objs[`fore${side}`], -1, objs[`fore${side}`].userData.len);
    arms[side] = { sh, el, wr };
  }
  // Only the raised arm has to clear the head: the other one is at the hip.
  const raised = arms.L.wr.y > arms.R.wr.y ? 'L' : 'R';
  for (const side of ['L', 'R']) {
    const { el, wr } = arms[side];
    const gap = rectGap(head, el, wr);
    if (gap < worstGap.d) worstGap = { d: gap, t, side };
    if (side !== raised || wr.y < 1.6) continue;
    // How far the wrist's hand card fan can reach above the head top.
    const dir = wr.clone().sub(el).normalize();
    const handTop = wr.clone().addScaledVector(dir, 0.10).y;
    const lift = handTop - (head.y + HEAD_HALF_H);
    if (lift < worstLift.d) worstLift = { d: lift, t, side };
  }
  rows.push({ t, arms, head, mirror: d });
}

console.log(`card width (world) ${CARD_W.toFixed(3)}  head card ${(HEAD_HALF_W * 2).toFixed(3)}x${(HEAD_HALF_H * 2).toFixed(3)}`);
console.log(`\nmirror-symmetry check (chest frame, max joint mismatch; 0 = perfect mirror)`);
for (const r of rows) {
  const a = r.arms;
  console.log(
    `t=${r.t.toFixed(2)}  mirror ${r.mirror.toFixed(3)}` +
    `   R hand(${a.R.wr.x.toFixed(2)},${a.R.wr.y.toFixed(2)})` +
    `   L hand(${a.L.wr.x.toFixed(2)},${a.L.wr.y.toFixed(2)})`,
  );
}
console.log(`\nworst mirror ${worstMirror.d.toFixed(3)} at t=${worstMirror.t.toFixed(2)}`);
console.log(`min forearm-to-head sky ${worstGap.d.toFixed(3)} at t=${worstGap.t.toFixed(2)} (${worstGap.side} arm), need >= ${CARD_W.toFixed(3)}`);
console.log(`min hand-top-over-head top ${worstLift.d.toFixed(3)} at t=${worstLift.t.toFixed(2)} (${worstLift.side} arm), want >= 0`);

// Framing inputs: widest point and total height of the arm chain over the loop.
let maxX = 0, maxXt = 0, minY = Infinity, maxY = -Infinity;
for (const r of rows) for (const s of ['L', 'R']) {
  for (const p of [r.arms[s].el, r.arms[s].wr]) {
    if (Math.abs(p.x) > maxX) { maxX = Math.abs(p.x); maxXt = r.t; }
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + 0.10);
  }
}
console.log(`widest arm point ${maxX.toFixed(2)} at t=${maxXt.toFixed(2)} (plus ~0.05 of card); arm chain y ${minY.toFixed(2)}..${maxY.toFixed(2)}`);

// Visible elbow bend, to prove it is not a tube.
for (const r of rows) {
  const side = r.arms.L.wr.y > r.arms.R.wr.y ? 'L' : 'R';
  const a = r.arms[side];
  const bend = a.sh.clone().sub(a.el).angleTo(a.wr.clone().sub(a.el)) * 180 / Math.PI;
  if (r.t % 0.5 === 0) console.log(`  t=${r.t.toFixed(2)} raised ${side} elbow bend ${bend.toFixed(0)}deg  hand(${a.wr.x.toFixed(2)},${a.wr.y.toFixed(2)})`);
}

// Keep the back door open: print the 8 key instants in table form.
console.log('\nkey instants:');
for (let k = 0; k < 8; k++) {
  const t = k * COUNT;
  const r = rows.find((row) => Math.abs(row.t - t) < 1e-6);
  const deg = sample(t).joints;
  console.log(
    `c${k + 1} t=${t.toFixed(1)}  armR [${deg.armR.map((v) => v.toFixed(0))}] foreR [${deg.foreR.map((v) => v.toFixed(0))}]` +
    `  armL [${deg.armL.map((v) => v.toFixed(0))}] foreL [${deg.foreL.map((v) => v.toFixed(0))}]` +
    `  mirror ${r.mirror.toFixed(2)}`,
  );
}
