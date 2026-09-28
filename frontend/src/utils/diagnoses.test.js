import test from "node:test";
import assert from "node:assert/strict";
import {
  DIAGNOSIS_LIMITS,
  DIAGNOSIS_SUGGESTIONS,
  addDiagnosis,
  getAddDiagnosisError,
  removeDiagnosis,
  toggleDiagnosisCondition,
  filterDiagnosisSuggestions,
  findCurrentCondition,
  formatDiagnoses,
  isDuplicateDiagnosisName,
  joinDiagnosisNames,
  normalizeDiagnoses,
  restoreDiagnoses,
} from "./diagnoses.js";

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

test("filterDiagnosisSuggestions only offers the supported NCD conditions, plain contains match", () => {
  assert.deepEqual(filterDiagnosisSuggestions(""), DIAGNOSIS_SUGGESTIONS);
  assert.deepEqual(filterDiagnosisSuggestions("  "), DIAGNOSIS_SUGGESTIONS);
  assert.deepEqual(filterDiagnosisSuggestions("hyper"), ["Hypertension"]);
  assert.deepEqual(filterDiagnosisSuggestions("DIABETES"), ["Diabetes Mellitus"]);
  // A typo gets no fuzzy match - this is a plain substring filter.
  assert.deepEqual(filterDiagnosisSuggestions("hypertansion"), []);
  assert.deepEqual(filterDiagnosisSuggestions("asthma"), []);
});

test("findCurrentCondition matches ignoring case and extra spaces, never invents one", () => {
  const conditions = [{ name: "Hypertension", status: "Controlled" }];
  assert.equal(findCurrentCondition(conditions, "  hypertension  ")?.status, "Controlled");
  assert.equal(findCurrentCondition(conditions, "Diabetes Mellitus"), null);
  assert.equal(findCurrentCondition([], "Hypertension"), null);
  assert.equal(findCurrentCondition(conditions, ""), null);
});

test("isDuplicateDiagnosisName flags a same-consultation repeat, ignoring case/spaces, and skips the entry being edited", () => {
  const list = [
    { id: "a", name: "Asthma" },
    { id: "b", name: "Hypertension" },
  ];
  assert.equal(isDuplicateDiagnosisName(list, "  asthma "), true);
  assert.equal(isDuplicateDiagnosisName(list, "UTI"), false);
  // Editing "a" itself is not a duplicate of itself.
  assert.equal(isDuplicateDiagnosisName(list, "Asthma", "a"), false);
});

test("addDiagnosis appends a chip, keeping manual text exactly and structured names in their one spelling", () => {
  let list = addDiagnosis([], "  Asthma  ");
  list = addDiagnosis(list, "hypertension");
  list = addDiagnosis(list, "UTI");
  assert.deepEqual(list.map((item) => item.name), ["Asthma", "Hypertension", "UTI"]);
  assert.ok(list.every((item) => item.id && item.addToConditions === false && item.conditionStatus === null));
  assert.equal(new Set(list.map((item) => item.id)).size, 3);
});

test("a duplicate, blank or over-limit diagnosis is not added and says why", () => {
  const list = addDiagnosis([], "Pneumonia");
  assert.equal(getAddDiagnosisError(list, "  pneumonia "), "duplicate");
  assert.equal(addDiagnosis(list, "PNEUMONIA"), list);
  assert.equal(getAddDiagnosisError(list, "   "), "empty");
  assert.equal(addDiagnosis(list, ""), list);
  const full = Array.from({ length: DIAGNOSIS_LIMITS.count }, (_, i) => ({ id: `d${i}`, name: `Dx ${i}` }));
  assert.equal(getAddDiagnosisError(full, "Asthma"), "full");
  assert.equal(getAddDiagnosisError(list, "Asthma"), null);
});

test("the star toggles one chip in and out of Current Conditions, always as Active", () => {
  const list = [
    { id: "a", name: "Asthma", addToConditions: false, conditionStatus: null },
    { id: "b", name: "UTI", addToConditions: false, conditionStatus: null },
  ];
  const on = toggleDiagnosisCondition(list, "a");
  assert.deepEqual(on[0], { id: "a", name: "Asthma", addToConditions: true, conditionStatus: "Active" });
  assert.equal(on[1], list[1]);
  assert.deepEqual(toggleDiagnosisCondition(on, "a")[0], list[0]);
});

test("removeDiagnosis drops only that chip", () => {
  const list = [{ id: "a", name: "Asthma" }, { id: "b", name: "UTI" }];
  assert.deepEqual(removeDiagnosis(list, "a"), [{ id: "b", name: "UTI" }]);
});
