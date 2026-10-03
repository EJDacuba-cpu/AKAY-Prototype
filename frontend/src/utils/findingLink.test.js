import test from "node:test";
import assert from "node:assert/strict";
import { isRectVisibleWithin, leaderPath, linkPath, placePopover, toLocalPoint } from "./findingLink.js";

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

const FIG = { width: 300, height: 450 };
const POP = { width: 120, height: 80 };

test("placePopover opens right of a marker left of centre", () => {
  assert.deepEqual(placePopover({ x: 100, y: 200 }, FIG, POP), { left: 114, top: 160, side: "right" });
});

test("placePopover opens left of a marker right of centre", () => {
  assert.deepEqual(placePopover({ x: 200, y: 200 }, FIG, POP), { left: 66, top: 160, side: "left" });
});

test("placePopover keeps the popover inside the figure vertically", () => {
  assert.equal(placePopover({ x: 100, y: 10 }, FIG, POP).top, 0);
  assert.equal(placePopover({ x: 100, y: 445 }, FIG, POP).top, 370);
});

test("placePopover clamps horizontally when the free side is too narrow", () => {
  const right = placePopover({ x: 150, y: 200 }, FIG, { width: 200, height: 80 });
  assert.equal(right.side, "right");
  assert.equal(right.left, 100);
  const left = placePopover({ x: 160, y: 200 }, FIG, { width: 250, height: 80 });
  assert.equal(left.side, "left");
  assert.equal(left.left, 0);
});

test("leaderPath is a straight segment", () => {
  assert.equal(leaderPath({ x: 10, y: 20 }, { x: 110, y: 60 }), "M 10 20 L 110 60");
});
