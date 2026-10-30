import { buildPatientConsultationPath } from "./consultationRoute.js";
import { activeMonitoringsFromOverview, resolveContinuedCare } from "./continuedCare.js";
import { monitoringRecommendationOptions } from "./medicalConditions.js";

function byConditionName(a, b) {
  return a.conditionName.localeCompare(b.conditionName, undefined, { sensitivity: "base" });
}

/**
 * The conditions the modal offers: active, RHU-verified monitoring records
 * only (not Past Medical History, not legacy rows - those wait for the RHU,
 * see legacyMonitoringOptions), each once, alphabetical. `followUp` is the
 * earliest-due pending follow-up that links the condition, else null.
 */
export function monitoredConditionOptions(overview) {
  const pending = overview?.pendingFollowUps || [];
  return activeMonitoringsFromOverview(overview)
    .filter((monitoring) => monitoring.legacy !== true)
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
    .sort(byConditionName);
}

/**
 * Legacy BHC monitoring (no RHU-confirmed condition behind it): listed for
 * information, never selectable, because the server rejects continuing one
 * until the RHU reconciles it.
 */
export function legacyMonitoringOptions(overview) {
  return activeMonitoringsFromOverview(overview)
    .filter((monitoring) => monitoring.legacy === true)
    .map((monitoring) => ({
      monitoringId: monitoring.id,
      conditionName: monitoring.conditionName,
      startedAt: monitoring.startedAt,
    }))
    .sort(byConditionName);
}

/**
 * Pending follow-up tasks the worker may optionally attend this visit: those
 * with no RHU-verified active condition behind them (Health Concern
 * follow-ups, which link none, and tasks whose only monitoring is legacy).
 * A task linked to verified monitoring stays with that monitoring - ticking
 * the monitoring continues it. Earliest due first.
 */
function mapFollowUpOption(task) {
  return {
    followUpId: Number(task.id),
    reason: task.purpose || task.reason || "",
    purpose: task.purpose || task.reason || "",
    purposeKey: task.purposeKey || "",
    dueDate: task.dueDate || "",
    isOverdue: task.isOverdue === true,
    sourceDate: task.sourceDate || "",
    sourceChiefComplaint: task.sourceChiefComplaint || "",
    sourceAssessment: task.sourceAssessment || "",
    ruralHealthUnitId: Number(task.ruralHealthUnitId || task.rural_health_unit_id || 0) || null,
    barangayHealthCenterId: Number(task.barangayHealthCenterId || task.barangay_health_center_id || 0) || null,
  };
}

/** Every pending follow-up the Continue path may select, earliest due first. */
export function pendingFollowUpOptions(overview, { facility = "any" } = {}) {
  return (overview?.pendingFollowUps || [])
    .map(mapFollowUpOption)
    .filter((task) => facility !== "rhu" || Number(task.ruralHealthUnitId) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.followUpId - b.followUpId);
}

/**
 * Pending follow-up tasks without a verified monitored condition. Monitoring-
 * linked appointments appear with that monitoring; the Continue path uses
 * pendingFollowUpOptions so those appointments can still be selected directly.
 */
export function scheduledFollowUpOptions(overview) {
  return (overview?.pendingFollowUps || [])
    .filter((task) =>
      !(task.conditions || []).some((condition) => Number(condition.monitoringId) > 0 && condition.legacy !== true),
    )
    .map(mapFollowUpOption)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.followUpId - b.followUpId);
}

/**
 * Whether Start Consultation has optional continue/monitoring context to
 * offer. The modal still opens for a first-visit patient (New Consultation);
 * this only decides whether Continue Scheduled Follow-up is available.
 */
export function hasStartChoices(overview) {
  return (
    monitoredConditionOptions(overview).length > 0 ||
    monitoringRecommendationOptions(overview).length > 0 ||
    pendingFollowUpOptions(overview).length > 0 ||
    legacyMonitoringOptions(overview).length > 0
  );
}

