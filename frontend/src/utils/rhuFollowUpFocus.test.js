import test from "node:test";
import assert from "node:assert/strict";

import { focusedRhuFollowUp, focusedRhuFollowUps } from "./rhuFollowUpFocus.js";

const HTN = { id: 11, conditionName: "Hypertension", status: "active", conditionIdentity: "hypertension" };
const DM = { id: 12, conditionName: "Diabetes Mellitus", status: "active", conditionIdentity: "diabetes_mellitus" };
const ASTHMA = { id: 13, conditionName: "Asthma", status: "controlled", conditionIdentity: "name:asthma" };

test("a scheduled RHU follow-up focuses only the associated condition", () => {
  const result = focusedRhuFollowUp({
    task: { id: 9, purposeKey: "entry:dx-htn", purpose: "Hypertension review", healthRecordId: 31 },
    parentRecord: {
      id: 31,
      diagnoses: [{ id: "dx-htn", name: "Hypertension" }, { id: "dx-uri", name: "URI" }],
    },
    conditions: [HTN, DM, ASTHMA],
  });
  assert.equal(result.focused?.name, "Hypertension");
  assert.equal(result.focused?.continued, true);
  assert.equal(result.focused?.activate, false);
  assert.deepEqual(result.references.map((item) => item.conditionName), ["Diabetes Mellitus", "Asthma"]);
});

test("other Active conditions stay references and are not auto-included", () => {
  const result = focusedRhuFollowUp({
    task: { id: 9, purposeKey: "entry:dx-dm", healthRecordId: 4 },
    parentRecord: { id: 4, diagnoses: [{ id: "dx-dm", name: "Diabetes Mellitus" }] },
    conditions: [HTN, DM],
  });
  assert.equal(result.diagnoses.length, 1);
  assert.equal(result.diagnoses[0].name, "Diabetes Mellitus");
  assert.equal(result.references[0].conditionName, "Hypertension");
});

test("matching an already confirmed identity does not create a new confirmation", () => {
  const result = focusedRhuFollowUp({
    task: { purposeKey: "entry:a", purpose: "Hypertension" },
    parentRecord: { diagnoses: [{ id: "a", name: "Hypertension" }] },
    conditions: [HTN],
  });
  assert.equal(result.focused.continuedConditionId, 11);
  assert.equal(result.focused.activate, false);
});

test("without a follow-up task the visit does not grab an unrelated pending task", () => {
  const result = focusedRhuFollowUp({
    task: null,
    parentRecord: null,
    conditions: [HTN, DM],
  });
  assert.equal(result.focused, null);
  assert.deepEqual(result.diagnoses, []);
  assert.equal(result.linkedTaskId, null);
});

test("multiple selected follow-ups focus only those concerns and leave the rest as references", () => {
  const result = focusedRhuFollowUps({
    tasks: [
      { id: 9, purposeKey: "entry:dx-htn", purpose: "Hypertension review", healthRecordId: 31 },
      { id: 10, purposeKey: "entry:dx-dm", purpose: "Diabetes review", healthRecordId: 32 },
    ],
    parentRecords: [
      { id: 31, diagnoses: [{ id: "dx-htn", name: "Hypertension" }] },
      { id: 32, diagnoses: [{ id: "dx-dm", name: "Diabetes Mellitus" }] },
    ],
    conditions: [HTN, DM, ASTHMA],
  });
  assert.deepEqual(result.linkedTaskIds, [9, 10]);
  assert.deepEqual(result.diagnoses.map((item) => item.name), ["Hypertension", "Diabetes Mellitus"]);
  assert.deepEqual(result.references.map((item) => item.conditionName), ["Asthma"]);
});
