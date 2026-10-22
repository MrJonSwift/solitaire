import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOP, COUNT, JOINT_NAMES, KEYS, sample, sampleDegrees, countAt,
} from '../js/dancer-motion.js';

// The dancer's seam: numbers in, pose out. Everything here is checked in Node so the
// choreography can change without a browser, and a pose can never go silently missing or
// become NaN on a phone.
const joints = (pose) => Object.keys(pose.joints);

test('one loop is four seconds of eight half-second counts', () => {
  assert.equal(COUNT, 0.5);
  assert.equal(LOOP, 4);
  assert.equal(KEYS.length, 8);
  // One key per count, evenly spaced: duplicate or uneven times make the sampler ambiguous.
  assert.deepEqual(KEYS.map((key) => key.t), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  for (const key of KEYS) {
    assert.equal(key.root.length, 3, `key at ${key.t} has no root offset`);
    for (const name of JOINT_NAMES) {
      assert.equal(key[name].length, 3, `key at ${key.t} is missing ${name}`);
    }
  }
});

test('the first and last sample of the loop are the same pose', () => {
  assert.deepEqual(sample(0), sample(4));
  assert.deepEqual(sample(0), sample(8));
  assert.deepEqual(sample(1.25), sample(1.25 + LOOP));
  // Negative time wraps too, so a renderer that falls behind cannot produce an empty pose.
  assert.deepEqual(sample(0), sample(-LOOP));
});

test('sampling is deterministic and independent of call order', () => {
  const a = sample(2.25);
  sample(0);
  sample(3.99);
  assert.deepEqual(sample(2.25), a);
  assert.deepEqual(sampleDegrees(2.25), sampleDegrees(2.25));
});

test('every joint is present and every number is finite', () => {
  for (let step = 0; step <= 32; step++) {
    const t = (step / 32) * LOOP;
    const pose = sample(t);
    assert.equal(pose.root.length, 3, `root is incomplete at ${t}s`);
    assert.deepEqual(joints(pose).sort(), [...JOINT_NAMES].sort(), `joint set changed at ${t}s`);
    for (const value of pose.root) assert.ok(Number.isFinite(value), `root is not finite at ${t}s`);
    for (const name of JOINT_NAMES) {
      assert.equal(pose.joints[name].length, 3, `${name} is incomplete at ${t}s`);
      for (const value of pose.joints[name]) {
        assert.ok(Number.isFinite(value), `${name} is not finite at ${t}s`);
      }
    }
  }
});

test('countAt lands on one of the eight counts, forever', () => {
  assert.equal(countAt(0), 1);
  assert.equal(countAt(0.49), 1);
  assert.equal(countAt(0.5), 2);
  assert.equal(countAt(1.5), 4);
  assert.equal(countAt(3.99), 8);
  assert.equal(countAt(4), 1);
  assert.equal(countAt(-0.01), 8);
  for (let t = -10; t <= 10; t += 0.07) {
    const count = countAt(t);
    assert.ok(Number.isInteger(count) && count >= 1 && count <= 8, `countAt(${t}) = ${count}`);
  }
});
