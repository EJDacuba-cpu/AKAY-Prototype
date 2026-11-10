import assert from "node:assert/strict";
import test from "node:test";
import { evidenceOptions, laboratoryErrors, newLaboratoryTest, restoreLaboratoryTests } from "./laboratoryTests.js";
import { normalizeDiagnoses } from "./diagnoses.js";
import { diagnosesForRhuSave, restoreRhuDiagnoses, rhuCarePlanErrors } from "./rhuCarePlan.js";
import { getErrorOwnerStepKey, remapServerErrorKeys } from "./consultationSteps.js";
import { mapCareOverview } from "./careOverview.js";
import { activeMonitoringsFromOverview } from "./continuedCare.js";

test("repeated test names keep independent identities through a draft round trip", () => {
  const tests = [newLaboratoryTest(), newLaboratoryTest()].map(entry => ({ ...entry, testName: "CBC" }));
  assert.notEqual(tests[0].id, tests[1].id);
  const restored = restoreLaboratoryTests(JSON.parse(JSON.stringify({ laboratoryTests: tests })));
  assert.deepEqual(restored, tests);
  restored[0].result = "Edited result";
  assert.equal(tests[0].result, "");
  assert.equal(restored[1].result, "");
  assert.deepEqual(restoreLaboratoryTests({}), []);
});

test("Requested and Awaiting Result permit blank results; Result Available requires one", () => {
  const test = { ...newLaboratoryTest(), testName: "Any diagnostic test" };
  assert.deepEqual(laboratoryErrors([test, { ...test, id: crypto.randomUUID(), resultStatus: "Awaiting Result" }]), {});
  assert.ok(laboratoryErrors([{ ...test, resultStatus: "Result Available" }])["laboratoryTests.0.result"]);
  assert.deepEqual(laboratoryErrors([{ ...test, resultStatus: "Result Available", result: "Free text result" }]), {});
  assert.ok(laboratoryErrors([{ ...test, testName: " " }])["laboratoryTests.0.testName"]);
});

test("evidence references stay distinct across current and historical visits", () => {
  const current = { ...newLaboratoryTest(), testName: "CBC" };
  const historical = { ...current, recordId: 7, version: 9 };
  const options = evidenceOptions([current], [historical]);
  assert.equal(options[0].reference, `current:${current.id}`);
  assert.equal(options[1].reference, "record:7");
  assert.equal(options[1].version, 9);
});

test("selected evidence, pinned versions and attachment references survive normalization, resume and save", () => {
  const diagnosis = { id: "d1", name: "Hypertension", activate: true, nextAction: "manage_to_bhc", receivingBhcId: "2", monitoringRecommendation: "Monitor",
    laboratoryEvidence: [{ reference: "record:5", version: 8, attachmentIds: [crypto.randomUUID()] }], laboratoryEvidenceConfirmed: true };
  const normalized = normalizeDiagnoses([diagnosis]);
  const restored = restoreRhuDiagnoses({ diagnoses: normalized });
  const saved = diagnosesForRhuSave(restored);
  assert.deepEqual(saved[0].laboratoryEvidence, diagnosis.laboratoryEvidence);
  assert.equal(saved[0].laboratoryEvidenceConfirmed, true);
  assert.equal(rhuCarePlanErrors([{ ...diagnosis, laboratoryEvidenceConfirmed: false }])["diagnoses.d1.laboratoryEvidenceConfirmed"], "Confirm the selected laboratory evidence before sharing.");
  assert.equal(diagnosesForRhuSave([{ ...diagnosis, nextAction: "none" }])[0].laboratoryEvidence, undefined);
});

test("supporting laboratory tests stay independent of BHC sharing and survive save for any diagnosis", () => {
  const sharedRef = { reference: "record:5", version: 8, attachmentIds: [crypto.randomUUID()] };
  const support = [{ reference: "current:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }, { reference: "record:9" }];
  const hypertension = {
    id: "d1", name: "Hypertension", activate: true, nextAction: "none",
    supportingLaboratoryTests: support,
  };
  const managed = {
    id: "d2", name: "Diabetes", activate: true, nextAction: "manage_to_bhc",
    receivingBhcId: "2", monitoringRecommendation: "Monitor sugar",
    supportingLaboratoryTests: [{ reference: "record:9" }],
    laboratoryEvidence: [sharedRef], laboratoryEvidenceConfirmed: true,
  };
  const freeText = {
    id: "d3", name: "Cough for evaluation", activate: false, nextAction: "rhu_follow_up",
    supportingLaboratoryTests: [{ reference: "record:9" }],
  };
  const saved = diagnosesForRhuSave([hypertension, managed, freeText]);
  assert.deepEqual(saved[0].supportingLaboratoryTests, support);
  assert.equal(saved[0].laboratoryEvidence, undefined);
  assert.deepEqual(saved[1].supportingLaboratoryTests, [{ reference: "record:9" }]);
  assert.deepEqual(saved[1].laboratoryEvidence, [sharedRef]);
  assert.deepEqual(saved[2].supportingLaboratoryTests, [{ reference: "record:9" }]);
  assert.deepEqual(normalizeDiagnoses([hypertension])[0].supportingLaboratoryTests, support);
  assert.deepEqual(restoreRhuDiagnoses({ diagnoses: saved })[1].supportingLaboratoryTests, [{ reference: "record:9" }]);
});

test("laboratory server errors return to Physical Examination and map to editable fields", () => {
  assert.equal(getErrorOwnerStepKey("laboratoryTests.2.result", { workflow: "rhu_itr_v1" }), "assessment");
  assert.equal(getErrorOwnerStepKey("laboratory_tests.2.result", { workflow: "rhu_itr_v1" }), "assessment");
  assert.deepEqual(remapServerErrorKeys({ "laboratory_tests.2.result": "Required" }), { "laboratoryTests.2.result": "Required" });
});

test("associated condition IDs survive both scheduled and unscheduled monitoring paths", () => {
  const overview = mapCareOverview({ pending_follow_ups: [{ id: 1, conditions: [{ monitoring_id: 2, condition_id: 8, condition_name: "Asthma" }] }],
    monitoring_without_follow_up: [{ id: 3, condition_id: 9, condition_name: "Hypertension" }] });
  assert.deepEqual(activeMonitoringsFromOverview(overview).map(row => row.conditionId).sort(), [8, 9]);
});
