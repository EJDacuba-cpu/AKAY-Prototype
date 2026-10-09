import {
  CARE_PLAN_LABELS,
  carePlanFor,
  keepsBhcFollowUp,
  referredContinuingRows,
  stopsRequired,
  NO_CONCERN_MESSAGE,
} from "./carePlan.js";
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
 * monitoring stays active. A referral keeps it when a concern is set to
 * Recheck or Follow-up, or when it is a service visit (`hasService`: Maternal /
 * Family Planning / EPI selected) with a follow-up date set - the next dose,
 * appointment or prenatal return. Same rule as the server's
 * CarePlan::keepsFollowUpWithReferral. A referred service visit keeps showing
 * the fields so that date can be set. A date that is already set - pre-filled
 * from a Family Planning appointment, or left from an earlier choice - keeps
 * the fields on screen so the worker can see and clear it.
 */
export function followUpPlan(disposition = {}, followUpDate = "", { hasService = false } = {}) {
  const referred = Boolean(disposition.needsReferral);
  const monitors = Boolean(disposition.keepsFollowUpWithReferral);
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

export const FOLLOW_UP_DATE_MESSAGE = "Set the follow-up date for the concerns marked Recheck or Follow-up.";

/**
 * A concern marked Recheck or Follow-up needs the follow-up date (the server's
 * rule, referral or not); the follow-up reason is required once a date is set
 * (frontend-only rule).
 */
export function carePlanFollowUpErrors({ kept = true, concerns = [], followUpDate = "", followUpReason = "" } = {}) {
  const errors = {};
  if (!followUpDate && (concerns || []).some((concern) => keepsBhcFollowUp(carePlanFor(concern)))) {
    errors.followUpDate = FOLLOW_UP_DATE_MESSAGE;
  }
  if (kept && followUpDate && !String(followUpReason || "").trim()) {
    errors.followUpReason = "Follow-up reason is required.";
  }
  return errors;
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
  startingConditions = [],
} = {}) {
  return {
    continuedFollowUpTaskIds: continuedFollowUpTaskIds.map(Number),
    continuedMonitoringIds: continuedMonitorings.map((monitoring) => Number(monitoring.id)),
    monitoringStops: Object.entries(monitoringStops).map(([monitoringId, reason]) => ({
      monitoringId: Number(monitoringId),
      reason: reason ?? "",
    })),
    monitoringReferrals: monitoringReferrals.map(Number),
    startConditionIds: startingConditions.map((condition) => Number(condition.id)),
  };
}

/**
 * Back from a draft. Condition names are not stored; the care-overview query
 * fills them in, so until then each continued record has a placeholder name
 * and no registry key, and the conditions being started are ids only.
 */
export function restoreCarePlanDraft(carePlan) {
  const source = carePlan && typeof carePlan === "object" ? carePlan : {};
  const ids = (list) => (Array.isArray(list) ? list.map(positiveInt).filter(Boolean) : []);
  const monitoringStops = {};
  for (const stop of Array.isArray(source.monitoringStops) ? source.monitoringStops : []) {
    const id = positiveInt(stop?.monitoringId);
    if (id) monitoringStops[id] = typeof stop.reason === "string" ? stop.reason : "";
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
    startConditionIds: ids(source.startConditionIds),
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

const NO_NEXT_ACTION = "No next action";

function stopText(reason) {
  const text = String(reason || "").trim();
  return text ? `: ${text}` : "";
}

/** Review & Confirm rows for Care Plan & Next Steps, from the same rules the screen uses. */
export function carePlanReviewRows({
  concerns = [],
  continuedMonitorings = [],
  startingConditions = [],
  stops = {},
  referrals = [],
  referral = {},
  followUp = {},
} = {}) {
  const required = stopsRequired(continuedMonitorings, stops);
  const referredIds = new Set(referredContinuingRows(continuedMonitorings, stops, referrals).map((m) => m.id));
  const rows = [];

  for (const concern of concerns) {
    const value = carePlanFor(concern);
    rows.push({ label: String(concern.name || "").trim(), value: value ? CARE_PLAN_LABELS[value] : NO_NEXT_ACTION });
  }
  for (const monitoring of continuedMonitorings) {
    const decision = required[monitoring.id]
      ? `Stop monitoring${stopText(stops[monitoring.id])}`
      : referredIds.has(monitoring.id)
        ? "Refer to RHU · Monitoring continues"
        : "Continue monitoring";
    rows.push({ label: monitoring.conditionName, value: decision });
  }
  for (const condition of startingConditions) {
    rows.push({ label: condition.conditionName, value: "Start monitoring at BHC" });
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
  // Same condition as the screen's empty state: only a visit with no concern
  // and nothing followed says so. With concerns, each row already shows its next action.
  if (concerns.length === 0 && !referral.needed && !followUp.shows && continuedMonitorings.length === 0 && startingConditions.length === 0) {
    rows.push({ label: "Next Steps", value: NO_CONCERN_MESSAGE });
  }
  return rows;
}
