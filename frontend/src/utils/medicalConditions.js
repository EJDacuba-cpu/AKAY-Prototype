/**
 * A patient's medical conditions as the profile and the consultation show them
 * (GET /patients/{id}/conditions + the patient background), grouped by how far
 * each has been confirmed. Only an RHU-confirmed condition (active/controlled)
 * or a pre-confirmation legacy monitoring is "confirmed"; BHC entries are
 * never promoted by the client.
 */

const CONFIRMED_STATUSES = new Set(["active", "controlled"]);
const PAST_STATUSES = new Set(["resolved", "ruled_out"]);
const PATIENT_REPORTED = "Patient-reported";

const STATUS_LABELS = Object.freeze({
  under_evaluation: "Under Evaluation",
  active: "Active",
  controlled: "Controlled",
  resolved: "Resolved",
  ruled_out: "Ruled Out",
});

/** The RHU status as the worker reads it; "" for none, the raw value if unknown. */
export function conditionStatusLabel(status) {
  if (!status) return "";
  return STATUS_LABELS[status] || String(status);
}

const EVENT_SOURCE_LABELS = Object.freeze({
  rhu_feedback: "RHU feedback",
  rhu_record: "RHU record",
});

/** Where a status change came from: "RHU feedback" or "RHU record". */
export function conditionEventSourceLabel(sourceType) {
  return EVENT_SOURCE_LABELS[sourceType] || "";
}

/** GET /patients/{id}/conditions in the client's shape. */
export function mapPatientConditions(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    conditions: (source.conditions || []).map((c) => ({
      id: c.id,
      conditionName: c.condition_name,
      conditionIdentity: c.condition_identity,
      status: c.status,
      confirmedAt: c.confirmed_at,
      confirmedByName: c.confirmed_by_name,
      sourceType: c.source_type,
      sourceId: c.source_id,
      bhcMonitoringRecommendedAt: c.bhc_monitoring_recommended_at,
      monitoring: c.monitoring ? {
        id: c.monitoring.id,
        startedAt: c.monitoring.started_at,
        status: c.monitoring.status || "active",
      } : null,
      events: (c.events || []).map((e) => ({
        fromStatus: e.from_status,
        toStatus: e.to_status,
        note: e.note,
        sourceType: e.source_type,
        sourceId: e.source_id,
        changedByName: e.changed_by_name,
        changedAt: e.changed_at,
      })),
    })),
    legacyMonitorings: (source.legacy_monitorings || []).map((m) => ({
      id: m.id,
      conditionName: m.condition_name,
      conditionKey: m.condition_key,
      conditionIdentity: m.condition_identity,
      startedAt: m.started_at,
    })),
  };
}

/**
 * Groups conditions for display:
 * - confirmed: active/controlled conditions (kind "rhu"); alerts;
 * - legacyPending: legacy monitorings (kind "legacy-monitoring"), monitored
 *   before confirmation existed and pending RHU verification; listed apart from
 *   verified monitoring and never alert;
 * - underEvaluation / past: separate, and never alert;
 * - patientReported: background entries the patient reported (source
 *   "Patient-reported"); they never count as confirmed.
 * Background entries keep their array position as `index`.
 */
export function groupMedicalConditions({
  conditions = [],
  legacyMonitorings = [],
  currentDiseases = [],
} = {}) {
  const patientReported = [];
  currentDiseases.forEach((disease, index) => {
    if (disease?.source === PATIENT_REPORTED) patientReported.push({ ...disease, index });
  });

  return {
    confirmed: [
      ...conditions.filter((c) => CONFIRMED_STATUSES.has(c.status)).map((c) => ({ ...c, kind: "rhu" })),
    ],
    legacyPending: legacyMonitorings.map((m) => ({ ...m, kind: "legacy-monitoring" })),
    underEvaluation: conditions.filter((c) => c.status === "under_evaluation").map((c) => ({ ...c, kind: "rhu" })),
    patientReported,
    past: conditions.filter((c) => PAST_STATUSES.has(c.status)).map((c) => ({ ...c, kind: "rhu" })),
  };
}

/** Condition names that raise an alert: RHU-confirmed only (not legacy pending verification). */
export function alertConditionNames(groups) {
  return (groups?.confirmed || []).map((c) => c.conditionName);
}

/**
 * The confirmed conditions BHC may start monitoring (the care overview's
 * `monitoringRecommendations`), alphabetical.
 */
export function monitoringRecommendationOptions(overview) {
  return (overview?.monitoringRecommendations || [])
    .map(({ conditionId, conditionName, status, confirmedAt, recommendedAt }) => ({
      conditionId,
      conditionName,
      status,
      confirmedAt,
      recommendedAt,
    }))
    .sort((a, b) => a.conditionName.localeCompare(b.conditionName, undefined, { sensitivity: "base" }));
}
