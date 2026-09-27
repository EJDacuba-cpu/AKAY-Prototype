import test from "node:test";
import assert from "node:assert/strict";
import { formatDiagnoses, joinDiagnosisNames, normalizeDiagnoses, restoreDiagnoses } from "./diagnoses.js";

test("normalizeDiagnoses drops blank names and only keeps a status when added to conditions", () => {
  const result = normalizeDiagnoses([
    { id: "a", name: "  Asthma ", addToConditions: true, conditionStatus: "Controlled" },
    { id: "b", name: "Allergic rhinitis", addToConditions: false, conditionStatus: "Active" },
    { id: "c", name: "   " },
    { id: "d", name: "Hypertension", addToConditions: true, conditionStatus: "Monitoring" },
  ]);
  assert.deepEqual(result, [
    { id: "a", name: "Asthma", addToConditions: true, conditionStatus: "Controlled" },
    { id: "b", name: "Allergic rhinitis", addToConditions: false, conditionStatus: null },
    { id: "d", name: "Hypertension", addToConditions: true, conditionStatus: "Active" },
  ]);
});

test("the plain-text diagnosis is the joined names", () => {
  const list = [
    { id: "a", name: "Asthma", addToConditions: true, conditionStatus: "Active" },
    { id: "b", name: "Allergic rhinitis" },
  ];
  assert.equal(joinDiagnosisNames(list), "Asthma; Allergic rhinitis");
  assert.equal(formatDiagnoses(list), "Asthma (Current Conditions: Active); Allergic rhinitis");
  assert.equal(joinDiagnosisNames([]), "");
});

test("restoreDiagnoses keeps structured drafts as they are", () => {
  const restored = restoreDiagnoses({
    diagnoses: [{ id: "a", name: "Asthma" }],
    diagnosis: "Asthma",
    assessmentNotes: "Mild",
  });
  assert.equal(restored.diagnoses.length, 1);
  assert.equal(restored.assessmentNotes, "Mild");
});

test("restoreDiagnoses keeps legacy free text without rewording it", () => {
  const short = restoreDiagnoses({ diagnosis: "Acute gastroenteritis" });
  assert.equal(short.diagnoses.length, 1);
  assert.equal(short.diagnoses[0].name, "Acute gastroenteritis");
  assert.equal(short.diagnoses[0].addToConditions, false);

  const long = "x".repeat(200);
  const moved = restoreDiagnoses({ diagnosis: long, assessmentNotes: "note" });
  assert.deepEqual(moved.diagnoses, []);
  assert.equal(moved.assessmentNotes, `${long}\n\nnote`);

  assert.deepEqual(restoreDiagnoses({}), { diagnoses: [], assessmentNotes: "" });
});
