import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCelebrationGeometry } from '../js/celebration-geometry.js';

const insets = (top = 0, bottom = 0) => ({ top, right: 0, bottom, left: 0 });

test('zero insets: a resting card sits on the canvas bottom', () => {
  const g = computeCelebrationGeometry({
    rect: { left: 0, top: 0, width: 393, height: 852 },
    insets: insets(),
    dpr: 1,
    cardWidth: 48,
    cardHeight: 67,
  });
  assert.equal(g.width, 393);
  assert.equal(g.height, 852);
  assert.equal(g.floorY, 852 - 67);
  assert.equal(g.floorY + g.cardHeight, g.height);
});

test('iPhone insets: the resting card clears the home indicator', () => {
  const g = computeCelebrationGeometry({
    rect: { left: 0, top: 0, width: 393, height: 852 },
    insets: insets(47, 34),
    dpr: 3,
    cardWidth: 48,
    cardHeight: 67,
  });
  assert.equal(g.floorY, 852 - 34 - 67);
  assert.equal(g.floorY + g.cardHeight, 852 - 34);
});

test('the top inset is reported, so a path can stay clear of the notch', () => {
  // The floor already answers to the bottom inset; the top is reported rather than folded
  // away, because a celebration that flies near the top edge has to know where the notch is.
  const g = computeCelebrationGeometry({
    rect: { left: 0, top: 0, width: 393, height: 852 },
    insets: insets(59, 34),
    dpr: 3,
    cardWidth: 48,
    cardHeight: 67,
  });
  assert.equal(g.topInset, 59);
  assert.equal(computeCelebrationGeometry({ insets: insets(-5, 0) }).topInset, 0);
});

test('rect smaller than the window (iOS toolbars): geometry follows the rect', () => {
  // The canvas box was measured at 393x700 while the window reports 852 tall, the
  // Safari-with-toolbars case. The floor must follow the measured rect, not the window.
  const g = computeCelebrationGeometry({
    rect: { left: 0, top: 0, width: 393, height: 700 },
    insets: insets(47, 34),
    dpr: 3,
    cardWidth: 48,
    cardHeight: 67,
  });
  assert.equal(g.width, 393);
  assert.equal(g.height, 700);
  assert.equal(g.pixelWidth, 1179);
  assert.equal(g.pixelHeight, 2100);
  assert.equal(g.floorY, 700 - 34 - 67);
});

test('no resting card ever enters the bottom safe area', () => {
  for (const height of [500, 700, 852, 1024]) {
    for (const bottom of [0, 21, 34]) {
      const g = computeCelebrationGeometry({
        rect: { left: 0, top: 0, width: 393, height },
        insets: insets(47, bottom),
        dpr: 2,
        cardWidth: 48,
        cardHeight: 67,
      });
      assert.ok(g.floorY >= 0);
      assert.ok(g.floorY + g.cardHeight <= g.height - bottom,
        `card bottom ${g.floorY + g.cardHeight} entered the ${bottom}px inset of a ${height}px canvas`);
    }
  }
});

test('backing store scales with dpr while drawing space stays in CSS pixels', () => {
  for (const dpr of [1, 2, 3]) {
    const g = computeCelebrationGeometry({
      rect: { left: 0, top: 0, width: 393, height: 852 },
      insets: insets(47, 34),
      dpr,
      cardWidth: 48,
      cardHeight: 67,
    });
    // The renderer draws with the context scaled by dpr, so one drawing unit is one CSS
    // pixel and the requested card size is preserved. This test proves the ratio only;
    // rasterisation is covered by the browser smoke, not here.
    assert.equal(g.cardWidth, 48);
    assert.equal(g.cardHeight, 67);
    assert.equal(g.pixelWidth, 393 * dpr);
    assert.equal(g.pixelHeight, 852 * dpr);
    assert.equal(g.pixelWidth / g.width, dpr);
    assert.equal(g.pixelHeight / g.height, dpr);
  }
});

test('missing or non-finite inputs fall back instead of poisoning the geometry', () => {
  const g = computeCelebrationGeometry({
    rect: { width: NaN, height: undefined },
    insets: { bottom: NaN },
    dpr: NaN,
    cardWidth: undefined,
    cardHeight: NaN,
  });
  assert.equal(g.width, 0);
  assert.equal(g.height, 0);
  assert.equal(g.dpr, 1);
  assert.equal(g.pixelWidth, 0);
  assert.equal(g.pixelHeight, 0);
  assert.equal(g.floorY, 0);
  assert.equal(g.cardWidth, 0);
  assert.equal(g.cardHeight, 0);
  assert.equal(g.left, 0);
  assert.equal(g.top, 0);
});
