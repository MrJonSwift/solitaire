import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIndex, nextVariant } from '../js/celebration-rotation.js';

test('a stored index that still names a celebration is kept', () => {
  assert.equal(resolveIndex(0, 3), 0);
  assert.equal(resolveIndex(2, 3), 2);
  // JSON round-trips numbers as numbers, but a hand-edited value must not be a landmine.
  assert.equal(resolveIndex('1', 3), 1);
});

test('a stale, missing or nonsense index falls back to the first celebration', () => {
  // A variant was removed since this index was written.
  assert.equal(resolveIndex(7, 3), 0);
  assert.equal(resolveIndex(-1, 3), 0);
  assert.equal(resolveIndex(undefined, 3), 0);
  assert.equal(resolveIndex(null, 3), 0);
  assert.equal(resolveIndex(NaN, 3), 0);
  assert.equal(resolveIndex(1.5, 3), 0);
  assert.equal(resolveIndex(1, 0), 0);
});

test('the rotation advances by one and wraps', () => {
  assert.equal(nextVariant(0, 3), 1);
  assert.equal(nextVariant(1, 3), 2);
  assert.equal(nextVariant(2, 3), 0);
});

test('one celebration always plays, and a broken list cannot lock a win', () => {
  assert.equal(nextVariant(0, 1), 0);
  assert.equal(nextVariant(0, 0), 0);
  assert.equal(nextVariant(5, 0), 0);
  assert.equal(nextVariant(3, 3), 0); // out of range: start again rather than throw
  assert.equal(nextVariant(undefined, 3), 0);
});

test('a full cycle visits every celebration before repeating, and never twice in a row', () => {
  const count = 3;
  let index = resolveIndex(undefined, count);
  const seen = [];
  for (let win = 0; win < count; win++) {
    seen.push(index);
    assert.notEqual(nextVariant(index, count), index, 'consecutive wins must differ');
    index = nextVariant(index, count);
  }
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(index, 0, 'the cycle comes back to the start');
});
