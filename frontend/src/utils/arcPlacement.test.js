import assert from "node:assert/strict";
import test from "node:test";

import { arcPosition, evenSpreadArc } from "./arcPlacement.js";

test("an item at angle 0 sits straight left of the figure centre, on the centre line", () => {
  const { left, top } = arcPosition(0, 4);
  assert.equal(left, "calc(50cqw - (var(--figure-s) / 3 + 4rem) * 1.000)");
  assert.equal(top, "calc(44cqh + (var(--figure-s) / 3 + 4rem) * 0.000)");
});

test("negative angles sit above the centre line and positive angles below it", () => {
  assert.match(arcPosition(-40, 4).top, /\* -0\.643\)$/);
  assert.match(arcPosition(40, 4).top, /\* 0\.643\)$/);
});

test("items away from the horizontal tuck closer to the figure than the middle one", () => {
  assert.match(arcPosition(40, 4).left, /\* 0\.766\)$/);
});

test("the centre line can be moved", () => {
  assert.match(arcPosition(0, 1, "50cqh").top, /^calc\(50cqh \+/);
});

test("evenSpreadArc places three controls evenly between the existing clinical angles", () => {
  const positions = evenSpreadArc(3, { minAngle: -22, maxAngle: 22, offsetRem: 3.5 });
  assert.equal(positions.length, 3);
  assert.deepEqual(positions[0], arcPosition(-22, 3.5));
  assert.deepEqual(positions[1], arcPosition(0, 3.5));
  assert.deepEqual(positions[2], arcPosition(22, 3.5));
});

test("evenSpreadArc returns no positions for an empty curve", () => {
  assert.deepEqual(evenSpreadArc(0), []);
});
