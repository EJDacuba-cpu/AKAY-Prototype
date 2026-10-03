import test from "node:test";
import assert from "node:assert/strict";
import { DOT_POSITIONS, FIGURE_KEYS, getFigureKey, markerStyle } from "./bodyFigureGeometry.js";
import { BODY_REGIONS } from "./bodyFindings.js";

const SIDES = ["front", "back"];

test("every figure/side has a normalized position for every region", () => {
  for (const figure of FIGURE_KEYS) {
    for (const side of SIDES) {
      for (const { key } of BODY_REGIONS) {
        const position = DOT_POSITIONS[figure]?.[side]?.[key];
        assert.ok(Array.isArray(position), `missing ${figure}.${side}.${key}`);
        const [x, y] = position;
        assert.ok(Number.isFinite(x) && x >= 0 && x <= 1, `${figure}.${side}.${key} x out of range`);
        assert.ok(Number.isFinite(y) && y >= 0 && y <= 1, `${figure}.${side}.${key} y out of range`);
      }
    }
  }
});

test("patient's right is on the viewer's left from the front and right from the back", () => {
  for (const figure of FIGURE_KEYS) {
    const { front, back } = DOT_POSITIONS[figure];
    for (const limb of ["arm", "leg", "hand", "foot"]) {
      const right = `right_${limb}`;
      const left = `left_${limb}`;
      assert.ok(front[right][0] < 0.5 && 0.5 < front[left][0], `${figure} front ${limb}`);
      assert.ok(back[left][0] < 0.5 && 0.5 < back[right][0], `${figure} back ${limb}`);
    }
  }
});

test("getFigureKey picks female only for a Female sex", () => {
  assert.equal(getFigureKey("Female"), "female");
  assert.equal(getFigureKey(" female "), "female");
  assert.equal(getFigureKey("Male"), "male");
  assert.equal(getFigureKey("Other"), "male");
  assert.equal(getFigureKey(""), "male");
  assert.equal(getFigureKey(undefined), "male");
});

test("markerStyle converts a normalized position to CSS percentages", () => {
  assert.deepEqual(markerStyle([0.25, 0.5]), { left: "25%", top: "50%" });
});
