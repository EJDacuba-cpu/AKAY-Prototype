import { normalizeNameKey } from "./diagnoses.js";

/**
 * Care Plan & Next Steps rules, kept out of the workspace so they are tested.
 *
 * A consultation records Health Concerns, each with an explicit care plan action
 * (No Further BHC Action, Schedule BHC Follow-up or Refer to RHU). A referral can
 * also carry the BHC follow-up flag (`bhcFollowUp`), which schedules the visit's
 * single BHC follow-up alongside the referral. Monitoring is decoupled from
 * concerns: the BHC continues rows it already follows and starts conditions the
 * RHU has confirmed; naming a concern never starts or stops monitoring.
 *
 * The worker must choose; nothing clinical is inferred or preselected.
 */
export const CARE_PLAN = Object.freeze({
  RECHECK: "recheck",
  FOLLOW_UP: "follow_up",
  REFER: "refer",
  NONE: "none",
  // Historical values: stored records keep them (read-back only). They are never
  // offered, and a draft holding one resolves to no choice (carePlanFor). A draft
  // holding recheck is moved to follow_up first (migrateLegacyConcernPlans).
  MONITOR: "monitor",
  MONITOR_REFER: "monitor_refer",
});

/** The care plan actions offered per health concern. */
export const CARE_PLAN_OPTIONS = Object.freeze([
  { value: CARE_PLAN.NONE, label: "No Further BHC Action" },
  { value: CARE_PLAN.FOLLOW_UP, label: "Schedule BHC Follow-up" },
  { value: CARE_PLAN.REFER, label: "Refer to RHU" },
]);

/** Labels for every stored value, the historical ones included (read-back). */
export const CARE_PLAN_LABELS = Object.freeze({
  ...Object.fromEntries(CARE_PLAN_OPTIONS.map((option) => [option.value, option.label])),
  [CARE_PLAN.RECHECK]: "Recheck",
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

/** Shown when a concern has no usable care plan action (validateConcernActions). */
export const CONCERN_ACTION_MESSAGE = "Choose a care plan action for this health concern.";

/** Whether the value refers to the RHU (the historical Monitor + Refer included, for stored records). */
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
 * The concern's chosen care plan action, or null. A concern starts with no
 * action, and a historical value from an old draft (recheck, monitor) is not a
 * choice, so the worker chooses again.
 */
export function carePlanFor(concern) {
  return SELECTABLE.has(concern?.carePlan) ? concern.carePlan : null;
}

/**
 * Whether the concern schedules the visit's BHC follow-up: Schedule BHC
 * Follow-up, or a referral carrying the explicit BHC follow-up flag. Mirrors
 * the server's CarePlan::schedulesBhcFollowUp, minus recheck, which a draft has
 * already moved to follow_up (migrateLegacyConcernPlans). Takes the concern
 * entry, not the value, because the flag lives on the entry.
 */
export function schedulesBhcFollowUp(concern) {
  const value = carePlanFor(concern);
  return value === CARE_PLAN.FOLLOW_UP || (value === CARE_PLAN.REFER && concern.bhcFollowUp === true);
}

/**
 * The concern with its care plan action set. The BHC follow-up flag only
 * belongs to a referral, so any other action drops it; going back to Refer to
 * RHU does not restore it (the worker ticks it again).
 */
export function withCarePlan(concern, value) {
  const { bhcFollowUp, ...rest } = concern || {};
  return value === CARE_PLAN.REFER && bhcFollowUp === true
    ? { ...rest, carePlan: value, bhcFollowUp }
    : { ...rest, carePlan: value };
}

/** The concern with the referral's BHC follow-up flag ticked or cleared; no change unless it refers to the RHU. */
export function withBhcFollowUp(concern, checked) {
  if (concern?.carePlan !== CARE_PLAN.REFER) return concern;
  const next = { ...concern };
  if (checked) next.bhcFollowUp = true;
  else delete next.bhcFollowUp;
  return next;
}

/** One error per concern without a usable care plan action, keyed carePlanAction.<concern id>. */
export function validateConcernActions(concerns = []) {
  const errors = {};
  for (const concern of concerns || []) {
    if (carePlanFor(concern) === null) errors[`carePlanAction.${concern?.id}`] = CONCERN_ACTION_MESSAGE;
  }
  return errors;
}

/**
 * A draft or record from before Schedule BHC Follow-up: Recheck becomes
 * follow_up, and an empty follow-up reason is prefilled "Recheck: A; B" from the
 * concerns that were rechecked. A reason the worker already typed is kept.
 */
export function migrateLegacyConcernPlans(diagnoses = [], followUpReason = "") {
  const list = diagnoses || [];
  const rechecked = list.filter((concern) => concern?.carePlan === CARE_PLAN.RECHECK);
  if (rechecked.length === 0) return { diagnoses: list, followUpReason };
  const names = rechecked.map((concern) => String(concern.name || "").trim()).filter(Boolean);
  const prefill = !String(followUpReason || "").trim() && names.length > 0;
  return {
    diagnoses: list.map((concern) => (concern?.carePlan === CARE_PLAN.RECHECK ? { ...concern, carePlan: CARE_PLAN.FOLLOW_UP } : concern)),
    followUpReason: prefill ? `Recheck: ${names.join("; ")}` : followUpReason,
  };
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
 * `keepsFollowUpWithReferral`: a concern schedules a BHC follow-up (Schedule BHC
 * Follow-up, or a referral flagged for it) - the concern part of the server's CarePlan::keepsFollowUpWithReferral (a dated
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
  const keepsFollowUpWithReferral = (concerns || []).some(schedulesBhcFollowUp);
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
  sharedReferralAcknowledged = false,
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
    // The worker confirmed one facility and priority suit every referred item
    // (required by the server when the referral covers 2 or more).
    shared_referral_acknowledged: sharedReferralAcknowledged === true,
  };
}
