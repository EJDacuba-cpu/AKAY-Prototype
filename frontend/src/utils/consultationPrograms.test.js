import test from "node:test";
import assert from "node:assert/strict";
import { PROGRAM_CLASSIFICATIONS, restoredClassification, getConsultationPrograms, getPrimaryProgram, toggleConsultationProgram } from "./consultationPrograms.js";
import { getSpecializedRecordPrograms, getServiceTypeLabel } from "./healthRecordPrograms.js";

test("removing the primary selects a remaining program without losing the others", () => {
  assert.deepEqual(toggleConsultationProgram(["Maternal", "EPI"], "Maternal", "Maternal"), { selectedPrograms: ["EPI"], primaryProgram: "EPI" });
  assert.deepEqual(toggleConsultationProgram(["Maternal"], "Maternal", "EPI"), { selectedPrograms: ["Maternal", "EPI"], primaryProgram: "Maternal" });
});

test("server metadata restores primary and all selected programs", () => {
  const record = { category: "Maternal", monitoring_data: { selectedPrograms: ["Maternal", "EPI"], primaryProgram: "EPI" } };
  assert.deepEqual(getConsultationPrograms(record), ["Maternal", "EPI"]);
  assert.equal(getPrimaryProgram(record), "EPI");
  assert.deepEqual(getSpecializedRecordPrograms([record]).map(program => program.key), ["epi", "maternal"]);
});

test("the selectable programs", () => {
  assert.deepEqual(Object.keys(PROGRAM_CLASSIFICATIONS), ["Maternal", "Family Planning", "EPI"]);
});

test("legacy classifications still work and explicit general visits stay general", () => {
  assert.deepEqual(getConsultationPrograms({ category: "Family Planning" }), ["Family Planning"]);
  assert.deepEqual(getConsultationPrograms({ category: "General Consultation", selectedPrograms: [] }), []);
});

test("a stale removed program is ignored, never shown", () => {
  const record = { id: 42, category: "Maternal", monitoring_data: { selectedPrograms: ["Maternal", "Hypertension", "Diabetes"] } };
  assert.deepEqual(getConsultationPrograms(record), ["Maternal"]);
  assert.equal(getServiceTypeLabel(record), "Maternal / Prenatal");
  assert.equal(getSpecializedRecordPrograms([record]).length, 1);
  assert.deepEqual(getConsultationPrograms({ category: "Hypertension / Diabetic Monitoring" }), []);
});

test("a restored draft with a removed classification follows its remaining primary", () => {
  assert.equal(restoredClassification("Hypertension / Diabetic Monitoring", "Maternal"), "Maternal");
  assert.equal(restoredClassification("Hypertension / Diabetic Monitoring", ""), "General Consultation");
  assert.equal(restoredClassification("TB DOTS / TB Monitoring", ""), "General Consultation");
  assert.equal(restoredClassification("General Consultation", ""), "General Consultation");
});

test("TB is no longer a consultation program", () => {
  assert.deepEqual(Object.keys(PROGRAM_CLASSIFICATIONS), ["Maternal", "Family Planning", "EPI"]);
  assert.deepEqual(getConsultationPrograms({ selectedPrograms: ["TB", "EPI"] }), ["EPI"]);
});
