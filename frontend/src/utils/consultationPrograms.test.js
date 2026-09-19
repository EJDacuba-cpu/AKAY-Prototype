import test from "node:test";
import assert from "node:assert/strict";
import { getConsultationPrograms, getPrimaryProgram, toggleConsultationProgram } from "./consultationPrograms.js";
import { getSpecializedRecordPrograms } from "./healthRecordPrograms.js";

test("removing the primary selects a remaining program without losing the others", () => {
  assert.deepEqual(toggleConsultationProgram(["Maternal", "TB"], "Maternal", "Maternal"), { selectedPrograms: ["TB"], primaryProgram: "TB" });
  assert.deepEqual(toggleConsultationProgram(["Maternal"], "Maternal", "TB"), { selectedPrograms: ["Maternal", "TB"], primaryProgram: "Maternal" });
});

test("server metadata restores primary and all selected programs", () => {
  const record = { category: "Maternal", monitoring_data: { selectedPrograms: ["Maternal", "TB"], primaryProgram: "TB" } };
  assert.deepEqual(getConsultationPrograms(record), ["Maternal", "TB"]);
  assert.equal(getPrimaryProgram(record), "TB");
  assert.deepEqual(getSpecializedRecordPrograms([record]).map(program => program.key), ["maternal", "tb"]);
});

test("legacy classifications still work and explicit general visits stay general", () => {
  assert.deepEqual(getConsultationPrograms({ category: "Family Planning" }), ["Family Planning"]);
  assert.deepEqual(getConsultationPrograms({ category: "Hypertension / Diabetic Monitoring", hypertensionDiabeticData: { conditionType: "both" } }), ["Hypertension", "Diabetes"]);
  assert.deepEqual(getConsultationPrograms({ category: "General Consultation", selectedPrograms: [] }), []);
});
