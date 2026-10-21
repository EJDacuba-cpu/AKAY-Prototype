import test from "node:test";
import assert from "node:assert/strict";
import { createSubmitGate } from "./medicineSubmitGate.js";

test("a rapid second begin is rejected until the first attempt ends", () => {
  const gate = createSubmitGate();

  assert.equal(gate.begin(), true);
  assert.equal(gate.begin(), false);
  assert.equal(gate.begin(), false);
  assert.equal(gate.locked, true);

  gate.end();
  assert.equal(gate.locked, false);
  assert.equal(gate.begin(), true);
});
