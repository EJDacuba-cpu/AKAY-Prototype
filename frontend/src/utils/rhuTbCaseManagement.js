import { matchConditionKey } from "./carePlan.js";
import { getRecordDateValue, getTbData } from "./healthRecordPrograms.js";
import { tbManagementFields } from "./tbAssessment.js";
export { tbManagementFields, tbManagementFor } from "./tbAssessment.js";

export const TB_DIAGNOSIS_TYPES = Object.freeze({
  tb_disease: "TB Disease",
  tb_infection: "TB Infection / TPT",
});

export const DS_TB_RESISTANCE = "drug_susceptible";

export const DR_TB_RESISTANCE = Object.freeze([
  "rr_tb",
  "mdr_tb",
  "clinically_mdr_tb",
  "xdr_tb",
  "other",
]);

const DR_TB_SET = new Set(DR_TB_RESISTANCE);

export function emptyTbManagement() {
  return {
    diagnosisType: "",
    drugResistance: "",
    openTreatmentCard: false,
  };
}

export function isRecognizedTbDiagnosis(name, registry = {}) {
  return matchConditionKey(name, registry) === "tuberculosis"
    || /\b(?:TB|PTB|LTBI|tuberculosis|tuberculous)\b/iu.test(String(name || ""));
}

export function rhuTbAssessmentErrors(diagnoses, { registry, canConfirmTb }) {
  const errors = {};
  for (const entry of diagnoses || []) {
    if (!isRecognizedTbDiagnosis(entry.name, registry)) continue;
    const key = `diagnoses.${entry.id}.tbManagement`;
    if (!canConfirmTb) {
      errors[key] = "The RHU physician must review and finalize the TB assessment.";
    } else {
      const management = tbManagementFields(entry);
      if (management.diagnosisType === "tb_disease" && !management.drugResistance) {
        errors[`${key}.drugResistance`] = "Select drug resistance for TB Disease.";
      }
    }
  }
  return errors;
}

export function isTbInfection(entry) {
  return tbManagementFields(entry).diagnosisType === "tb_infection";
}

export function isDrTb(entry) {
  return DR_TB_SET.has(tbManagementFields(entry).drugResistance);
}

export function canOpenDsTbTreatmentCard(entry) {
  const management = tbManagementFields(entry);
  return management.diagnosisType === "tb_disease" && management.drugResistance === DS_TB_RESISTANCE;
}

export function shouldOpenDsTbTreatmentCard(entry) {
  return canOpenDsTbTreatmentCard(entry) && tbManagementFields(entry).openTreatmentCard;
}

export function diagnosesOpenDsTbTreatmentCard(diagnoses = []) {
  return (diagnoses || []).some((entry) => shouldOpenDsTbTreatmentCard(entry));
}

export function existingRegisteredTbCase(records = []) {
  const dated = (records || [])
    .map((record, index) => ({ record, index, date: getRecordDateValue(record) || "" }))
    .sort((a, b) => {
      if (a.date === b.date) return a.index - b.index;
      return a.date < b.date ? -1 : 1;
    });
  for (let index = dated.length - 1; index >= 0; index -= 1) {
    const tb = getTbData(dated[index].record);
    const tbCaseNumber = String(tb.tbCaseNumber || "").trim();
    if (tbCaseNumber) {
      return { tbCaseNumber, record: dated[index].record, tbData: tb.raw };
    }
  }
  return null;
}

export function tbCaseNumberRequired(diagnoses = [], existingCase = null) {
  if (existingCase?.tbCaseNumber) return false;
  return diagnosesOpenDsTbTreatmentCard(diagnoses);
}
