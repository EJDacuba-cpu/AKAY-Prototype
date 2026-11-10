import { matchConditionKey } from "./carePlan.js";
import { getRecordDateValue, getTbData } from "./healthRecordPrograms.js";
import { tbManagementFields } from "./tbAssessment.js";
export { tbManagementFields, tbManagementFor } from "./tbAssessment.js";

export const TB_DIAGNOSIS_TYPES = Object.freeze({
  tb_disease: "TB Disease",
  tb_infection: "TB Infection / TPT",
});

export const DS_TB_RESISTANCE = "drug_susceptible";
export const PENDING_DST_RESISTANCE = "pending_dst";

/** Incomplete DR selection before a subtype is chosen (draft-safe; rejected on finalize). */
export const DR_TB_PRIMARY = "drug_resistant";

export const DR_TB_RESISTANCE = Object.freeze([
  "rr_tb",
  "mdr_tb",
  "clinically_mdr_tb",
  "xdr_tb",
  "other",
]);

export const DR_TB_SUBTYPE_OPTIONS = Object.freeze([
  { value: "rr_tb", label: "Bacteriologically-confirmed RR-TB" },
  { value: "mdr_tb", label: "Bacteriologically-confirmed MDR-TB" },
  { value: "clinically_mdr_tb", label: "Clinically-diagnosed MDR-TB" },
  { value: "xdr_tb", label: "Bacteriologically-confirmed XDR-TB" },
  { value: "other", label: "Other Drug-resistant TB" },
]);

export const TB_SUSCEPTIBILITY_PRIMARY_OPTIONS = Object.freeze([
  { value: DS_TB_RESISTANCE, label: "Drug-susceptible TB" },
  { value: DR_TB_PRIMARY, label: "Drug-resistant TB" },
  { value: PENDING_DST_RESISTANCE, label: "Pending DST Result" },
]);

const DR_TB_SET = new Set(DR_TB_RESISTANCE);

/** Derive the three primary UI choices from the stored classification value. */
export function drugResistancePrimary(drugResistance) {
  const value = String(drugResistance || "").trim();
  if (value === DS_TB_RESISTANCE) return DS_TB_RESISTANCE;
  if (value === PENDING_DST_RESISTANCE) return PENDING_DST_RESISTANCE;
  if (value === DR_TB_PRIMARY || DR_TB_SET.has(value)) return DR_TB_PRIMARY;
  return "";
}

export function isDrTbSubtype(drugResistance) {
  return DR_TB_SET.has(String(drugResistance || "").trim());
}

export function drugResistanceForPrimary(primary, currentResistance = "") {
  const next = String(primary || "").trim();
  if (next === DS_TB_RESISTANCE) return DS_TB_RESISTANCE;
  if (next === PENDING_DST_RESISTANCE) return PENDING_DST_RESISTANCE;
  if (next === DR_TB_PRIMARY) {
    return isDrTbSubtype(currentResistance) ? String(currentResistance).trim() : DR_TB_PRIMARY;
  }
  return "";
}

export function emptyTbManagement() {
  return {
    diagnosisType: "",
    drugResistance: "",
    treatmentDecision: "",
    dispositionReason: "",
    dispositionPlan: "",
    openTreatmentCard: false,
  };
}

export const TB_TREATMENT_DECISION_VALUES = Object.freeze({
  initiate_at_rhu: "initiate_at_rhu",
  not_yet_initiated: "not_yet_initiated",
  refer_elsewhere: "refer_elsewhere",
});

export function isInitiateDsTbTreatment(entry) {
  return tbManagementFields(entry).treatmentDecision === TB_TREATMENT_DECISION_VALUES.initiate_at_rhu;
}

export function diagnosesInitiateDsTbTreatment(diagnoses = []) {
  return (diagnoses || []).some((entry) => isInitiateDsTbTreatment(entry));
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
      } else if (management.diagnosisType === "tb_disease" && management.drugResistance === DR_TB_PRIMARY) {
        errors[`${key}.drugResistance`] = "Select the drug-resistant TB classification.";
      }
      if (canOpenDsTbTreatmentCard(entry) && !management.treatmentDecision) {
        errors[`${key}.treatmentDecision`] = "Select whether to initiate DS-TB treatment, defer, or refer elsewhere.";
      }
      if (management.treatmentDecision === "not_yet_initiated" || management.treatmentDecision === "refer_elsewhere") {
        if (!management.dispositionReason) {
          errors[`${key}.dispositionReason`] = "Document the reason treatment is not initiated at this RHU.";
        }
        if (!management.dispositionPlan) {
          errors[`${key}.dispositionPlan`] = "Document the follow-up or referral plan.";
        }
      }
    }
  }
  return errors;
}

export function isDrTb(entry) {
  return isDrTbSubtype(tbManagementFields(entry).drugResistance);
}

export function isPendingDst(entry) {
  return tbManagementFields(entry).drugResistance === PENDING_DST_RESISTANCE;
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
