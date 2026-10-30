import test from "node:test";
import assert from "node:assert/strict";

import {
  DR_TB_RESISTANCE,
  canOpenDsTbTreatmentCard,
  existingRegisteredTbCase,
  isRecognizedTbDiagnosis,
  shouldOpenDsTbTreatmentCard,
  tbCaseNumberRequired,
  tbManagementFor,
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
    tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible", openTreatmentCard: true },
  };
  assert.equal(shouldOpenDsTbTreatmentCard(entry), true);
  assert.equal(tbCaseNumberRequired([entry]), true);
});

test("DR-TB and TB infection never open DS-TB Form 4B", () => {
  for (const drugResistance of DR_TB_RESISTANCE) {
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
    tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible", openTreatmentCard: true },
  };
  assert.equal(tbCaseNumberRequired([registering], existing), false);
});

test("missing TB history is not treated as a registered case", () => {
  assert.equal(existingRegisteredTbCase([]), null);
  assert.equal(existingRegisteredTbCase([{ id: 1, tbData: { diagnosis: {} } }]), null);
});
