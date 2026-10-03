import test from "node:test";
import assert from "node:assert/strict";
import { DOT_POSITIONS, FIGURE_SHAPES, FIGURE_VIEWBOX } from "./bodyFigureGeometry.js";
import { BODY_REGIONS } from "./bodyFindings.js";

test("every BODY_REGIONS key has a dot position inside the viewBox", () => {
  for (const { key } of BODY_REGIONS) {
    const position = DOT_POSITIONS[key];
    assert.ok(Array.isArray(position), `missing dot position for ${key}`);
    const [x, y] = position;
    assert.ok(Number.isFinite(x) && x >= 0 && x <= FIGURE_VIEWBOX.width, `${key} x out of range`);
    assert.ok(Number.isFinite(y) && y >= 0 && y <= FIGURE_VIEWBOX.height, `${key} y out of range`);
  }
  assert.deepEqual(FIGURE_VIEWBOX, { width: 200, height: 400 });
  assert.equal(FIGURE_SHAPES.length, 9);
});
