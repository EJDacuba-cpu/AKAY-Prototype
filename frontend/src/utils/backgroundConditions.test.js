import test from "node:test";
import assert from "node:assert/strict";

import { backgroundConditionGroups } from "./backgroundConditions.js";
import { groupMedicalConditions } from "./medicalConditions.js";

const registry = {
  monitored_conditions: {
    hypertension: { name: "Hypertension", aliases: ["HTN"] },
    diabetes_mellitus: { name: "Diabetes Mellitus", aliases: ["DM"] },
  },
};
const hypertension = {
  id: 1,
  conditionName: "Hypertension",
  conditionIdentity: "hypertension",
  status: "active",
  confirmedAt: "2026-10-01",
  monitoring: { id: 4, startedAt: "2026-10-03" },
};
const diseases = [
  { name: "HTN", status: "Active", source: "Consultation", conditionKey: "hypertension" },
  { name: "Gastritis", status: "Resolved", source: "Consultation", conditionKey: null },
  { name: "Migraine", note: "since 2020", source: "Patient-reported", status: null },
];
const followedHtn = { id: 4, conditionName: "Hypertension", conditionKey: "hypertension", startedAt: "2026-10-03" };

test("groups come from groupMedicalConditions", () => {
  const input = { diseases, conditions: [hypertension], legacyMonitorings: [], registry };
  const groups = backgroundConditionGroups(input);
  const expected = groupMedicalConditions({ conditions: [hypertension], currentDiseases: diseases });

  assert.deepEqual(groups.confirmed.map((c) => c.conditionName), expected.confirmed.map((c) => c.conditionName));
  assert.deepEqual(groups.patientReported, expected.patientReported);
  assert.deepEqual(groups.underEvaluation, expected.underEvaluation);
  assert.deepEqual(groups.past, expected.past);
});

test("only patient-reported entries are listed from the background; consultation entries are not", () => {
  const { confirmed, patientReported } = backgroundConditionGroups({ diseases, conditions: [hypertension], registry });
  assert.equal(confirmed.length, 1);
  assert.deepEqual(patientReported.map((d) => d.name), ["Migraine"]);
});

test("a condition followed in this visit is flagged addressed, others are not", () => {
  const dm = { id: 2, conditionName: "Diabetes Mellitus", conditionIdentity: "diabetes_mellitus", status: "controlled" };
  const { confirmed } = backgroundConditionGroups({
    diseases,
    conditions: [hypertension, dm],
    followed: [followedHtn],
    registry,
  });
  assert.deepEqual(confirmed.map((c) => [c.conditionName, c.addressed]), [
    ["Hypertension", true],
    ["Diabetes Mellitus", false],
  ]);
});

test("a followed legacy monitoring is flagged addressed", () => {
  const legacy = { id: 4, conditionName: "Hypertension", conditionIdentity: "hypertension", startedAt: "2026-09-01" };
  const { confirmed, legacyPending } = backgroundConditionGroups({
    legacyMonitorings: [legacy],
    followed: [followedHtn],
    registry,
  });
  assert.deepEqual(confirmed, []);
  assert.deepEqual(legacyPending.map((c) => [c.kind, c.addressed]), [["legacy-monitoring", true]]);
});

test("nothing documented leaves every group empty", () => {
  assert.deepEqual(backgroundConditionGroups({ registry }), {
    confirmed: [],
    legacyPending: [],
    underEvaluation: [],
    patientReported: [],
    past: [],
  });
});
