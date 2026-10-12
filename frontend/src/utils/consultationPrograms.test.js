import test from "node:test";
import assert from "node:assert/strict";
import { PATIENT_LOADING_REASON, PROGRAM_CLASSIFICATIONS, lockProgramsWhilePatientLoads, programFormActionLabel, restoredClassification, getConsultationPrograms, getPrimaryProgram, toggleConsultationProgram } from "./consultationPrograms.js";
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

test("every service is disabled while the patient is still loading", () => {
  const programs = [
    { key: "Maternal", disabled: false, disabledReason: "" },
    { key: "EPI", disabled: true, disabledReason: "Adult" },
  ];
  const locked = lockProgramsWhilePatientLoads(programs, true);
  assert.ok(locked.every((program) => program.disabled));
  assert.ok(locked.every((program) => program.disabledReason === PATIENT_LOADING_REASON));
  assert.ok(locked.every((program) => program.disabledNote === PATIENT_LOADING_REASON));
});

test("once the patient has loaded, eligibility is left exactly as computed", () => {
  const programs = [{ key: "Maternal", disabled: true, disabledReason: "Male patient" }];
  assert.equal(lockProgramsWhilePatientLoads(programs, false), programs);
});

test("the service form button says what the worker does next", () => {
  assert.equal(programFormActionLabel("Maternal", "Not Started"), "Fill up Prenatal form");
  assert.equal(programFormActionLabel("Maternal", "Incomplete"), "Continue Prenatal form");
  assert.equal(programFormActionLabel("Maternal", "Completed"), "Edit Prenatal form");
  assert.equal(programFormActionLabel("Family Planning", "Not Started"), "Fill up Family Planning form");
  assert.equal(programFormActionLabel("Family Planning", "Completed"), "Edit Family Planning form");
  assert.equal(programFormActionLabel("EPI", "Incomplete"), "Continue Child Health / EPI form");
});

test("an unknown status or service still gets a usable label", () => {
  assert.equal(programFormActionLabel("Maternal", undefined), "Fill up Prenatal form");
  assert.equal(programFormActionLabel("Something Else", "Not Started"), "Fill up form");
});
