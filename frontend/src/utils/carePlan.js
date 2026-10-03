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
  // Retired "Monitor at BHC + Refer to RHU": older records keep it; it is no
  // longer offered, and a draft holding it resolves to Refer (carePlanFor).
  MONITOR_REFER: "monitor_refer",
});

/** The choices offered per diagnosis. */
export const CARE_PLAN_OPTIONS = Object.freeze([
  { value: CARE_PLAN.NONE, label: "No Ongoing Tracking" },
  { value: CARE_PLAN.MONITOR, label: "Monitor at BHC" },
  { value: CARE_PLAN.REFER, label: "Refer to RHU" },
]);

/** Labels for every stored value, the retired one included (read-back). */
export const CARE_PLAN_LABELS = Object.freeze({
  ...Object.fromEntries(CARE_PLAN_OPTIONS.map((option) => [option.value, option.label])),
  [CARE_PLAN.MONITOR_REFER]: "Monitor at BHC + Refer to RHU",
});

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
  if (diagnosis?.carePlan === CARE_PLAN.MONITOR_REFER) return CARE_PLAN.REFER;
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

/** A continued condition re-diagnosed as No Ongoing Tracking ends its monitoring. */
export function endsMonitoring(value) {
  return value === CARE_PLAN.NONE;
}

/**
 * Continued monitoring this visit ends: a re-diagnosed condition set to No
 * Ongoing Tracking, or a part-B row with a stop entry. Each needs a reason.
 * Refer to RHU keeps the monitoring active; the referral is tracked on its own.
 */
export function stopsRequired(diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}) {
  const required = {};
  for (const diagnosis of diagnoses || []) {
    const monitoring = continuedFor(diagnosis, continuedMonitorings, registry);
    if (monitoring && endsMonitoring(carePlanFor(diagnosis, continuedMonitorings, registry))) {
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

function monitoredDiagnoses(diagnoses, continuedMonitorings, registry) {
  return (diagnoses || []).filter((diagnosis) => monitors(carePlanFor(diagnosis, continuedMonitorings, registry)));
}

/** Registry keys (null for free text) of every condition monitored after this visit. */
export function monitoredConditionKeys(diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}) {
  const required = stopsRequired(diagnoses, continuedMonitorings, stops, registry);
  const monitored = monitoredDiagnoses(diagnoses, continuedMonitorings, registry);
  const keys = monitored.map((diagnosis) => matchConditionKey(diagnosis.name, registry));
  const monitoredIdentities = new Set(monitored.map((diagnosis) => conditionIdentity(diagnosis.name, registry)));
  for (const monitoring of continuedMonitorings) {
    // Diagnosed as Monitor: already counted above. Otherwise (a part-B row,
    // or re-diagnosed as Refer) it stays monitored unless stopped. A
    // follow-up's continued conditions arrive without a key (care-overview).
    if (monitoredIdentities.has(monitoringIdentity(monitoring, registry)) || required[monitoring.id]) continue;
    keys.push(monitoring.conditionKey || matchConditionKey(monitoring.conditionName, registry));
  }
  return keys;
}

/**
 * `monitorsAny`: some condition stays monitored after this visit.
 * `monitorsDiagnosis`: a diagnosis is set to Monitor at BHC - the only
 * monitoring that keeps the follow-up through a referral (the server's
 * CarePlan::keepsFollowUpWithReferral).
 */
export function deriveDisposition({ diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}, serviceNeedsNextVisit = false } = {}) {
  const needsReferral = referredDiagnoses(diagnoses, continuedMonitorings, registry).length > 0;
  const monitorsAny = monitoredConditionKeys(diagnoses, continuedMonitorings, stops, registry).length > 0;
  const monitorsDiagnosis = monitoredDiagnoses(diagnoses, continuedMonitorings, registry).length > 0;
  return { needsReferral, showsFollowUp: monitorsAny || serviceNeedsNextVisit, monitorsAny, monitorsDiagnosis };
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
