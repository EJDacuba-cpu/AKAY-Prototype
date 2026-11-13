/**
 * RHU walk-in Diagnosis & Care Plan: one exclusive next action per named
 * diagnosis, plus service next actions that never refer to RHU.
 *
 * Old drafts stored visit-level `rhuFollowUp` / `manageToBhc`. Restore maps
 * those onto at most one diagnosis (Manage) or a `visit` schedule row
 * (follow-up) — never onto every diagnosis.
 */
import { entryPurposeKey, VISIT_PURPOSE_KEY } from "./followUpSchedules.js";
import { normalizeSupportingLaboratoryTests } from "./laboratoryTests.js";
import { entryDestinations } from "./reportingEntries.js";
import { tbEvaluationEntryFields } from "./tbAssessment.js";
import { isPresumptiveTb } from "./rhuTbCaseManagement.js";

export const PRESUMPTIVE_TB_MANAGE_TO_BHC_ERROR =
  "Presumptive TB is Under Evaluation. Manage to BHC is available only for Active or Controlled conditions.";

function normalizeNameKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export const RHU_NEXT_ACTIONS = Object.freeze({
  none: "No Further Follow-up Scheduled",
  rhu_follow_up: "Schedule RHU Follow-up",
  manage_to_bhc: "Manage to BHC",
  refer_higher_level: "Refer to Higher-Level Facility",
});

export const RHU_NEXT_ACTION_OPTIONS = Object.entries(RHU_NEXT_ACTIONS).map(([value, label]) => ({
  value,
  label,
}));

const MONITORABLE = new Set(["active", "controlled"]);

function text(value) {
  return String(value ?? "").trim();
}

export function isRhuNextAction(value) {
  return Object.hasOwn(RHU_NEXT_ACTIONS, value || "");
}

export function emptyRhuDiagnosis(name, id) {
  return {
    id,
    name,
    activate: false,
    nextAction: "",
    receivingBhcId: "",
    monitoringRecommendation: "",
    noFurtherFollowUpReason: "",
    supportingLaboratoryTests: [],
    tbManagement: {
      diagnosisType: "",
      drugResistance: "",
      treatmentDecision: "",
      dispositionReason: "",
      dispositionPlan: "",
      openTreatmentCard: false,
      tbCaseNumber: "",
    },
  };
}

export function diagnosisNextAction(entry) {
  if (isRhuNextAction(entry?.nextAction)) return entry.nextAction;
  if (entry?.manageToBhc === true) return "manage_to_bhc";
  return "";
}

export function isMonitorableStatus(status) {
  return MONITORABLE.has(String(status || "").trim().toLowerCase());
}

export function matchingMonitorableCondition(name, conditions = []) {
  const key = normalizeNameKey(name);
  if (!key) return null;
  return (conditions || []).find((condition) => {
    const conditionName = condition?.conditionName || condition?.condition_name || condition?.name;
    return normalizeNameKey(conditionName) === key && isMonitorableStatus(condition?.status);
  }) || null;
}

/**
 * True when Manage to BHC can rely on an Active/Controlled condition.
 * Checking activate on Presumptive TB only records Under Evaluation — that
 * alone is not monitorable for handoff.
 */
export function diagnosisActivateConfirmed(entry, conditions = []) {
  if (matchingMonitorableCondition(entry?.name, conditions)) return true;
  if (entry?.activate !== true) return false;
  if (isPresumptiveTb(entry)) return false;
  return true;
}

export function presumptiveManageToBhcBlocked(entry, conditions = []) {
  return (
    diagnosisNextAction(entry) === "manage_to_bhc"
    && isPresumptiveTb(entry)
    && !matchingMonitorableCondition(entry?.name, conditions)
  );
}

export function rhuDiagnosisFields(item = {}) {
  const nextAction = diagnosisNextAction(item);
  const receivingBhcId = item.receivingBhcId ?? item.receiving_bhc_id ?? "";
  const monitoringRecommendation = item.monitoringRecommendation ?? item.monitoring_recommendation ?? "";
  const noFurtherFollowUpReason = item.noFurtherFollowUpReason ?? item.no_further_follow_up_reason ?? "";
  return {
    activate: Boolean(item.activate),
    nextAction,
    receivingBhcId: nextAction === "manage_to_bhc" ? String(receivingBhcId || "") : "",
    monitoringRecommendation: nextAction === "manage_to_bhc" ? String(monitoringRecommendation || "") : "",
    noFurtherFollowUpReason: nextAction === "none" ? String(noFurtherFollowUpReason || "") : "",
    higherLevelReferralPlan: nextAction === "refer_higher_level" ? {
      reason: text(item.higherLevelReferralPlan?.reason),
      intendedFacility: text(item.higherLevelReferralPlan?.intendedFacility),
      clinicalPlan: text(item.higherLevelReferralPlan?.clinicalPlan),
    } : null,
  };
}

