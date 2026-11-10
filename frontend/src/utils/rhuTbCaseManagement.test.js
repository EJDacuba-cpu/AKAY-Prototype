import test from "node:test";
import assert from "node:assert/strict";

import {
  DR_TB_PRIMARY,
  DR_TB_RESISTANCE,
  DR_TB_SUBTYPE_OPTIONS,
  PENDING_DST_RESISTANCE,
  canOpenDsTbTreatmentCard,
  drugResistanceForPrimary,
  drugResistancePrimary,
  existingRegisteredTbCase,
  isPendingDst,
  isRecognizedTbDiagnosis,
  shouldOpenDsTbTreatmentCard,
  tbCaseNumberRequired,
  tbManagementFor,
  rhuTbAssessmentErrors,
} from "./rhuTbCaseManagement.js";

const REGISTRY = {
  monitored_conditions: {
    tuberculosis: {
      name: "Tuberculosis",
      aliases: ["TB", "PTB", "Pulmonary TB", "Extrapulmonary TB"],
    },
    hypertension: { name: "Hypertension", aliases: ["HTN"] },
  },
};

test("recognized TB names match the clinical registry, not hypertension", () => {
  assert.equal(isRecognizedTbDiagnosis("TB", REGISTRY), true);
  assert.equal(isRecognizedTbDiagnosis("Pulmonary TB", REGISTRY), true);
  assert.equal(isRecognizedTbDiagnosis("Hypertension", REGISTRY), false);
  assert.equal(isRecognizedTbDiagnosis("URI", REGISTRY), false);
});

test("evaluation alone does not open Form 4B or require a case number", () => {
  const entry = {
    name: "TB",
    tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible", openTreatmentCard: false },
  };
  assert.equal(canOpenDsTbTreatmentCard(entry), true);
  assert.equal(shouldOpenDsTbTreatmentCard(entry), false);
  assert.equal(tbCaseNumberRequired([entry]), false);
});

test("an explicit DS-TB registration opens Form 4B and requires a case number", () => {
  const entry = {
    name: "Tuberculosis",
    tbManagement: {
      diagnosisType: "tb_disease",
      drugResistance: "drug_susceptible",
      treatmentDecision: "initiate_at_rhu",
      openTreatmentCard: true,
    },
  };
  assert.equal(shouldOpenDsTbTreatmentCard(entry), true);
  assert.equal(tbCaseNumberRequired([entry]), true);
});

test("DR-TB, pending DST, and TB infection never open DS-TB Form 4B", () => {
  for (const drugResistance of [...DR_TB_RESISTANCE, PENDING_DST_RESISTANCE, DR_TB_PRIMARY]) {
    const entry = {
      name: "TB",
      tbManagement: { diagnosisType: "tb_disease", drugResistance, openTreatmentCard: true },
    };
    assert.equal(canOpenDsTbTreatmentCard(entry), false, drugResistance);
    assert.equal(shouldOpenDsTbTreatmentCard(entry), false, drugResistance);
  }
  const infection = {
    name: "TB",
    tbManagement: { diagnosisType: "tb_infection", drugResistance: "drug_susceptible", openTreatmentCard: true },
  };
  assert.equal(canOpenDsTbTreatmentCard(infection), false);
  assert.equal(shouldOpenDsTbTreatmentCard(infection), false);
  assert.equal(tbCaseNumberRequired([infection]), false);
});

test("primary susceptibility choices derive from stored classification values", () => {
  assert.equal(drugResistancePrimary("drug_susceptible"), "drug_susceptible");
  assert.equal(drugResistancePrimary(PENDING_DST_RESISTANCE), PENDING_DST_RESISTANCE);
  assert.equal(drugResistancePrimary(DR_TB_PRIMARY), DR_TB_PRIMARY);
  for (const subtype of DR_TB_RESISTANCE) {
    assert.equal(drugResistancePrimary(subtype), DR_TB_PRIMARY, subtype);
  }
  assert.equal(drugResistanceForPrimary(DR_TB_PRIMARY, "mdr_tb"), "mdr_tb");
  assert.equal(drugResistanceForPrimary(DR_TB_PRIMARY, "drug_susceptible"), DR_TB_PRIMARY);
  assert.equal(drugResistanceForPrimary(PENDING_DST_RESISTANCE), PENDING_DST_RESISTANCE);
  assert.equal(DR_TB_SUBTYPE_OPTIONS.length, 5);
});