/** Resume an unfinished draft skips the modal; every new start confirms in it. */
export function consultationNeedsStartModal(draft) {
  return !draft;
}

/** Actionable start failure copy. The generic patient-load line is only the last fallback. */
export function startConsultationFailureMessage(error, nothingTicked = true) {
  const detail = String(error?.message || "").trim();
  if (detail) return detail;
  return nothingTicked
    ? "Patient details could not be loaded. Try again."
    : "Records could not be loaded. Try again, or untick them to start a normal consultation.";
}

/**
 * What a Start / Resume Consultation action does with usePatientConsultation's
 * state: "disabled" while it is still checking (or the draft check failed, or a
 * discard is running), "modal" when a new consultation needs confirmation
 * (the hook never asks for the modal while a draft exists - Resume wins), else
 * "link" (to the unfinished draft).
 */
export function startConsultationAction(consultation) {
  if (!consultation || consultation.isPending || consultation.isError || consultation.discarding) return "disabled";
  return consultation.needsStartModal ? "modal" : "link";
}

/**
 * The step-flow consultation route that continues the chosen follow-ups and
 * monitoring (read back by utils/consultationRoute as kind "continue").
 */
export function selectionToRoute(
  { patientId, followUpIds = [], monitoringIds = [], startConditionIds = [] },
  basePath = "/bhc",
) {
  const params = new URLSearchParams({ patientId: String(patientId), mode: "continue" });
  if (followUpIds.length) params.set("followUpIds", followUpIds.join(","));
  if (monitoringIds.length) params.set("monitoringIds", monitoringIds.join(","));
  if (startConditionIds.length) params.set("startConditionIds", startConditionIds.join(","));
  return `${basePath}/health-records/add?${params.toString()}`;
}

/**
 * The consultation route for what the worker ticked in the Start Consultation
 * modal: nothing ticked is a normal consultation, otherwise the same
 * consultation carries the chosen monitoring, scheduled follow-ups and the
 * confirmed conditions to start monitoring (no separate record).
 */
export function startRoute(
  { patientId, monitoringIds = [], startConditionIds = [], followUpIds = [] },
  basePath = "/bhc",
) {
  return monitoringIds.length || startConditionIds.length || followUpIds.length
    ? selectionToRoute({ patientId, monitoringIds, startConditionIds, followUpIds }, basePath)
    : buildPatientConsultationPath(patientId, basePath);
}

/**
 * Checks the worker's ticked monitoring, scheduled follow-ups and recommended
 * conditions against a fresh care overview just before the workspace opens: a
 * record stopped or completed, a follow-up fulfilled, or a recommendation
 * withdrawn, since the modal was read is reported (never silently dropped), so
 * the modal can say so.
 */
export function checkContinuedStart(overview, monitoringIds = [], startConditionIds = [], followUpIds = []) {
  const { droppedMonitoringIds, droppedConditionIds, droppedFollowUpIds } = resolveContinuedCare(overview, {
    followUpIds,
    monitoringIds,
    startConditionIds,
    includeLinkedFollowUps: false,
  });
  return {
    ok: droppedMonitoringIds.length === 0 && droppedConditionIds.length === 0 && droppedFollowUpIds.length === 0,
    droppedMonitoringIds,
    droppedConditionIds,
    droppedFollowUpIds,
  };
}

/**
 * Whether the browser is now at `path` (pathname and query). Opening the
 * workspace checks this after navigate(): a leave guard (an unsaved Patient
 * Background edit) can stop the navigation, and the Start / Resume button must
 * then stop showing "Opening..." instead of staying disabled.
 */
export function reachedPath(location, path) {
  if (!location || !path) return false;
  const [pathname, query = ""] = String(path).split("?");
  const search = query ? `?${query}` : "";
  return location.pathname === pathname && (location.search || "") === search;
}
