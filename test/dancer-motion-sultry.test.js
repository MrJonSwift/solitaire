import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOP, COUNT, JOINT_NAMES, LAG, sample, sampleDegrees, countAt,
} from '../js/dancer-motion-sultry.js';
// The joints the shared card body has (dancer-figure.js). Written out here since the salsa,
// which used to own this list, was retired: its stiff legs were the reason this dance exists.
const BODY_JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR',
];

// The card dance has the same seam as every celebration's motion: numbers in, pose out, held still in
// Node so it can be retuned without a browser and can never hand the rig a NaN.

test('two slow bars: eight counts of 1.5 s', () => {
  assert.equal(COUNT, 1.5);
  assert.equal(LOOP, 12);
});

test('it drives exactly the joints the shared body has', () => {
  assert.deepEqual([...JOINT_NAMES].sort(), [...BODY_JOINTS].sort());
});

test('the loop closes: the last frame is the first frame', () => {
  const close = (a, b, where) => {
    a.root.forEach((v, i) => assert.ok(Math.abs(v - b.root[i]) < 1e-9, `root ${where}`));
    for (const name of JOINT_NAMES) {
      a.joints[name].forEach((v, i) => assert.ok(Math.abs(v - b.joints[name][i]) < 1e-9, `${name} ${where}`));
    }
  };
  close(sample(0), sample(LOOP), 'at the seam');
  close(sample(1.3), sample(1.3 + 2 * LOOP), 'two loops on');
  close(sample(0), sample(-LOOP), 'negative time');
});

test('sampling is deterministic and independent of call order', () => {
  const a = sample(2.6);
  sample(0);
  sample(5.99);
  assert.deepEqual(sample(2.6), a);
  assert.deepEqual(sampleDegrees(2.6), sampleDegrees(2.6));
});

test('every joint is present and every number is finite', () => {
  for (let step = 0; step <= 96; step++) {
    const t = (step / 96) * LOOP;
    const pose = sample(t);
    assert.equal(pose.root.length, 3);
    assert.deepEqual(Object.keys(pose.joints).sort(), [...JOINT_NAMES].sort(), `joint set at ${t}s`);
    for (const v of pose.root) assert.ok(Number.isFinite(v), `root at ${t}s`);
    for (const name of JOINT_NAMES) {
      assert.equal(pose.joints[name].length, 3);
      for (const v of pose.joints[name]) assert.ok(Number.isFinite(v), `${name} at ${t}s`);
    }
  }
});

// The whole point of this dance is that nothing snaps. At 60 fps, including across the loop
// seam, no joint may turn more than a few degrees between frames, and the hips may not move
// more than 0.01 (a sixteenth of their own width) — they cross the middle quickly on purpose,
// at about 0.008 a frame, but a hop between legs would be several times that.
test('no joint jumps between frames, across the seam too', () => {
  const dt = 1 / 60;
  let worst = { by: 0 };
  for (let t = -dt; t < LOOP + dt; t += dt) {
    const a = sampleDegrees(t);
    const b = sampleDegrees(t + dt);
    for (const name of JOINT_NAMES) {
      for (let c = 0; c < 3; c++) {
        const by = Math.abs(b.joints[name][c] - a.joints[name][c]);
        if (by > worst.by) worst = { by, name, c, t };
      }
    }
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(b.root[c] - a.root[c]) < 0.01, `root jumps at ${t}s`);
  }
  assert.ok(worst.by < 6, `${worst.name}[${worst.c}] turns ${worst.by.toFixed(2)} deg in one frame at ${worst.t?.toFixed(3)}s`);
});

test('the hips sway: weight really travels from leg to leg', () => {
  const xs = [];
  for (let t = 0; t < LOOP; t += 0.05) xs.push(sample(t).root[0]);
  assert.ok(Math.max(...xs) > 0.06, 'the hips reach her left');
  assert.ok(Math.min(...xs) < -0.06, 'the hips reach her right');
});

test('the chest and head arrive after the hips, the hands after the arms', () => {
  assert.ok(LAG.spine > 0 && LAG.chest > LAG.spine && LAG.neck > LAG.chest && LAG.head > LAG.neck);
  assert.ok(LAG.hand > LAG.fore && LAG.fore > 0);
  // A lag past half a count stops reading as one body.
  for (const [name, lag] of Object.entries(LAG)) assert.ok(lag <= COUNT / 2, `${name} lags too far`);
});

test('countAt lands on one of the eight counts, forever', () => {
  assert.equal(countAt(0), 1);
  assert.equal(countAt(1.49), 1);
  assert.equal(countAt(1.5), 2);
  assert.equal(countAt(11.99), 8);
  assert.equal(countAt(12), 1);
  assert.equal(countAt(-0.01), 8);
  assert.equal(countAt(-1.51), 7);
  for (let t = -20; t <= 20; t += 0.07) {
    const n = countAt(t);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 8, `countAt(${t}) = ${n}`);
  }
});
