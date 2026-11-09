import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDiagnoses, restoreDiagnoses } from "./diagnoses.js";
import { diagnosesForRhuSave, restoreRhuDiagnoses } from "./rhuCarePlan.js";
import { tbManagementFor, tbManagementFields } from "./rhuTbCaseManagement.js";
import * as tbAssessment from "./tbAssessment.js";

const assessment = { diagnosisType: "tb_disease", drugResistance: "drug_susceptible", openTreatmentCard: false };
const entry = { id: "tb-1", name: "Tuberculosis", activate: false, nextAction: "none", tbManagement: assessment };

test("TB evaluation survives final-save, API normalization and record restore without registration", () => {
  const saved = normalizeDiagnoses(diagnosesForRhuSave([entry]));
  assert.deepEqual(saved[0].tbManagement, assessment);
  assert.deepEqual(restoreDiagnoses({ diagnoses: saved }).diagnoses[0].tbManagement, assessment);
  assert.equal(saved[0].activate, false);
});

test("switching to infection clears resistance and registration in actual state", () => {
  const disease = { ...entry, tbManagement: { ...assessment, openTreatmentCard: true } };
  const infection = tbManagementFor(disease, { diagnosisType: "tb_infection" });
  assert.deepEqual(infection.tbManagement, { diagnosisType: "tb_infection", drugResistance: "", openTreatmentCard: false });
  assert.equal(tbManagementFor(infection, { diagnosisType: "tb_disease" }).tbManagement.drugResistance, "");
  assert.equal(disease.tbManagement.drugResistance, "drug_susceptible");
});

test("restoring a stale infection draft clears hidden clinical state", () => {
  const stale = { ...entry, tbManagement: { diagnosisType: "tb_infection", drugResistance: "rr_tb", openTreatmentCard: true } };
  const expected = { diagnosisType: "tb_infection", drugResistance: "", openTreatmentCard: false };
  assert.deepEqual(restoreRhuDiagnoses({ diagnoses: [stale] })[0].tbManagement, expected);
  assert.deepEqual(normalizeDiagnoses([stale])[0].tbManagement, expected);
});

test("resistance changes revoke an earlier registration choice", () => {
  const old = { ...entry, tbManagement: { ...assessment, openTreatmentCard: true } };
  assert.equal(tbManagementFor(old, { drugResistance: "rr_tb" }).tbManagement.openTreatmentCard, false);
});

test("legacy aliases normalize without introducing TB metadata on unrelated entries", () => {
  const aliased = { id: "legacy", name: "TB", tb_management: { diagnosis_type: "tb_disease", drug_resistance: "mdr_tb", open_treatment_card: false } };
  assert.deepEqual(normalizeDiagnoses([aliased])[0].tbManagement, tbManagementFields(aliased));
  assert.equal(Object.hasOwn(normalizeDiagnoses([{ id: "other", name: "Asthma" }])[0], "tbManagement"), false);
});

test("consultation save and draft restore revoke old in-consultation registration flags", () => {
  const old = { ...entry, tbManagement: { ...assessment, openTreatmentCard: true } };
  assert.equal(diagnosesForRhuSave([old])[0].tbManagement.openTreatmentCard, false);
  assert.equal(restoreRhuDiagnoses({ diagnoses: [old] })[0].tbManagement.openTreatmentCard, false);
});

test("TB assessment requires a physician at the current RHU with confirmation permission", () => {
  assert.equal(typeof tbAssessment.canConfirmTbDiagnosis, "function");
  const physician = { role: "rhu", staff_role: "doctor", status: "active", permissions: ["conditions.confirm"] };
  assert.equal(tbAssessment.canConfirmTbDiagnosis(physician), true);
  assert.equal(tbAssessment.canConfirmTbDiagnosis({ ...physician, status: "Active" }), true);
  for (const override of [{ staff_role: "nurse" }, { role: "bhc" }, { role: "admin" }, { permissions: [] }, { status: "inactive" }]) {
    assert.equal(tbAssessment.canConfirmTbDiagnosis({ ...physician, ...override }), false);
  }
});
