import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_PHASES, REVEAL_TIMINGS, phaseReached, revealPhaseAt } from "./revealSequence.js";

test("revealPhaseAt steps through the phases at the timing boundaries", () => {
  assert.equal(revealPhaseAt(-1), "idle");
  assert.equal(revealPhaseAt(Number.NaN), "idle");
  assert.equal(revealPhaseAt(Infinity), "idle");
  assert.equal(revealPhaseAt(0), "highlight");
  assert.equal(revealPhaseAt(149), "highlight");
  assert.equal(revealPhaseAt(150), "line");
  assert.equal(revealPhaseAt(449), "line");
  assert.equal(revealPhaseAt(450), "popover");
  assert.equal(revealPhaseAt(10000), "popover");
});

test("timings and phase order are as agreed", () => {
  assert.deepEqual(REVEAL_TIMINGS, { line: 150, popover: 450 });
  assert.deepEqual(REVEAL_PHASES, ["idle", "highlight", "line", "popover"]);
});

test("phaseReached compares phases by order", () => {
  assert.equal(phaseReached("line", "highlight"), true);
  assert.equal(phaseReached("line", "line"), true);
  assert.equal(phaseReached("highlight", "popover"), false);
  assert.equal(phaseReached("idle", "highlight"), false);
});
