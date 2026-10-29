import assert from "node:assert/strict";
import test from "node:test";

import { getEpiCompletionState, getEpiCode } from "./epiTracking.js";

const DOB = "2026-01-01";

test("an infant is not incomplete because HPV is missing", () => {
  const history = new Map(
    ["BCG", "HEPA B"].map((label) => [getEpiCode(label), { vaccineName: label }]),
  );
  const state = getEpiCompletionState(history, [], { birthDate: DOB, visitDate: "2026-01-01" });
  assert.equal(state.remainingItems.some((item) => item.label === "HPV"), false);
  assert.equal(state.completeAfterSave, true);
});

test("a filtered 4-month checklist is not complete until applicable doses are given", () => {
  const state = getEpiCompletionState(new Map(), [{ vaccineName: "BCG" }, { vaccineName: "HEPA B" }], {
    birthDate: DOB,
    visitDate: "2026-05-01",
  });
  assert.equal(state.completeAfterSave, false);
  assert.ok(state.remainingItems.some((item) => item.label === "OPV 1"));
  assert.equal(state.remainingItems.some((item) => item.label === "HPV"), false);
  assert.equal(state.remainingItems.some((item) => item.label === "MCV 1"), false);
});

test("historical doses count toward completion and this-visit selections do not duplicate them", () => {
  const history = new Map([[getEpiCode("OPV 1"), { vaccineName: "OPV 1", dateGiven: "2026-03-01" }]]);
  const state = getEpiCompletionState(history, [{ vaccineName: "OPV 1" }, { vaccineName: "PENTA 1" }], {
    birthDate: DOB,
    visitDate: "2026-05-01",
  });
  assert.equal(state.alreadyGivenCodes.has(getEpiCode("OPV 1")), true);
  assert.equal(state.selectedCodes.has(getEpiCode("PENTA 1")), true);
  assert.equal(state.remainingItems.some((item) => item.label === "OPV 1"), false);
});
