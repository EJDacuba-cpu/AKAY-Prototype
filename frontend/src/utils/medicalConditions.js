import { conditionIdentity } from "./carePlan.js";

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
      monitoring: c.monitoring ? { id: c.monitoring.id, startedAt: c.monitoring.started_at } : null,
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
 * - confirmed: active/controlled conditions (kind "rhu") + legacy monitorings
 *   (kind "legacy-monitoring"), which were monitored before confirmation existed;
 * - underEvaluation / past: separate, and never alert;
 * - unverified: background entries not marked Patient-reported (legacy
 *   consultation entries) that match no condition or legacy monitoring, so a
 *   confirmed condition is not listed twice;
 * - patientReported: background entries the patient reported.
 * Background entries keep their array position as `index`.
 */
export function groupMedicalConditions({
  conditions = [],
  legacyMonitorings = [],
  currentDiseases = [],
  registry = {},
} = {}) {
  const known = new Set([
    ...conditions.map((c) => c.conditionIdentity || conditionIdentity(c.conditionName, registry)),
    ...legacyMonitorings.map((m) => m.conditionIdentity || conditionIdentity(m.conditionName, registry)),
  ]);

  const unverified = [];
  const patientReported = [];
  currentDiseases.forEach((disease, index) => {
    if (disease?.source === PATIENT_REPORTED) {
      patientReported.push({ ...disease, index });
    } else if (!known.has(conditionIdentity(disease?.name, registry))) {
      unverified.push({ ...disease, index });
    }
  });

  return {
    confirmed: [
      ...conditions.filter((c) => CONFIRMED_STATUSES.has(c.status)).map((c) => ({ ...c, kind: "rhu" })),
      ...legacyMonitorings.map((m) => ({ ...m, kind: "legacy-monitoring" })),
    ],
    underEvaluation: conditions.filter((c) => c.status === "under_evaluation").map((c) => ({ ...c, kind: "rhu" })),
    unverified,
    patientReported,
    past: conditions.filter((c) => PAST_STATUSES.has(c.status)).map((c) => ({ ...c, kind: "rhu" })),
  };
}

/** Condition names that raise an alert: confirmed only. */
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
