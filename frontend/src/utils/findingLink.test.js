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

test("placePopover falls back to below when the free side is too narrow", () => {
  const right = placePopover({ x: 150, y: 200 }, FIG, { width: 200, height: 80 });
  assert.deepEqual(right, { left: 50, top: 214, side: "below" });
  const left = placePopover({ x: 160, y: 200 }, FIG, { width: 250, height: 80 });
  assert.deepEqual(left, { left: 35, top: 214, side: "below" });
});

test("placePopover puts a centre marker's wide popover below it, centred and clamped", () => {
  const box = { width: 280, height: 420 };
  assert.deepEqual(placePopover({ x: 140, y: 100 }, box, { width: 200, height: 90 }), { left: 40, top: 114, side: "below" });
  // Off-centre but still too narrow on both sides: the centred left is clamped.
  assert.deepEqual(placePopover({ x: 120, y: 100 }, box, { width: 200, height: 90 }), { left: 20, top: 114, side: "below" });
  assert.equal(placePopover({ x: 30, y: 100 }, { width: 200, height: 420 }, { width: 200, height: 90 }).left, 0);
});

test("placePopover opens above a centre marker in the lower part of the box", () => {
  const box = { width: 280, height: 420 };
  assert.deepEqual(placePopover({ x: 140, y: 300 }, box, { width: 200, height: 90 }), { left: 40, top: 196, side: "above" });
  assert.equal(placePopover({ x: 140, y: 252 }, box, { width: 200, height: 90 }).side, "below");
  assert.equal(placePopover({ x: 140, y: 60 }, box, { width: 200, height: 90 }).top, 74);
  assert.equal(placePopover({ x: 140, y: 400 }, box, { width: 200, height: 90 }).top, 296);
});

test("placePopover keeps the side when the free space exactly fits", () => {
  // 300 - 86 - 14 = 200 free on the right.
  assert.deepEqual(placePopover({ x: 86, y: 200 }, FIG, { width: 200, height: 80 }), { left: 100, top: 160, side: "right" });
  // One pixel less no longer fits.
  assert.equal(placePopover({ x: 87, y: 200 }, FIG, { width: 200, height: 80 }).side, "below");
});

test("leaderPath is a straight segment", () => {
  assert.equal(leaderPath({ x: 10, y: 20 }, { x: 110, y: 60 }), "M 10 20 L 110 60");
});

test("placePopover uses a preferred side that fits even when the other side is larger", () => {
  // Marker right of centre: left is larger, but right still fits 120.
  assert.deepEqual(placePopover({ x: 160, y: 200 }, FIG, POP, 14, "right"), { left: 174, top: 160, side: "right" });
  // Marker left of centre: right is larger, but left still fits 120.
  assert.deepEqual(placePopover({ x: 140, y: 200 }, FIG, POP, 14, "left"), { left: 6, top: 160, side: "left" });
});

test("placePopover falls back to the existing rule when the preferred side does not fit", () => {
  // Right has 300 - 250 - 14 = 36 px: the larger left side is used.
  assert.deepEqual(placePopover({ x: 250, y: 200 }, FIG, POP, 14, "right"), placePopover({ x: 250, y: 200 }, FIG, POP));
  assert.equal(placePopover({ x: 250, y: 200 }, FIG, POP, 14, "right").side, "left");
  // Neither side fits a wide popover: below, as before.
  assert.equal(placePopover({ x: 150, y: 200 }, FIG, { width: 200, height: 80 }, 14, "left").side, "below");
});

test("placePopover without a preference keeps the larger-side rule", () => {
  assert.deepEqual(placePopover({ x: 160, y: 200 }, FIG, POP, 14, undefined), placePopover({ x: 160, y: 200 }, FIG, POP));
  assert.equal(placePopover({ x: 160, y: 200 }, FIG, POP, 14, undefined).side, "left");
});
