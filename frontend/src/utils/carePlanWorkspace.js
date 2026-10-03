import {
  CARE_PLAN,
  CARE_PLAN_LABELS,
  carePlanFor,
  continuedByIdentity,
  conditionIdentity,
  continuingRows,
  referredContinuingRows,
  stopsRequired,
  NO_CONDITION_MESSAGE,
} from "./carePlan.js";
import { CONDITION_STATUSES } from "./diagnoses.js";
import { MONITORING_STEP, NEXT_STEP, REVIEW_STEP } from "./consultationSteps.js";

/**
 * The New Consultation workspace's Care Plan & Next Steps bookkeeping: what it
 * shows, what a draft stores, and where Continue / Previous go. Kept here, out
 * of the workspace page, so it is tested. The clinical rules themselves live in
 * utils/carePlan.js.
 */

/**
 * Whether the visit's single follow-up survives, and whether its fields show.
 *
 * A plain referral hands the follow-up to the RHU (the server clears it), so
 * it is neither shown nor required - even when a referred condition's existing
 * monitoring stays active. A referral keeps it when a diagnosis is set to
 * Monitor at BHC, or when it is a service visit (`hasService`: Maternal /
 * Family Planning / EPI selected) with a follow-up date set - the next dose,
 * appointment or prenatal return. Same rule as the server's
 * CarePlan::keepsFollowUpWithReferral. A referred service visit keeps showing
 * the fields so that date can be set. A date that is already set - pre-filled
 * from a Family Planning appointment, or left from an earlier choice - keeps
 * the fields on screen so the worker can see and clear it.
 */
export function followUpPlan(disposition = {}, followUpDate = "", { hasService = false } = {}) {
  const referred = Boolean(disposition.needsReferral);
  const monitors = Boolean(disposition.monitorsDiagnosis);
  const kept = !referred || monitors || (Boolean(hasService) && Boolean(followUpDate));
  const offered = !referred || monitors || Boolean(hasService);
  return { kept, shows: offered && (Boolean(disposition.showsFollowUp) || Boolean(followUpDate)) };
}

/**
 * Whether the "Referred for: ..." prefill should be rewritten to `next` (the
 * text built from the diagnoses referred now). Only while the reason is empty
 * or still exactly the last text filled in automatically (`lastAuto`); once
 * the worker edits it - or it came back from a draft - it is never overwritten.
 */
export function shouldRegenerateReferralReason({ current = "", lastAuto = "", next = "" } = {}) {
  const text = String(current ?? "");
  if (!next || text === next) return false;
  return text.trim() === "" || text === lastAuto;
}

/** The follow-up reason is required once a date is set (frontend-only rule). */
export function carePlanFollowUpErrors({ kept = true, followUpDate = "", followUpReason = "" } = {}) {
  if (kept && followUpDate && !String(followUpReason || "").trim()) {
    return { followUpReason: "Follow-up reason is required." };
  }
  return {};
}

/** `reason === null` continues the monitoring; any string (even "") stops it. */
export function setMonitoringStop(stops = {}, monitoringId, reason) {
  const next = { ...stops };
  if (reason === null) delete next[monitoringId];
  else next[monitoringId] = reason;
  return next;
}

/**
 * One decision per followed condition: continue monitoring at BHC, refer to
 * the RHU (monitoring stays active), or stop BHC monitoring (a key in `stops`,
 * "" until a reason is typed). Pure: returns the next `{ stops, referrals }`.
 */
