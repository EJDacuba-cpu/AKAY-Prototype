/**
 * Independent BHC return schedules for one consultation. Locally managed
 * concerns and selected-service returns live in one list. A locally managed
 * condition may complete care with no return; each scheduled return has its
 * own purpose and date. Older drafts that only stored a visit follow-up date
 * are restored as a `visit` row.
 */

import { getConsultationPrograms, PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";

export const VISIT_PURPOSE_KEY = "visit";

const text = (value) => String(value ?? "").trim();

export function entryPurposeKey(entryId) {
  return `entry:${String(entryId || "").trim()}`;
}

export function extraPurposeKey(id) {
  return `extra:${String(id || "").trim()}`;
}

export function servicePurposeKey(program) {
  return `service:${String(program || "").trim().toLowerCase().replace(/\s+/g, "-")}`;
}

function programsFromFollowUp(task = {}) {
  return getConsultationPrograms({
    selectedPrograms: Array.isArray(task.sourceSelectedPrograms) ? task.sourceSelectedPrograms : undefined,
    category: task.sourceCategory,
  });
}

/**
 * A scheduled health-service return (Prenatal / EPI / FP). Uses purpose_key
 * or the source record's selected programs — never purpose text alone.
 * Concern tasks (`entry:` / `continued:`) stay independent even when the
 * source consultation also included a service.
 */
export function isScheduledServiceFollowUp(task = {}) {
  const key = text(task?.purposeKey);
  if (key.startsWith("entry:") || key.startsWith("continued:")) return false;
  if (Object.keys(PROGRAM_CLASSIFICATIONS).some((program) => servicePurposeKey(program) === key)) {
    return true;
  }
  if (key && key !== VISIT_PURPOSE_KEY) return false;
  return programsFromFollowUp(task).length > 0;
}

export function serviceFollowUpProgram(task = {}) {
  const key = text(task?.purposeKey);
  for (const program of Object.keys(PROGRAM_CLASSIFICATIONS)) {
    if (servicePurposeKey(program) === key) return program;
  }
  return isScheduledServiceFollowUp(task) ? (programsFromFollowUp(task)[0] || "") : "";
}

export function emptySchedule(overrides = {}) {
  return {
    purposeKey: "",
    purpose: "",
    date: "",
    time: "",
    predecessorTaskId: null,
    sourceEntryId: "",
    needed: false,
    ...overrides,
  };
}

export function managedReturnRows(entries = [], schedules = []) {
  const byKey = new Map((schedules || []).map((item) => [item.purposeKey, item]));
  return (entries || [])
    .filter((entry) => entry?.clinicalOutcome === "managed_at_bhc" && text(entry.id))
    .map((entry) => {
      const purposeKey = entryPurposeKey(entry.id);
      const existing = byKey.get(purposeKey);
      return {
        purposeKey,
        purpose: existing?.purpose || text(entry.name) || "BHC follow-up",
        date: existing?.date || "",
        time: existing?.time || "",
        predecessorTaskId: existing?.predecessorTaskId || null,
        sourceEntryId: String(entry.id),
        needed: Boolean(existing),
        name: text(entry.name) || "Condition",
      };
    });
}

export function extraScheduleRows(schedules = [], managedKeys = new Set()) {
  return (schedules || []).filter((item) => {
    const key = text(item?.purposeKey);
    return key && !managedKeys.has(key) && !key.startsWith("entry:");
  });
}

export function visitSchedule(schedules = []) {
  return (schedules || []).find((item) => item.purposeKey === VISIT_PURPOSE_KEY) || null;
}

/**
 * Payload schedules: only returns that are actually dated. Managed rows with
 * needed=false are omitted so a locally completed concern schedules nothing.
 */
export function followUpSchedulesPayload({
  managedReturns = [],
  extraSchedules = [],
  visitFollowUp = null,
  continuedFollowUps = [],
} = {}) {
  const rows = [
    ...managedReturns.filter((row) => row.needed === true && text(row.date) && text(row.purpose)),
    ...extraSchedules.filter((row) => text(row.purpose) && text(row.date)),
    ...(visitFollowUp?.date ? [{ ...visitFollowUp, purposeKey: visitFollowUp.purposeKey || VISIT_PURPOSE_KEY, purpose: text(visitFollowUp.purpose) || "BHC follow-up" }] : []),
  ];
  return attachPredecessors(
    rows.map((row) => ({
      purposeKey: text(row.purposeKey) || VISIT_PURPOSE_KEY,
      purpose: text(row.purpose) || "BHC follow-up",
      date: text(row.date),
      time: text(row.time) || null,
      predecessorTaskId: row.predecessorTaskId || null,
      sourceEntryId: text(row.sourceEntryId) || null,
    })),
    continuedFollowUps,
  );
}

export function attachPredecessors(schedules = [], continuedFollowUps = []) {
  const continued = Array.isArray(continuedFollowUps) ? continuedFollowUps : [];
  return schedules.map((schedule) => {
    if (schedule.predecessorTaskId) return schedule;
    const scheduleKey = text(schedule.purposeKey);
    const match = continued.find((task) => {
      const key = text(task.purposeKey);
      if (key && scheduleKey && key === scheduleKey) return true;
      if (!scheduleKey.startsWith("service:")) return false;
      const program = serviceFollowUpProgram(task);
      return Boolean(program) && servicePurposeKey(program) === scheduleKey;
    });
    if (match) return { ...schedule, predecessorTaskId: Number(match.id) };
    return { ...schedule, predecessorTaskId: schedule.predecessorTaskId || null };
  });
}

export function restoreFollowUpSchedules(list, fallback = null) {
  const stored = (Array.isArray(list) ? list : [])
    .map((item) => ({
      purposeKey: text(item?.purposeKey || item?.purpose_key),
      purpose: text(item?.purpose),
      date: text(item?.date),
      time: text(item?.time) || "",
      predecessorTaskId: Number(item?.predecessorTaskId || item?.predecessor_task_id) || null,
      sourceEntryId: text(item?.sourceEntryId || item?.source_entry_id) || null,
    }))
    .filter((item) => item.purposeKey);
  if (stored.length) return stored;
  if (fallback?.bhcFollowUp === true && text(fallback.date)) {
    return [{
      purposeKey: VISIT_PURPOSE_KEY,
      purpose: text(fallback.purpose) || "BHC follow-up",
      date: text(fallback.date),
      time: text(fallback.time) || "",
      predecessorTaskId: null,
      sourceEntryId: null,
    }];
  }
  return [];
}

export function followUpScheduleErrors({ managedReturns = [], extraSchedules = [], visitFollowUp = null, visitFollowUpOn = false, reasonExempt = false } = {}) {
  const errors = {};
  for (const row of managedReturns) {
    if (row.needed !== true) continue;
    if (!text(row.date)) errors[`followUpSchedule.${row.purposeKey}.date`] = "Set the follow-up date.";
    if (!text(row.purpose)) errors[`followUpSchedule.${row.purposeKey}.purpose`] = "Describe the reason for return.";
  }
  extraSchedules.forEach((row, index) => {
    const key = text(row.purposeKey);
    if (key.startsWith("service:")) {
      if (!text(row.date)) errors[`followUpSchedule.${key}.date`] = "Set the follow-up date.";
      if (!text(row.purpose)) errors[`followUpSchedule.${key}.purpose`] = "Describe the reason for return.";
      return;
    }
    if (!text(row.purpose)) errors[`extraFollowUp.${index}.purpose`] = "Describe the reason for return.";
    if (!text(row.date)) errors[`extraFollowUp.${index}.date`] = "Set the follow-up date.";
  });
  if (visitFollowUpOn && visitFollowUp) {
    if (!text(visitFollowUp.date)) errors.followUpDate = "Set the follow-up date.";
    if (!reasonExempt && !text(visitFollowUp.purpose || visitFollowUp.reason)) errors.followUpReason = "Follow-up reason is required.";
  }
  return errors;
}

export function followUpScheduleReviewRows(schedules = []) {
  return (schedules || [])
    .filter((item) => text(item.purpose) && text(item.date))
    .map((item) => ({
      label: item.purpose,
      value: [item.date, item.time].filter(Boolean).join(" · "),
    }));
}
