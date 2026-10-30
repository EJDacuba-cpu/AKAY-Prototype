/**
 * RHU walk-in Diagnosis & Care Plan: one exclusive next action per named
 * diagnosis, plus service next actions that never refer to RHU.
 *
 * Old drafts stored visit-level `rhuFollowUp` / `manageToBhc`. Restore maps
 * those onto at most one diagnosis (Manage) or a `visit` schedule row
 * (follow-up) — never onto every diagnosis.
 */
import { entryPurposeKey, VISIT_PURPOSE_KEY } from "./followUpSchedules.js";

function normalizeNameKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export const RHU_NEXT_ACTIONS = Object.freeze({
  none: "No Further Follow-up",
  rhu_follow_up: "Schedule RHU Follow-up",
  manage_to_bhc: "Manage to BHC",
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

export function diagnosisActivateConfirmed(entry, conditions = []) {
  if (entry?.activate === true) return true;
  return Boolean(matchingMonitorableCondition(entry?.name, conditions));
}

export function rhuDiagnosisFields(item = {}) {
  const nextAction = diagnosisNextAction(item);
  const receivingBhcId = item.receivingBhcId ?? item.receiving_bhc_id ?? "";
  const monitoringRecommendation = item.monitoringRecommendation ?? item.monitoring_recommendation ?? "";
  return {
    activate: Boolean(item.activate),
    nextAction,
    receivingBhcId: nextAction === "manage_to_bhc" ? String(receivingBhcId || "") : "",
    monitoringRecommendation: nextAction === "manage_to_bhc" ? String(monitoringRecommendation || "") : "",
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
  const restored = list.map((entry) => ({
    ...entry,
    ...rhuDiagnosisFields(entry),
  }));
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
    if (!action) {
      errors[`${key}.nextAction`] = "Choose a next action.";
      continue;
    }
    if (isReferralVisit && (action === "rhu_follow_up" || action === "manage_to_bhc")) {
      errors[`${key}.nextAction`] = "Referral visits keep follow-up and monitoring on the Return Slip.";
      continue;
    }
    if (action === "rhu_follow_up") {
      const purposeKey = entryPurposeKey(entry.id);
      const schedule = (schedules || []).find((item) => item?.purposeKey === purposeKey);
      if (!text(schedule?.date)) errors[`followUpSchedule.${purposeKey}.date`] = "Set the RHU follow-up date.";
      if (!text(schedule?.purpose)) errors[`followUpSchedule.${purposeKey}.purpose`] = "Describe the reason for return.";
    }
    if (action === "manage_to_bhc") {
      if (!diagnosisActivateConfirmed(entry, conditions)) {
        errors[`${key}.activate`] = "Mark this as an Active patient condition, or choose a different next action.";
      }
      if (!text(entry.receivingBhcId)) {
        errors[`${key}.receivingBhcId`] = "Choose the receiving Barangay Health Center.";
      } else if (allowedBhcs.size > 0 && !allowedBhcs.has(String(entry.receivingBhcId))) {
        errors[`${key}.receivingBhcId`] = "Choose a catchment Barangay Health Center of this RHU.";
      }
      if (!text(entry.monitoringRecommendation)) {
        errors[`${key}.monitoringRecommendation`] = "Write the monitoring recommendation.";
      }
    }
  }
  return errors;
}

export function diagnosesForRhuSave(diagnoses = []) {
  return (diagnoses || []).filter((entry) => text(entry?.name)).map((entry) => {
    const fields = rhuDiagnosisFields(entry);
    return {
      id: entry.id,
      name: entry.name,
      activate: fields.activate,
      nextAction: fields.nextAction,
      manageToBhc: fields.nextAction === "manage_to_bhc",
      receivingBhcId: fields.receivingBhcId,
      monitoringRecommendation: fields.monitoringRecommendation,
    };
  });
}
