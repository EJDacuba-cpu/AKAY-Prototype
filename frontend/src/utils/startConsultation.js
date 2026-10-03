import { buildPatientConsultationPath } from "./consultationRoute.js";
import { activeMonitoringsFromOverview } from "./continuedCare.js";

/**
 * The conditions the modal offers: active monitoring records
 * only (not Past Medical History), each once, alphabetical. `followUp` is the
 * earliest-due pending follow-up that links the condition, else null.
 */
export function monitoredConditionOptions(overview) {
  const pending = overview?.pendingFollowUps || [];
  return activeMonitoringsFromOverview(overview)
    .map((monitoring) => {
      const due = pending
        .filter((task) => (task.conditions || []).some((c) => Number(c.monitoringId) === monitoring.id))
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
      return {
        monitoringId: monitoring.id,
        conditionName: monitoring.conditionName,
        startedAt: monitoring.startedAt,
        followUp: due ? { dueDate: due.dueDate, isOverdue: due.isOverdue === true } : null,
      };
    })
    .sort((a, b) => a.conditionName.localeCompare(b.conditionName, undefined, { sensitivity: "base" }));
}

/**
 * Whether Start Consultation has anything to ask. Existing monitoring is an
 * optional context on the one encounter, so a patient with no active
 * monitoring record skips the modal and goes straight to the workspace.
 */
export function hasMonitoredConditions(overview) {
  return monitoredConditionOptions(overview).length > 0;
}

/**
 * What a Start / Resume Consultation action does with usePatientConsultation's
 * state: "disabled" while it is still checking (or the draft check failed, or a
 * discard is running), "modal" when there is something to continue (the hook
 * never asks for the modal while a draft exists - Resume wins), else "link"
 * (to the draft, or to a new consultation).
 */
export function startConsultationAction(consultation) {
  if (!consultation || consultation.isPending || consultation.isError || consultation.discarding) return "disabled";
  return consultation.needsStartModal ? "modal" : "link";
}

/**
 * The step-flow consultation route that continues the chosen follow-ups and
 * monitoring (read back by utils/consultationRoute as kind "continue").
 */
export function selectionToRoute({ patientId, followUpIds = [], monitoringIds = [] }, basePath = "/bhc") {
  const params = new URLSearchParams({ patientId: String(patientId), mode: "continue" });
  if (followUpIds.length) params.set("followUpIds", followUpIds.join(","));
  if (monitoringIds.length) params.set("monitoringIds", monitoringIds.join(","));
  return `${basePath}/health-records/add?${params.toString()}`;
}

/**
 * The consultation route for what the worker ticked in the Start Consultation
 * modal: nothing ticked is a normal consultation, otherwise the same
 * consultation carries the chosen monitoring (no separate record).
 */
export function startRoute({ patientId, monitoringIds = [] }, basePath = "/bhc") {
  return monitoringIds.length
    ? selectionToRoute({ patientId, monitoringIds }, basePath)
    : buildPatientConsultationPath(patientId, basePath);
}