function visitManage(payload = {}) {
  return payload.manageToBhc === true || payload.carePlan?.manage_to_bhc === true || payload.care_plan?.manage_to_bhc === true;
}

function visitFollowUp(payload = {}) {
  return payload.rhuFollowUp === true || payload.carePlan?.rhu_follow_up === true || payload.care_plan?.rhu_follow_up === true;
}

/**
 * Restore per-diagnosis next actions from a draft. Visit-level Manage applies
 * to at most one diagnosis that does not already have a next action.
 */
export function restoreRhuDiagnoses(payload = {}) {
  const list = Array.isArray(payload.diagnoses) ? payload.diagnoses : [];
  const restored = list.map((entry) => {
    const evidence = Array.isArray(entry.laboratoryEvidence)
      ? entry.laboratoryEvidence.map((selection) => ({
        reference: selection.reference,
        version: selection.version,
      }))
      : entry.laboratoryEvidence;
    const hadLegacyAttachments = Array.isArray(entry.laboratoryEvidence)
      && entry.laboratoryEvidence.some((selection) => Array.isArray(selection?.attachmentIds) && selection.attachmentIds.length > 0);
    return {
      ...entry,
      ...rhuDiagnosisFields(entry),
      ...tbEvaluationEntryFields(entry),
      ...(Array.isArray(evidence) ? {
        laboratoryEvidence: evidence,
        laboratoryEvidenceConfirmed: hadLegacyAttachments ? false : entry.laboratoryEvidenceConfirmed === true,
      } : {}),
    };
  });
  if (!visitManage(payload)) return restored;
  if (restored.some((entry) => diagnosisNextAction(entry) === "manage_to_bhc")) return restored;
  const index = restored.findIndex((entry) => !diagnosisNextAction(entry));
  if (index < 0) return restored;
  return restored.map((entry, itemIndex) => (
    itemIndex === index ? { ...entry, nextAction: "manage_to_bhc" } : entry
  ));
}

export function restoreRhuFollowUpSchedules(payload = {}, diagnoses = []) {
  const stored = Array.isArray(payload.followUpSchedules)
    ? payload.followUpSchedules
    : Array.isArray(payload.monitoringData?.followUpSchedules)
      ? payload.monitoringData.followUpSchedules
      : [];
  if (stored.length > 0) return stored;
  const hasEntryFollowUp = (diagnoses || []).some((entry) => diagnosisNextAction(entry) === "rhu_follow_up");
  if (hasEntryFollowUp || !visitFollowUp(payload)) return [];
  const date = text(payload.followUpDate);
  if (!date) return [];
  return [{
    purposeKey: VISIT_PURPOSE_KEY,
    purpose: text(payload.followUpReason) || "RHU follow-up",
    date,
    time: text(payload.followUpTime),
    predecessorTaskId: null,
    sourceEntryId: null,
  }];
}

export function applyRhuNextAction(entry, nextAction) {
  const action = isRhuNextAction(nextAction) ? nextAction : "";
  return {
    ...entry,
    nextAction: action,
    manageToBhc: action === "manage_to_bhc",
    receivingBhcId: action === "manage_to_bhc" ? (entry.receivingBhcId || "") : "",
    monitoringRecommendation: action === "manage_to_bhc" ? (entry.monitoringRecommendation || "") : "",
    noFurtherFollowUpReason: action === "none" ? (entry.noFurtherFollowUpReason || "") : "",
    higherLevelReferralPlan: action === "refer_higher_level" ? {
      reason: entry.higherLevelReferralPlan?.reason || "",
      intendedFacility: entry.higherLevelReferralPlan?.intendedFacility || "",
      clinicalPlan: entry.higherLevelReferralPlan?.clinicalPlan || "",
    } : null,
  };
}

