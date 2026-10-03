import { buildPatientConsultationPath } from "./consultationRoute.js";
import { activeMonitoringsFromOverview } from "./continuedCare.js";

/**
 * The visit context the worker picks in the Start Consultation modal. It only
 * says whether the visit is new/general or a follow-up of already-monitored
 * conditions - never which BHC service was provided (that is the sidebar).
 */
export const VISIT_CONTEXT = { GENERAL: "general", MONITORING: "monitoring_follow_up" };

/**
 * The conditions the modal offers for a follow-up: active monitoring records
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

/** General can always start; a follow-up needs at least one monitored condition. */
export function canStartVisit(context, monitoringIds = []) {
  if (context === VISIT_CONTEXT.GENERAL) return true;
  if (context === VISIT_CONTEXT.MONITORING) return monitoringIds.length > 0;
  return false;
}

/** The consultation route for a chosen visit context (general ignores ticked ids). */
export function visitContextToRoute({ patientId, context, monitoringIds = [] }, basePath = "/bhc") {
  if (context === VISIT_CONTEXT.MONITORING) return selectionToRoute({ patientId, monitoringIds }, basePath);
  return buildPatientConsultationPath(patientId, basePath);
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
