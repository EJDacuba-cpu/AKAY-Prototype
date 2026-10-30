import test from "node:test";
import assert from "node:assert/strict";
import {
  DIAGNOSIS_LIMITS,
  addDiagnosis,
  getAddDiagnosisError,
  removeDiagnosis,
  formatDiagnoses,
  isDuplicateDiagnosisName,
  joinDiagnosisNames,
  normalizeDiagnoses,
  restoreDiagnoses,
} from "./diagnoses.js";

test("normalizeDiagnoses keeps RHU activate, nextAction and Manage to BHC fields", () => {
  const result = normalizeDiagnoses([
    {
      id: "a",
      name: "Hypertension",
      activate: true,
      nextAction: "manage_to_bhc",
      receivingBhcId: "4",
      monitoringRecommendation: "Weekly BP",
    },
    { id: "b", name: "URI", activate: false, nextAction: "none" },
  ]);
  assert.equal(result[0].activate, true);
  assert.equal(result[0].nextAction, "manage_to_bhc");
  assert.equal(result[0].receivingBhcId, "4");
  assert.equal(result[0].monitoringRecommendation, "Weekly BP");
  assert.equal(result[1].activate, false);
  assert.equal(result[1].nextAction, "none");
  assert.equal(result[1].manageToBhc, false);
});

test("normalizeDiagnoses drops blank names and never emits condition fields", () => {
  const result = normalizeDiagnoses([
    { id: "a", name: "  Asthma ", addToConditions: true, conditionStatus: "Controlled" },
    { id: "b", name: "Allergic rhinitis", carePlan: "recheck" },
    { id: "c", name: "   " },
  ]);
  assert.deepEqual(result, [
    { id: "a", name: "Asthma" },
    { id: "b", name: "Allergic rhinitis", carePlan: "recheck" },
  ]);
  assert.ok(result.every((item) => !("addToConditions" in item) && !("conditionStatus" in item)));
});

test("the plain-text diagnosis is the joined names", () => {
  const list = [
    { id: "a", name: "Asthma", addToConditions: true, conditionStatus: "Active" },
    { id: "b", name: "Allergic rhinitis" },
  ];
  assert.equal(joinDiagnosisNames(list), "Asthma; Allergic rhinitis");
  assert.equal(formatDiagnoses(list), "Asthma; Allergic rhinitis");
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
  assert.deepEqual(Object.keys(short.diagnoses[0]).sort(), ["id", "name"]);

  const long = "x".repeat(200);
  const moved = restoreDiagnoses({ diagnosis: long, assessmentNotes: "note" });
  assert.deepEqual(moved.diagnoses, []);
  assert.equal(moved.assessmentNotes, `${long}\n\nnote`);

  assert.deepEqual(restoreDiagnoses({}), { diagnoses: [], assessmentNotes: "" });
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

test("addDiagnosis appends a chip, keeping the text exactly as typed (trimmed)", () => {
  let list = addDiagnosis([], "  Asthma  ");
  list = addDiagnosis(list, "hypertension");
  list = addDiagnosis(list, "UTI");
  assert.deepEqual(list.map((item) => item.name), ["Asthma", "hypertension", "UTI"]);
  assert.ok(list.every((item) => item.id && !("addToConditions" in item) && !("conditionStatus" in item)));
  assert.equal(new Set(list.map((item) => item.id)).size, 3);
});

test("addDiagnosis starts the report choice at the caller's default", () => {
  assert.equal(addDiagnosis([], "Asthma")[0].reportAs, null);
  assert.equal(addDiagnosis([], "Asthma", "morbidity")[0].reportAs, "morbidity");
  assert.equal(addDiagnosis([], "Asthma", "bogus")[0].reportAs, null);
});

test("normalizeDiagnoses keeps reportAs only when the entry had it", () => {
  const [withChoice, withNull, without] = normalizeDiagnoses([
    { id: "a", name: "Dengue fever", reportAs: "notifiable" },
    { id: "b", name: "Asthma", reportAs: null },
    { id: "c", name: "Rhinitis" },
  ]);
  assert.equal(withChoice.reportAs, "notifiable");
  assert.equal(Object.hasOwn(withNull, "reportAs"), true);
  assert.equal(withNull.reportAs, null);
  assert.equal(Object.hasOwn(without, "reportAs"), false);
});

test("normalizeDiagnoses keeps reportIn as a canonical list", () => {
  const [withIn, empty, without] = normalizeDiagnoses([
    { id: "a", name: "Dengue", reportIn: ["surveillance", "morbidity", "bogus"] },
    { id: "b", name: "Cough", reportIn: [] },
    { id: "c", name: "Rhinitis", reportAs: null },
  ]);
  assert.deepEqual(withIn.reportIn, ["morbidity", "surveillance"]);
  assert.deepEqual(empty.reportIn, []);
  assert.equal(Object.hasOwn(without, "reportIn"), false);
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

test("removeDiagnosis drops only that chip", () => {
  const list = [{ id: "a", name: "Asthma" }, { id: "b", name: "UTI" }];
  assert.deepEqual(removeDiagnosis(list, "a"), [{ id: "b", name: "UTI" }]);
});

test("normalizeDiagnoses keeps care plan and surveillance choices", () => {
  const [entry] = normalizeDiagnoses([{ id: "d1", name: "HFMD", carePlan: "follow_up", includeInSurveillance: true }]);
  assert.equal(entry.carePlan, "follow_up");
  assert.equal(entry.includeInSurveillance, true);
  // A stored legacy value is still read back as stored.
  const [legacy] = normalizeDiagnoses([{ id: "d3", name: "HTN", carePlan: "monitor" }]);
  assert.equal(legacy.carePlan, "monitor");
  const [plain] = normalizeDiagnoses([{ id: "d2", name: "Cough", carePlan: "bogus" }]);
  assert.equal(Object.hasOwn(plain, "carePlan"), false);
});

test("normalizeDiagnoses keeps bhcFollowUp on a referral only", () => {
  const [referred] = normalizeDiagnoses([{ id: "d1", name: "Pneumonia", carePlan: "refer", bhcFollowUp: true }]);
  assert.equal(referred.bhcFollowUp, true);
  const [followUp] = normalizeDiagnoses([{ id: "d2", name: "Wound", carePlan: "follow_up", bhcFollowUp: true }]);
  assert.equal(Object.hasOwn(followUp, "bhcFollowUp"), false);
  const [none] = normalizeDiagnoses([{ id: "d3", name: "Cough", carePlan: "none", bhcFollowUp: true }]);
  assert.equal(Object.hasOwn(none, "bhcFollowUp"), false);
  const [unflagged] = normalizeDiagnoses([{ id: "d4", name: "TB", carePlan: "refer" }]);
  assert.equal(Object.hasOwn(unflagged, "bhcFollowUp"), false);
  const [falsy] = normalizeDiagnoses([{ id: "d5", name: "TB", carePlan: "refer", bhcFollowUp: false }]);
  assert.equal(Object.hasOwn(falsy, "bhcFollowUp"), false);
});