export function rhuCarePlanErrors(diagnoses = [], {
  schedules = [],
  catchmentBhcIds = [],
  isReferralVisit = false,
  conditions = [],
} = {}) {
  const errors = {};
  const allowedBhcs = new Set((catchmentBhcIds || []).map(String));
  for (const entry of diagnoses || []) {
    if (!text(entry?.name) || !text(entry?.id)) continue;
    const action = diagnosisNextAction(entry);
    const key = `diagnoses.${entry.id}`;
    // Referral and walk-in ITRs both choose a next action here. Manage to BHC
    // creates a monitoring request; No further follow-up closes a referral with notes.
    if (!action) {
      errors[`${key}.nextAction`] = "Choose a next action.";
      continue;
    }
    if (action === "none" && isReferralVisit && !text(entry.noFurtherFollowUpReason)) {
      errors[`${key}.noFurtherFollowUpReason`] = "Tell the BHC why no further follow-up is needed.";
    }
    if (action === "rhu_follow_up") {
      const purposeKey = entryPurposeKey(entry.id);
      const schedule = (schedules || []).find((item) => item?.purposeKey === purposeKey);
      if (!text(schedule?.date)) errors[`followUpSchedule.${purposeKey}.date`] = "Set the RHU follow-up date.";
      if (!text(schedule?.purpose)) errors[`followUpSchedule.${purposeKey}.purpose`] = "Describe the reason for return.";
    }
    if (action === "refer_higher_level") {
      const plan = entry.higherLevelReferralPlan;
      if (!text(plan?.reason)) errors[`${key}.higherLevelReferralPlan.reason`] = "Enter the referral reason.";
      if (!text(plan?.clinicalPlan)) errors[`${key}.higherLevelReferralPlan.clinicalPlan`] = "Enter the clinical plan.";
    }
    if (action === "manage_to_bhc") {
      if (presumptiveManageToBhcBlocked(entry, conditions)) {
        // Keep the draft choice; require the clinician to pick a valid next action.
        errors[`${key}.nextAction`] = PRESUMPTIVE_TB_MANAGE_TO_BHC_ERROR;
      } else if (!diagnosisActivateConfirmed(entry, conditions)) {
        errors[`${key}.activate`] = "Mark this as an Active patient condition, or choose a different next action.";
      }
      if (!presumptiveManageToBhcBlocked(entry, conditions)) {
        if (!text(entry.receivingBhcId)) {
          errors[`${key}.receivingBhcId`] = "Choose the receiving Barangay Health Center.";
        } else if (allowedBhcs.size > 0 && !allowedBhcs.has(String(entry.receivingBhcId))) {
          errors[`${key}.receivingBhcId`] = "Choose a catchment Barangay Health Center of this RHU.";
        }
        if (!text(entry.monitoringRecommendation)) {
          errors[`${key}.monitoringRecommendation`] = "Write the monitoring recommendation.";
        }
        if (entry.laboratoryEvidence?.length && entry.laboratoryEvidenceConfirmed !== true) {
          errors[`${key}.laboratoryEvidenceConfirmed`] = "Confirm the selected laboratory evidence before sharing.";
        }
      }
    }
  }
  return errors;
}

export function diagnosesForRhuSave(diagnoses = []) {
  return (diagnoses || []).filter((entry) => text(entry?.name)).map((entry) => {
    const fields = rhuDiagnosisFields(entry);
    const supportingLaboratoryTests = normalizeSupportingLaboratoryTests(entry.supportingLaboratoryTests);
    const reportIn = entryDestinations(entry);
    return {
      id: entry.id,
      name: entry.name,
      reportIn,
      activate: fields.activate,
      nextAction: fields.nextAction,
      manageToBhc: fields.nextAction === "manage_to_bhc",
      receivingBhcId: fields.receivingBhcId,
      monitoringRecommendation: fields.monitoringRecommendation,
      ...(fields.nextAction === "none" && fields.noFurtherFollowUpReason
        ? { noFurtherFollowUpReason: fields.noFurtherFollowUpReason }
        : {}),
      ...(fields.higherLevelReferralPlan ? { higherLevelReferralPlan: fields.higherLevelReferralPlan } : {}),
      ...tbEvaluationEntryFields(entry),
      ...(supportingLaboratoryTests.length ? { supportingLaboratoryTests } : {}),
      ...(fields.nextAction === "manage_to_bhc" ? {
        laboratoryEvidence: (entry.laboratoryEvidence || []).map((selection) => ({
          reference: selection.reference,
          version: selection.version,
        })),
        laboratoryEvidenceConfirmed: entry.laboratoryEvidenceConfirmed === true,
      } : {}),
    };
  });
}
