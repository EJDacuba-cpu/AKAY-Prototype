import test from 'node:test';
import assert from 'node:assert/strict';
import { fitToView, zoomAt, panBy, MIN_SCALE, MAX_SCALE } from './canvasViewport.js';

test('fit never enlarges past 1:1 and centers small content', () => {
  assert.deepEqual(fitToView({ width: 200, height: 100 }, { width: 1000, height: 600 }), { scale: 1, x: 400, y: 250 });
});

test('fit shrinks wide content to the viewport and centers it', () => {
  const view = fitToView({ width: 2000, height: 400 }, { width: 1000, height: 600 }, 0);
  assert.equal(view.scale, 0.5);
  assert.equal(view.x, 0);
  assert.equal(view.y, 200);
});

test('fit handles empty content or an unmeasured viewport', () => {
  assert.deepEqual(fitToView({ width: 0, height: 0 }, { width: 800, height: 600 }), { scale: 1, x: 0, y: 0 });
  assert.deepEqual(fitToView({ width: 100, height: 100 }, { width: 0, height: 0 }), { scale: 1, x: 0, y: 0 });
});

test('zoom keeps the content under the pointer fixed and clamps the scale', () => {
  const view = { scale: 1, x: 10, y: 20 };
  const point = { x: 110, y: 120 };
  const zoomed = zoomAt(view, 2, point);
  assert.equal(zoomed.scale, 2);
  assert.equal((point.x - zoomed.x) / zoomed.scale, (point.x - view.x) / view.scale);
  assert.equal((point.y - zoomed.y) / zoomed.scale, (point.y - view.y) / view.scale);
  assert.equal(zoomAt(view, 100, point).scale, MAX_SCALE);
  assert.equal(zoomAt(view, 0.0001, point).scale, MIN_SCALE);
});

test('panning only offsets the view', () => {
  assert.deepEqual(panBy({ scale: 0.5, x: 1, y: 2 }, 5, -3), { scale: 0.5, x: 6, y: -1 });
});
