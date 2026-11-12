import test from "node:test";
import assert from "node:assert/strict";

import {
  applyEstablishedTbDiseaseAssessment,
  establishedTbDiseaseLock,
  hasContinuingTbDiseaseCondition,
  priorPhysicianConfirmedTbDisease,
  recordHasPhysicianTbAuthority,
  TB_DISEASE_FOLLOW_UP_LOCK_MESSAGE,
} from "./establishedTbDisease.js";

const TB_ACTIVE = {
  id: 3,
  conditionName: "Tuberculosis",
  conditionIdentity: "tuberculosis",
  status: "active",
};

const TB_EVAL = {
  id: 4,
  conditionName: "Tuberculosis",
  conditionIdentity: "tuberculosis",
  status: "under_evaluation",
};

function physicianRecord(overrides = {}) {
  return {
    id: 10,
    dateOfVisit: "2026-10-01",
    finalized_at: "2026-10-01T10:00:00Z",
    tb_assessment_authority: {
      physician_id: 7,
      confirmed_at: "2026-10-01T10:00:00Z",
      assessment_hash: "abc",
    },
    diagnoses: [{
      id: "tb",
      name: "Pulmonary TB",
      tbManagement: {
        diagnosisType: "tb_disease",
        drugResistance: "drug_susceptible",
        tbCaseNumber: "TB-100",
      },
    }],
    ...overrides,
  };
}

test("continuing TB Disease condition requires active or controlled identity", () => {
  assert.equal(hasContinuingTbDiseaseCondition([TB_ACTIVE]), true);
  assert.equal(hasContinuingTbDiseaseCondition([TB_EVAL]), false);
  assert.equal(hasContinuingTbDiseaseCondition([]), false);
});

test("physician authority requires finalized attestation, not Active Condition alone", () => {
  assert.equal(recordHasPhysicianTbAuthority(physicianRecord()), true);
  assert.equal(recordHasPhysicianTbAuthority({
    ...physicianRecord(),
    finalized_at: null,
  }), false);
  assert.equal(recordHasPhysicianTbAuthority({
    ...physicianRecord({ tb_assessment_authority: null }),
  }), false);
});

test("prior physician-confirmed TB Disease reads the latest authorized assessment", () => {
  const older = physicianRecord({
    id: 8,
    dateOfVisit: "2026-09-01",
    diagnoses: [{
      id: "tb",
      name: "TB",
      tbManagement: { diagnosisType: "tb_disease", drugResistance: "pending_dst", tbCaseNumber: "OLD" },
    }],
  });
  const newer = physicianRecord({
    id: 12,
    dateOfVisit: "2026-11-01",
    diagnoses: [{
      id: "tb",
      name: "TB",
      tbManagement: { diagnosisType: "tb_disease", drugResistance: "rr_tb", tbCaseNumber: "NEW" },
    }],
  });
  const prior = priorPhysicianConfirmedTbDisease([older, newer]);
  assert.equal(prior.drugResistance, "rr_tb");
  assert.equal(prior.tbCaseNumber, "NEW");
  assert.equal(prior.sourceRecordId, 12);
});

test("established lock requires continuing condition and physician-confirmed record", () => {
  assert.equal(establishedTbDiseaseLock({
    conditions: [TB_ACTIVE],
    patientRecords: [physicianRecord()],
  })?.diagnosisType, "tb_disease");
  assert.equal(establishedTbDiseaseLock({
    conditions: [TB_EVAL],
    patientRecords: [physicianRecord()],
  }), null);
  assert.equal(establishedTbDiseaseLock({
    conditions: [TB_ACTIVE],
    patientRecords: [{
      id: 1,
      finalized_at: "2026-10-01T10:00:00Z",
      diagnoses: [{ name: "TB", tbManagement: { diagnosisType: "tb_disease" } }],
    }],
  }), null);
});

test("apply lock forces TB Disease without rewriting an already locked entry", () => {
  const lock = {
    diagnosisType: "tb_disease",
    drugResistance: "drug_susceptible",
    tbCaseNumber: "TB-100",
  };
  const entry = {
    id: "tb",
    name: "TB",
    tbManagement: { diagnosisType: "presumptive_tb", drugResistance: "" },
  };
  const locked = applyEstablishedTbDiseaseAssessment(entry, lock);
  assert.equal(locked.tbManagement.diagnosisType, "tb_disease");
  assert.equal(locked.tbManagement.drugResistance, "drug_susceptible");
  assert.equal(TB_DISEASE_FOLLOW_UP_LOCK_MESSAGE.includes("cannot be changed"), true);

  const stable = {
    id: "tb",
    name: "TB",
    tbManagement: {
      diagnosisType: "tb_disease",
      drugResistance: "rr_tb",
      tbCaseNumber: "TB-100",
    },
  };
  assert.equal(applyEstablishedTbDiseaseAssessment(stable, lock), stable);
});

test("unconfirmed provisional diagnoses stay unlocked", () => {
  const entry = { id: "tb", name: "TB", tbManagement: { diagnosisType: "presumptive_tb" } };
  assert.equal(applyEstablishedTbDiseaseAssessment(entry, null), entry);
});
