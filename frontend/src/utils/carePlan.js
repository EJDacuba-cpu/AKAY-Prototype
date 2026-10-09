import { normalizeNameKey } from "./diagnoses.js";

/**
 * Care Plan & Next Steps rules, kept out of the workspace so they are tested.
 *
 * A consultation records Health Concerns, each with an optional next action
 * (Recheck, Follow-up or Refer to RHU). Monitoring is decoupled from concerns:
 * the BHC continues rows it already follows and starts conditions the RHU has
 * confirmed; naming a concern never starts or stops monitoring.
 *
 * Defaults are UI defaults only; nothing clinical is inferred.
 */
export const CARE_PLAN = Object.freeze({
  RECHECK: "recheck",
  FOLLOW_UP: "follow_up",
  REFER: "refer",
  // Retired values: stored records keep them (read-back only). They are never
  // offered, and a draft holding one resolves to no choice (carePlanFor).
  NONE: "none",
  MONITOR: "monitor",
  MONITOR_REFER: "monitor_refer",
});

/** The next actions offered per health concern. */
export const CARE_PLAN_OPTIONS = Object.freeze([
  { value: CARE_PLAN.RECHECK, label: "Recheck" },
  { value: CARE_PLAN.FOLLOW_UP, label: "Follow-up" },
  { value: CARE_PLAN.REFER, label: "Refer to RHU" },
]);

/** Labels for every stored value, the retired ones included (read-back). */
export const CARE_PLAN_LABELS = Object.freeze({
  ...Object.fromEntries(CARE_PLAN_OPTIONS.map((option) => [option.value, option.label])),
  [CARE_PLAN.NONE]: "No Ongoing Tracking",
  [CARE_PLAN.MONITOR]: "Monitor at BHC",
  [CARE_PLAN.MONITOR_REFER]: "Monitor at BHC + Refer to RHU",
});

/** Shown instead of the next-action choices when the visit records no health concern. */
export const NO_CONCERN_MESSAGE = "No health concern was recorded for this visit.";

const VALUES = new Set(Object.values(CARE_PLAN));
const SELECTABLE = new Set(CARE_PLAN_OPTIONS.map((option) => option.value));

/** Any value a stored record may hold, retired ones included. */
export function isCarePlanValue(value) {
  return VALUES.has(value);
}

/** Whether the BHC itself brings the patient back (Recheck or Follow-up). */
export function keepsBhcFollowUp(value) {
  return value === CARE_PLAN.RECHECK || value === CARE_PLAN.FOLLOW_UP;
}

/** Whether the value refers to the RHU (the retired Monitor + Refer included, for stored records). */
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

/**
 * The concern's chosen next action, or null. A concern starts with none, and a
 * retired value from an old draft is not a choice, so the worker chooses again.
 */
export function carePlanFor(concern) {
  return SELECTABLE.has(concern?.carePlan) ? concern.carePlan : null;
}

/**
 * "Recheck: A; B" from the concerns set to Recheck, or "". Display/preview
 * only: the server builds the stored follow-up reason itself.
 */
export function recheckReason(concerns = []) {
  const names = (concerns || [])
    .filter((concern) => carePlanFor(concern) === CARE_PLAN.RECHECK)
    .map((concern) => String(concern.name || "").trim())
    .filter(Boolean);
  return names.length ? `Recheck: ${names.join("; ")}` : "";
}

/**
 * Continued monitoring this visit ends: a stop entry (a key in `stops`, "" until
 * a reason is typed) on a row that is continued. Each needs a reason.
 */
export function stopsRequired(continuedMonitorings = [], stops = {}) {
  const required = {};
  for (const monitoring of continuedMonitorings || []) {
    if (Object.hasOwn(stops || {}, monitoring.id)) required[monitoring.id] = true;
  }
  return required;
}

/**
 * Followed conditions the worker refers to the RHU. A stop wins over a stale
 * referral. The monitoring itself stays active.
 */