test("pending DST stays selectable without Form 4B or treatment decision", () => {
  const pending = {
    id: "tb",
    name: "TB",
    tbManagement: { diagnosisType: "tb_disease", drugResistance: PENDING_DST_RESISTANCE },
  };
  assert.equal(isPendingDst(pending), true);
  assert.equal(canOpenDsTbTreatmentCard(pending), false);
  assert.deepEqual(rhuTbAssessmentErrors([pending], { registry: REGISTRY, canConfirmTb: true }), {});
  const incompleteDr = {
    id: "tb",
    name: "TB",
    tbManagement: { diagnosisType: "tb_disease", drugResistance: DR_TB_PRIMARY },
  };
  assert.ok(rhuTbAssessmentErrors([incompleteDr], { registry: REGISTRY, canConfirmTb: true })["diagnoses.tb.tbManagement.drugResistance"]);
});

test("Active Patient Condition is independent of TB registration", () => {
  const entry = tbManagementFor({ name: "TB", activate: true }, {
    diagnosisType: "tb_disease",
    drugResistance: "drug_susceptible",
    openTreatmentCard: false,
  });
  assert.equal(entry.activate, true);
  assert.equal(shouldOpenDsTbTreatmentCard(entry), false);
});

test("an already registered TB case is referenced instead of requiring a new number", () => {
  const records = [
    { id: 1, dateOfVisit: "2026-01-01", tbData: { diagnosis: { tbCaseNumber: "TB-2026-014" } } },
    { id: 2, dateOfVisit: "2026-02-01", tbData: { diagnosis: { tbCaseNumber: "TB-2026-014" }, phases: { intensiveStart: "2026-01-15" } } },
  ];
  const existing = existingRegisteredTbCase(records);
  assert.equal(existing.tbCaseNumber, "TB-2026-014");
  assert.equal(tbCaseNumberRequired([], existing), false);
  const registering = {
    name: "TB",
    tbManagement: {
      diagnosisType: "tb_disease",
      drugResistance: "drug_susceptible",
      treatmentDecision: "initiate_at_rhu",
      openTreatmentCard: true,
    },
  };
  assert.equal(tbCaseNumberRequired([registering], existing), false);
});

test("missing TB history is not treated as a registered case", () => {
  assert.equal(existingRegisteredTbCase([]), null);
  assert.equal(existingRegisteredTbCase([{ id: 1, tbData: { diagnosis: {} } }]), null);
});

test("TB finalization reports physician authority and missing resistance before submission", () => {
  const entry = { id: "tb", name: "PTB", tbManagement: { diagnosisType: "tb_disease", drugResistance: "" } };
  assert.ok(rhuTbAssessmentErrors([entry], { registry: REGISTRY, canConfirmTb: false })["diagnoses.tb.tbManagement"]);
  assert.ok(rhuTbAssessmentErrors([entry], { registry: REGISTRY, canConfirmTb: true })["diagnoses.tb.tbManagement.drugResistance"]);
  assert.deepEqual(rhuTbAssessmentErrors([{ ...entry, name: "Asthma" }], { registry: REGISTRY, canConfirmTb: false }), {});
});

test("DS-TB finalization requires a treatment decision and deferred disposition", () => {
  const ds = {
    id: "tb",
    name: "PTB",
    tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" },
  };
  assert.ok(rhuTbAssessmentErrors([ds], { registry: REGISTRY, canConfirmTb: true })["diagnoses.tb.tbManagement.treatmentDecision"]);
  const deferred = {
    ...ds,
    tbManagement: {
      ...ds.tbManagement,
      treatmentDecision: "not_yet_initiated",
      dispositionReason: "",
      dispositionPlan: "",
    },
  };
  const errors = rhuTbAssessmentErrors([deferred], { registry: REGISTRY, canConfirmTb: true });
  assert.ok(errors["diagnoses.tb.tbManagement.dispositionReason"]);
  assert.ok(errors["diagnoses.tb.tbManagement.dispositionPlan"]);
});

test("qualified TB diagnoses require physician review without matching unrelated substrings", () => {
  for (const name of ["TB, Hypertension", "Confirmed pulmonary TB", "TB Disease", "TB Infection", "MDR-TB", "Latent tuberculosis", "LTBI"]) {
    assert.ok(rhuTbAssessmentErrors([{ id: "tb", name }], { registry: REGISTRY, canConfirmTb: false })["diagnoses.tb.tbManagement"], name);
  }
  assert.deepEqual(rhuTbAssessmentErrors([{ id: "other", name: "Heartburn" }], { registry: REGISTRY, canConfirmTb: false }), {});
});
