// SPIKE — throwaway check, not part of the page. Forward kinematics over motion.js, to
// measure where the hands and elbows actually are (max width, height, elbow bend)
// instead of guessing from renders. Run: node spikes/card-dancer/check-arms.mjs
import * as THREE from './vendor/three.module.js';
import { sample, LOOP, COUNT } from './motion.js';

const BONES = [
  ['hips', null, [0, 0, 0], 0.10, 1],
  ['spine', 'hips', [0, 0.08, 0], 0.20, 1],
  ['chest', 'spine', [0, 0.20, 0], 0.22, 1],
  ['neck', 'chest', [0, 0.20, 0], 0.07, 1],
  ['head', 'neck', [0, 0.07, 0], 0.16, 1],
  ['armL', 'chest', [0.155, 0.17, 0], 0.26, -1],
  ['foreL', 'armL', [0, -0.26, 0], 0.24, -1],
  ['handL', 'foreL', [0, -0.24, 0], 0.085, -1],
  ['armR', 'chest', [-0.155, 0.17, 0], 0.26, -1],
  ['foreR', 'armR', [0, -0.26, 0], 0.24, -1],
  ['handR', 'foreR', [0, -0.24, 0], 0.085, -1],
];
const SPINE = new Set(['hips', 'spine', 'chest', 'neck', 'head']);
const HIP_Y = 1.01;

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

function tip(name) {
  const o = objs[name];
  const p = new THREE.Vector3(0, o.userData.up * o.userData.len, 0);
  o.localToWorld(p);
  return p;
}

const rows = [];
for (let t = 0; t < LOOP; t += 0.05) {
  const pose = sample(t);
  objs.hips.position.set(pose.root[0], HIP_Y + pose.root[1], pose.root[2]);
  for (const [name, , , , up] of BONES) {
    const j = pose.joints[name];
    const sign = SPINE.has(name) || up === 'z' ? 1 : -1;
    objs[name].rotation.set(j[0] * sign, j[1], j[2]);
  }
  root.updateMatrixWorld(true);
  rows.push({ t, handR: tip('handR'), handL: tip('handL'), elbowR: tip('armR'), elbowL: tip('armL') });
}

const wide = rows.map((r) => ({ t: r.t, x: Math.max(Math.abs(r.handR.x), Math.abs(r.handL.x), Math.abs(r.elbowR.x), Math.abs(r.elbowL.x)) }))
  .sort((p, q) => q.x - p.x);
console.log('widest 6 samples:', wide.slice(0, 6).map((w) => `${w.t.toFixed(2)}s ${w.x.toFixed(2)}`).join('  '));

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const sh = new THREE.Vector3();
function bend(arm, fore) {
  sh.setFromMatrixPosition(objs[arm].matrixWorld);
  a.subVectors(tip(arm), sh);
  b.subVectors(tip(fore), tip(arm));
  return THREE.MathUtils.radToDeg(a.angleTo(b));
}

for (let k = 0; k < 8; k++) {
  const t = k * COUNT;
  // re-apply the pose at this exact t before measuring the bend
  const pose = sample(t);
  objs.hips.position.set(pose.root[0], HIP_Y + pose.root[1], pose.root[2]);
  for (const [name, , , , up] of BONES) {
    const j = pose.joints[name];
    const sign = SPINE.has(name) || up === 'z' ? 1 : -1;
    objs[name].rotation.set(j[0] * sign, j[1], j[2]);
  }
  root.updateMatrixWorld(true);
  const r = rows.find((row) => Math.abs(row.t - t) < 0.03) || { handR: tip('handR'), handL: tip('handL') };
  console.log(
    `t=${t.toFixed(2)} c${k + 1}`,
    ` R(${r.handR.x.toFixed(2)},${r.handR.y.toFixed(2)},${r.handR.z.toFixed(2)})`,
    ` L(${r.handL.x.toFixed(2)},${r.handL.y.toFixed(2)},${r.handL.z.toFixed(2)})`,
    ` bend R ${bend('armR', 'foreR').toFixed(0)} L ${bend('armL', 'foreL').toFixed(0)}`,
  );
}