export function referredContinuingRows(continuedMonitorings = [], stops = {}, referrals = []) {
  const ids = new Set((referrals || []).map(Number));
  return (continuedMonitorings || []).filter(
    (monitoring) => ids.has(Number(monitoring.id)) && !Object.hasOwn(stops || {}, monitoring.id),
  );
}

export function referredConcerns(concerns = []) {
  return (concerns || []).filter((concern) => refers(carePlanFor(concern)));
}

export function buildReferralReason(concerns = [], continuedMonitorings = [], referrals = []) {
  const names = [
    ...referredConcerns(concerns).map((concern) => String(concern.name).trim()),
    ...referredContinuingRows(continuedMonitorings, {}, referrals).map((monitoring) => String(monitoring.conditionName).trim()),
  ];
  return names.length ? `Referred for: ${names.join("; ")}` : "";
}

/**
 * Registry keys (null for free text) of every condition monitored after this
 * visit: continued rows not stopped, plus the conditions being started. A
 * follow-up's continued conditions arrive without a key (care-overview).
 */
export function monitoredConditionKeys(continuedMonitorings = [], startingConditions = [], stops = {}, registry = {}) {
  const required = stopsRequired(continuedMonitorings, stops);
  const keyOf = (condition) => condition.conditionKey || matchConditionKey(condition.conditionName, registry);
  return [
    ...(continuedMonitorings || []).filter((monitoring) => !required[monitoring.id]).map(keyOf),
    ...(startingConditions || []).map(keyOf),
  ];
}

/**
 * `monitorsAny`: some condition stays monitored after this visit.
 * `keepsFollowUpWithReferral`: a concern is set to Recheck or Follow-up - the
 * concern part of the server's CarePlan::keepsFollowUpWithReferral (a dated
 * service visit is the other part, see followUpPlan).
 */
export function deriveDisposition({
  concerns = [],
  continuedMonitorings = [],
  startingConditions = [],
  stops = {},
  referrals = [],
  registry = {},
  serviceNeedsNextVisit = false,
} = {}) {
  const needsReferral =
    referredConcerns(concerns).length > 0 || referredContinuingRows(continuedMonitorings, stops, referrals).length > 0;
  const monitorsAny = monitoredConditionKeys(continuedMonitorings, startingConditions, stops, registry).length > 0;
  const keepsFollowUpWithReferral = (concerns || []).some((concern) => keepsBhcFollowUp(carePlanFor(concern)));
  return {
    needsReferral,
    showsFollowUp: keepsFollowUpWithReferral || monitorsAny || serviceNeedsNextVisit,
    monitorsAny,
    keepsFollowUpWithReferral,
  };
}

export function validateCarePlan({ continuedMonitorings = [], stops = {} } = {}) {
  const errors = {};
  for (const monitoringId of Object.keys(stopsRequired(continuedMonitorings, stops))) {
    if (!String(stops[monitoringId] || "").trim()) {
      errors[`carePlanStop.${monitoringId}`] = "Give a reason for stopping monitoring.";
    }
  }
  return errors;
}

export function buildCarePlanPayload({
  continuedFollowUpTaskIds = [],
  continuedMonitorings = [],
  startingConditions = [],
  stops = {},
  referrals = [],
} = {}) {
  const required = stopsRequired(continuedMonitorings, stops);
  return {
    continued_follow_up_task_ids: continuedFollowUpTaskIds.map(Number),
    continued_monitoring_ids: continuedMonitorings.map((monitoring) => Number(monitoring.id)),
    // RHU-confirmed conditions the BHC starts monitoring this visit.
    start_monitoring_condition_ids: startingConditions.map((condition) => Number(condition.id)),
    monitoring_stops: Object.keys(required)
      .map((id) => ({ monitoring_id: Number(id), reason: String(stops[id] || "").trim() }))
      .filter((stop) => stop.reason),
    // A followed condition referred to the RHU (its monitoring stays active).
    monitoring_referrals: referredContinuingRows(continuedMonitorings, stops, referrals).map((monitoring) => Number(monitoring.id)),
  };
}
