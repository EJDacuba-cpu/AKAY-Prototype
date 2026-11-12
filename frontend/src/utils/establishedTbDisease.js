import { getRecordDateValue } from "./healthRecordPrograms.js";
import { isRecognizedTbDiagnosis } from "./rhuTbCaseManagement.js";
import { tbManagementFields, tbManagementFor } from "./tbAssessment.js";

function text(value) {
  return String(value ?? "").trim();
}

function conditionIdentityOf(condition) {
  return text(condition?.conditionIdentity || condition?.condition_identity);
}

/** Continuing TB Disease care — not provisional under-evaluation. */
export function hasContinuingTbDiseaseCondition(conditions = []) {
  return (conditions || []).some((condition) => {
    if (conditionIdentityOf(condition) !== "tuberculosis") return false;
    const status = text(condition?.status).toLowerCase();
    return status === "active" || status === "controlled";
  });
}

function physicianAuthority(record) {
  return record?.tbAssessmentAuthority || record?.tb_assessment_authority || null;
}

/** Physician attestation on a finalized clinical record (not Active Condition alone). */
export function recordHasPhysicianTbAuthority(record) {
  if (!record) return false;
  const finalized = record.finalizedAt || record.finalized_at;
  if (!finalized) return false;
  const authority = physicianAuthority(record);
  if (!authority || typeof authority !== "object") return false;
  return Boolean(
    authority.physician_id
      || authority.physicianId
      || authority.confirmed_at
      || authority.confirmedAt
      || authority.assessment_hash
      || authority.assessmentHash,
  );
}

function diagnosesOf(record) {
  const list = record?.diagnoses || record?.diagnosis_entries || [];
  return Array.isArray(list) ? list : [];
}

/**
 * Latest physician-confirmed TB Disease assessment from finalized records.
 * Does not treat Active Condition or display name alone as confirmation.
 */
export function priorPhysicianConfirmedTbDisease(records = []) {
  const dated = (records || [])
    .map((record, index) => ({
      record,
      index,
      date: getRecordDateValue(record) || text(record?.finalizedAt || record?.finalized_at).slice(0, 10),
    }))
    .sort((a, b) => {
      if (a.date === b.date) return a.index - b.index;
      return a.date < b.date ? -1 : 1;
    });

  for (let index = dated.length - 1; index >= 0; index -= 1) {
    const { record } = dated[index];
    if (!recordHasPhysicianTbAuthority(record)) continue;
    for (const entry of diagnosesOf(record)) {
      const management = tbManagementFields(entry);
      if (management.diagnosisType !== "tb_disease") continue;
      if (!isRecognizedTbDiagnosis(entry?.name || entry?.conditionName)) continue;
      return {
        diagnosisType: "tb_disease",
        drugResistance: management.drugResistance,
        tbCaseNumber: management.tbCaseNumber,
        sourceRecordId: record.id || record._id || null,
      };
    }
  }
  return null;
}

/**
 * Lock TB Assessment to TB Disease only when continuing care is established
 * via patient-condition identity AND a prior physician-confirmed record.
 */
export function establishedTbDiseaseLock({ conditions = [], patientRecords = [] } = {}) {
  if (!hasContinuingTbDiseaseCondition(conditions)) return null;
  return priorPhysicianConfirmedTbDisease(patientRecords);
}

export function isTbAssessmentLocked(entry, lock) {
  if (!lock || lock.diagnosisType !== "tb_disease") return false;
  return isRecognizedTbDiagnosis(entry?.name);
}

/** Seed / force locked TB Disease while preserving editable susceptibility. */
export function applyEstablishedTbDiseaseAssessment(entry, lock) {
  if (!isTbAssessmentLocked(entry, lock)) return entry;
  const current = tbManagementFields(entry);
  const diagnosisType = "tb_disease";
  const drugResistance = current.drugResistance || lock.drugResistance || "";
  const tbCaseNumber = current.tbCaseNumber || lock.tbCaseNumber || "";
  if (
    current.diagnosisType === diagnosisType
    && current.drugResistance === drugResistance
    && current.tbCaseNumber === tbCaseNumber
  ) {
    return entry;
  }
  return tbManagementFor(entry, { diagnosisType, drugResistance, tbCaseNumber });
}

export const TB_DISEASE_FOLLOW_UP_LOCK_MESSAGE =
  "TB Disease was confirmed in a previous consultation. This assessment cannot be changed during follow-up.";
