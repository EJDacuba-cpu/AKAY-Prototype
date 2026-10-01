import { normalizeNameKey } from "./diagnoses.js";

/**
 * Care Plan & Next Steps rules, kept out of the workspace so they are tested.
 * See docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 *
 * Defaults are UI defaults only; nothing clinical is inferred.
 */
export const CARE_PLAN = Object.freeze({
  NONE: "none",
  MONITOR: "monitor",
  REFER: "refer",
  MONITOR_REFER: "monitor_refer",
});

export const CARE_PLAN_OPTIONS = Object.freeze([
  { value: CARE_PLAN.NONE, label: "No Ongoing Tracking" },
  { value: CARE_PLAN.MONITOR, label: "Monitor at BHC" },
  { value: CARE_PLAN.REFER, label: "Refer to RHU" },
  { value: CARE_PLAN.MONITOR_REFER, label: "Monitor at BHC + Refer to RHU" },
]);

const VALUES = new Set(Object.values(CARE_PLAN));

export function isCarePlanValue(value) {
  return VALUES.has(value);
}

export function monitors(value) {
  return value === CARE_PLAN.MONITOR || value === CARE_PLAN.MONITOR_REFER;
}

export function refers(value) {
  return value === CARE_PLAN.REFER || value === CARE_PLAN.MONITOR_REFER;
}

/** Same exact, case/space-insensitive name-or-alias match the backend uses. */
export function matchConditionKey(name, registry = {}) {
  const key = normalizeNameKey(name);
  if (!key) return null;
  for (const [conditionKey, entry] of Object.entries(registry?.monitored_conditions || {})) {
    const names = [entry?.name, ...(entry?.aliases || [])];
    if (names.some((candidate) => normalizeNameKey(candidate) === key)) return conditionKey;
  }
  return null;
}

export function conditionIdentity(name, registry = {}) {
  return matchConditionKey(name, registry) || `name:${normalizeNameKey(name)}`;
}

function monitoringIdentity(monitoring, registry) {
  return monitoring?.conditionKey || conditionIdentity(monitoring?.conditionName, registry);
}

export function continuedByIdentity(continuedMonitorings = [], registry = {}) {
  return new Map(continuedMonitorings.map((monitoring) => [monitoringIdentity(monitoring, registry), monitoring]));
}

function continuedFor(diagnosis, continuedMonitorings, registry) {
  return continuedByIdentity(continuedMonitorings, registry).get(conditionIdentity(diagnosis?.name, registry)) || null;
}

/** Continued conditions stay monitored unless the worker explicitly changes them. */
export function defaultCarePlan(diagnosis, continuedMonitorings = [], registry = {}) {
  return continuedFor(diagnosis, continuedMonitorings, registry) ? CARE_PLAN.MONITOR : CARE_PLAN.NONE;
}

export function carePlanFor(diagnosis, continuedMonitorings = [], registry = {}) {
  return isCarePlanValue(diagnosis?.carePlan)
    ? diagnosis.carePlan
    : defaultCarePlan(diagnosis, continuedMonitorings, registry);
}

function diagnosedIdentities(diagnoses, registry) {
  return new Set((diagnoses || []).map((diagnosis) => conditionIdentity(diagnosis?.name, registry)));
}

/** Continued monitoring whose condition was not diagnosed this visit (Care Plan part B rows). */
export function continuingRows(diagnoses = [], continuedMonitorings = [], registry = {}) {
  const diagnosed = diagnosedIdentities(diagnoses, registry);
  return continuedMonitorings.filter((monitoring) => !diagnosed.has(monitoringIdentity(monitoring, registry)));
}

/**
 * Continued monitoring this visit ends: a re-diagnosed condition set to a
 * non-monitoring plan, or a part-B row with a stop entry. Each needs a reason.
 */
export function stopsRequired(diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}) {
  const required = {};
  for (const diagnosis of diagnoses || []) {
    const monitoring = continuedFor(diagnosis, continuedMonitorings, registry);
    if (monitoring && !monitors(carePlanFor(diagnosis, continuedMonitorings, registry))) {
      required[monitoring.id] = true;
    }
  }
  for (const monitoring of continuingRows(diagnoses, continuedMonitorings, registry)) {
    if (Object.hasOwn(stops, monitoring.id)) required[monitoring.id] = true;
  }
  return required;
}

export function referredDiagnoses(diagnoses = [], continuedMonitorings = [], registry = {}) {
  return (diagnoses || []).filter((diagnosis) => refers(carePlanFor(diagnosis, continuedMonitorings, registry)));
}

export function buildReferralReason(diagnoses = [], continuedMonitorings = [], registry = {}) {
  const names = referredDiagnoses(diagnoses, continuedMonitorings, registry).map((diagnosis) => String(diagnosis.name).trim());
  return names.length ? `Referred for: ${names.join("; ")}` : "";
}

/** Registry keys (null for free text) of every condition monitored after this visit. */
export function monitoredConditionKeys(diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}) {
  const required = stopsRequired(diagnoses, continuedMonitorings, stops, registry);
  const keys = (diagnoses || [])
    .filter((diagnosis) => monitors(carePlanFor(diagnosis, continuedMonitorings, registry)))
    .map((diagnosis) => matchConditionKey(diagnosis.name, registry));
  for (const monitoring of continuingRows(diagnoses, continuedMonitorings, registry)) {
    if (!required[monitoring.id]) keys.push(monitoring.conditionKey || null);
  }
  return keys;
}

export function deriveDisposition({ diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}, serviceNeedsNextVisit = false } = {}) {
  const needsReferral = referredDiagnoses(diagnoses, continuedMonitorings, registry).length > 0;
  const monitorsAny = monitoredConditionKeys(diagnoses, continuedMonitorings, stops, registry).length > 0;
  return { needsReferral, showsFollowUp: monitorsAny || serviceNeedsNextVisit, monitorsAny };
}

export function validateCarePlan({ diagnoses = [], continuedMonitorings = [], stops = {}, registry = {} } = {}) {
  const errors = {};
  for (const monitoringId of Object.keys(stopsRequired(diagnoses, continuedMonitorings, stops, registry))) {
    if (!String(stops[monitoringId] || "").trim()) {
      errors[`carePlanStop.${monitoringId}`] = "Give a reason for stopping monitoring.";
    }
  }
  return errors;
}

export function buildCarePlanPayload({ continuedFollowUpTaskIds = [], continuedMonitorings = [], stops = {}, diagnoses = [], registry = {} } = {}) {
  const required = stopsRequired(diagnoses, continuedMonitorings, stops, registry);
  return {
    continued_follow_up_task_ids: continuedFollowUpTaskIds.map(Number),
    continued_monitoring_ids: continuedMonitorings.map((monitoring) => Number(monitoring.id)),
    monitoring_stops: Object.keys(required)
      .map((id) => ({ monitoring_id: Number(id), reason: String(stops[id] || "").trim() }))
      .filter((stop) => stop.reason),
  };
}