export function setMonitoringDecision({ stops = {}, referrals = [] } = {}, monitoringId, decision) {
  const id = Number(monitoringId);
  const nextReferrals = referrals.map(Number).filter((value) => value !== id);
  if (decision === "refer") return { stops: setMonitoringStop(stops, id, null), referrals: [...nextReferrals, id] };
  if (decision === "stop") return { stops: Object.hasOwn(stops, id) ? { ...stops } : setMonitoringStop(stops, id, ""), referrals: nextReferrals };
  return { stops: setMonitoringStop(stops, id, null), referrals: nextReferrals };
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** Draft shape (HealthRecordDraftPayloadService `carePlan`): ids and stops only. */
export function carePlanDraftPayload({
  continuedFollowUpTaskIds = [],
  continuedMonitorings = [],
  monitoringStops = {},
  monitoringReferrals = [],
  monitoringStatuses = {},
} = {}) {
  return {
    continuedFollowUpTaskIds: continuedFollowUpTaskIds.map(Number),
    continuedMonitoringIds: continuedMonitorings.map((monitoring) => Number(monitoring.id)),
    monitoringStops: Object.entries(monitoringStops).map(([monitoringId, reason]) => ({
      monitoringId: Number(monitoringId),
      reason: reason ?? "",
    })),
    monitoringReferrals: monitoringReferrals.map(Number),
    monitoringStatuses: Object.entries(monitoringStatuses)
      .filter(([, status]) => CONDITION_STATUSES.includes(status))
      .map(([monitoringId, status]) => ({ monitoringId: Number(monitoringId), status })),
  };
}

/**
 * Back from a draft. Condition names are not stored; the care-overview query
 * fills them in, so until then each continued record has a placeholder name
 * and no registry key.
 */
export function restoreCarePlanDraft(carePlan) {
  const source = carePlan && typeof carePlan === "object" ? carePlan : {};
  const ids = (list) => (Array.isArray(list) ? list.map(positiveInt).filter(Boolean) : []);
  const monitoringStops = {};
  for (const stop of Array.isArray(source.monitoringStops) ? source.monitoringStops : []) {
    const id = positiveInt(stop?.monitoringId);
    if (id) monitoringStops[id] = typeof stop.reason === "string" ? stop.reason : "";
  }
  const monitoringStatuses = {};
  for (const update of Array.isArray(source.monitoringStatuses) ? source.monitoringStatuses : []) {
    const id = positiveInt(update?.monitoringId);
    if (id && CONDITION_STATUSES.includes(update.status)) monitoringStatuses[id] = update.status;
  }
  return {
    continuedFollowUpTaskIds: ids(source.continuedFollowUpTaskIds),
    continuedMonitorings: ids(source.continuedMonitoringIds).map((id) => ({
      id,
      conditionName: "Monitored condition",
      conditionKey: null,
    })),
    monitoringStops,
    monitoringReferrals: ids(source.monitoringReferrals),
    monitoringStatuses,
  };
}

/**
 * A visit continuing follow-ups is a follow-up visit of the FIRST one's source
 * record (display/compatibility only - every continued task is fulfilled
 * through care_plan). Without that source record the visit stays initial.
 */
export function continuedVisitLink(continuedFollowUpTaskIds = [], continuedFollowUps = []) {
  const firstId = continuedFollowUpTaskIds[0];
  if (firstId === undefined) return null;
  const source = continuedFollowUps.find((task) => Number(task.id) === Number(firstId));
  if (!source?.sourceHealthRecordId) return null;
  return {
    visitType: "follow_up_visit",
    followUpTaskId: Number(firstId),
    parentHealthRecordId: source.sourceHealthRecordId,
  };
}

/** Continue from a screen of the Next phase. */
export function nextPhaseForwardTarget(screen, monitoringDetailKeys = []) {
  return screen === NEXT_STEP && monitoringDetailKeys.length > 0 ? MONITORING_STEP : REVIEW_STEP;
}

/** Previous from a screen of the Next phase; null means leave the phase. */
export function nextPhaseBackTarget(screen) {
  return screen === MONITORING_STEP ? NEXT_STEP : null;
}

/** Previous from Review. */
export function reviewBackTarget(monitoringDetailKeys = []) {
  return monitoringDetailKeys.length > 0 ? MONITORING_STEP : NEXT_STEP;
}

function stopText(reason) {
  const text = String(reason || "").trim();
  return text ? `: ${text}` : "";
}

/** Review & Confirm rows for Care Plan & Next Steps, from the same rules the screen uses. */
export function carePlanReviewRows({
  diagnoses = [],
  continuedMonitorings = [],
  stops = {},
  referrals = [],
  statuses = {},
  registry = {},
  referral = {},
  followUp = {},
} = {}) {
  const required = stopsRequired(diagnoses, continuedMonitorings, stops, registry);
  const continued = continuedByIdentity(continuedMonitorings, registry);
  const rows = [];

  for (const diagnosis of diagnoses) {
    const value = carePlanFor(diagnosis, continuedMonitorings, registry);
    const plan = CARE_PLAN_LABELS[value];
    const monitoring = continued.get(conditionIdentity(diagnosis.name, registry));
    let text = plan;
    if (monitoring && required[monitoring.id]) text = `${plan} · Monitoring stopped${stopText(stops[monitoring.id])}`;
    else if (monitoring && value === CARE_PLAN.REFER) text = `${plan} · Monitoring continues`;
    rows.push({ label: String(diagnosis.name || "").trim(), value: text });
  }
  const continuing = continuingRows(diagnoses, continuedMonitorings, registry);
  const referredIds = new Set(referredContinuingRows(diagnoses, continuedMonitorings, stops, referrals, registry).map((m) => m.id));
  for (const monitoring of continuing) {
    const decision = required[monitoring.id]
      ? `Stop monitoring${stopText(stops[monitoring.id])}`
      : referredIds.has(monitoring.id)
        ? "Refer to RHU · Monitoring continues"
        : "Continue monitoring";
    const status = CONDITION_STATUSES.includes(statuses?.[monitoring.id]) ? ` · Condition status: ${statuses[monitoring.id]}` : "";
    rows.push({ label: monitoring.conditionName, value: `${decision}${status}` });
  }
  if (referral.needed) {
    rows.push({ label: "Reason for Referral", value: referral.reason || "" });
    rows.push({ label: "Referral Priority", value: referral.priority || "" });
  }
  if (followUp.shows) {
    rows.push({
      label: "Next Follow-up",
      value: followUp.date ? [followUp.date, followUp.time].filter(Boolean).join(" · ") : "Not scheduled",
    });
    if (followUp.date) rows.push({ label: "Follow-up Reason", value: followUp.reason || "" });
  }
  // Same condition as the screen's empty state: only a visit with no
  // condition says so. With conditions, each row already shows its plan.
  if (diagnoses.length === 0 && !referral.needed && !followUp.shows && continuing.length === 0) {
    rows.push({ label: "Next Steps", value: NO_CONDITION_MESSAGE });
  }
  return rows;
}
