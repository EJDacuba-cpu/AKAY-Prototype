import test from "node:test";
import assert from "node:assert/strict";
import { PATIENT_LOADING_REASON, PROGRAM_CLASSIFICATIONS, lockProgramsWhilePatientLoads, programEnrollLabel, restoredClassification, getConsultationPrograms, getPrimaryProgram, toggleConsultationProgram } from "./consultationPrograms.js";
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

test("each service has its own enroll button label", () => {
  assert.equal(programEnrollLabel("Maternal"), "Include Maternal Care");
  assert.equal(programEnrollLabel("Maternal", { enrolled: false }), "Include Maternal Care");
  assert.equal(programEnrollLabel("Maternal", { enrolled: true }), "Continue Maternal Care");
  assert.equal(programEnrollLabel("Family Planning"), "Enroll to Family Planning");
  assert.equal(programEnrollLabel("EPI"), "Enroll to Child Health / EPI");
  assert.equal(programEnrollLabel("Something Else"), "Enroll");
});
