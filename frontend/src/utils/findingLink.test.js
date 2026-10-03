import test from "node:test";
import assert from "node:assert/strict";
import { isRectVisibleWithin, linkPath, toLocalPoint } from "./findingLink.js";

test("linkPath draws a horizontal-tangent cubic", () => {
  assert.equal(linkPath({ x: 0, y: 0 }, { x: 100, y: 50 }), "M 0 0 C 50 0 50 50 100 50");
});

test("isRectVisibleWithin rejects scrolled-out and collapsed items", () => {
  const clip = { top: 0, bottom: 100 };
  assert.equal(isRectVisibleWithin({ top: 10, bottom: 30, height: 20 }, clip), true);
  assert.equal(isRectVisibleWithin({ top: 100, bottom: 120, height: 20 }, clip), false);
  assert.equal(isRectVisibleWithin({ top: 10, bottom: 10, height: 0 }, clip), false);
});

test("toLocalPoint subtracts the container origin", () => {
  assert.deepEqual(toLocalPoint({ x: 150, y: 80 }, { left: 100, top: 50 }), { x: 50, y: 30 });
});
