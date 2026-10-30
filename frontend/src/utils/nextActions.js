/**
 * Step 3 of the BHC General Consultation ("Medication, Treatment & Next Steps"):
 * selected-service next actions, independent concern follow-ups, and Refer to RHU.
 *
 * Pure state and validation helpers (no React). Service return dates are
 * suggestions only and never schedule a visit on their own. Referral details
 * are required only after an actual referral decision.
 */
import { SHARED_ACKNOWLEDGMENT_MESSAGE } from "./carePlanWorkspace.js";
import { PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";
import { formatEntryDestinations } from "./reportingEntries.js";
import { restoreServiceReferrals } from "./serviceNextActions.js";

export const FOLLOW_UP_DATE_ERROR = "Set the follow-up date.";
export const FOLLOW_UP_REASON_ERROR = "Follow-up reason is required.";
export const REFERRAL_REASON_ERROR = "Reason for referral is required.";

const text = (value) => String(value ?? "").trim();

/** Everything unticked. */
export function initialNextActions() {
  return { bhcFollowUp: false, referToRhu: false, referralMultipleIssues: false, serviceReferrals: [] };
}

export function setFollowUpChecked(state, checked) {
  return { ...initialNextActions(), ...state, bhcFollowUp: checked === true };
}

/** Unticking Refer to RHU also clears the multiple-issues acknowledgment. */
export function setReferChecked(state, checked) {
  const on = checked === true;
  return { ...initialNextActions(), ...state, referToRhu: on, referralMultipleIssues: on ? state?.referralMultipleIssues === true : false };
}

/** H6: the follow-up reason may be omitted when a service is selected or monitoring continues. */
export function followUpReasonExempt({ selectedPrograms = [], monitorsAny = false } = {}) {
  return (selectedPrograms || []).length > 0 || monitorsAny === true;
}

/** Offered as "Use this date": EPI next dose, then FP next appointment. Blank dates are dropped. */
export function serviceDateSuggestions({ immunizationNextDate = "", familyPlanningNextDate = "" } = {}) {
  return [
    { source: "EPI next dose", date: text(immunizationNextDate) },
    { source: "FP next appointment", date: text(familyPlanningNextDate) },
  ].filter((suggestion) => suggestion.date !== "");
}

/**
 * Non-blocking: one warning per suggestion that the entered date differs from. Never an error.
 * Callers show these warnings only while Schedule BHC Follow-up is ticked.
 */
export function followUpDateWarnings(enteredDate, suggestions = []) {
  const entered = text(enteredDate);
  if (!entered) return [];
  return (suggestions || [])
    .filter((suggestion) => suggestion.date !== entered)
    .map((suggestion) => `The follow-up date differs from the ${suggestion.source} (${suggestion.date}).`);
}

/** True when a condition card, visit action, or monitoring decision asked to refer. */
export function hasReferralDecision({ referToRhu = false, conditionReferred = false, monitoringReferralIds = [] } = {}) {
  return referToRhu === true || conditionReferred === true || (monitoringReferralIds || []).length > 0;
}

/** Referred items the server counts: this referral plus the distinct monitoring referrals. */
export function referralItemCount({ referToRhu = false, monitoringReferralIds = [] } = {}) {
  return (referToRhu === true ? 1 : 0) + new Set(monitoringReferralIds || []).size;
}

/**
 * Named referral sources for one shared RHU referral: referred concerns,
 * selected services marked Refer to RHU, and referred monitoring. A legacy
 * visit-level Refer with no named source still counts as one item.
 */
export function referralSourceCount({
  conditionReferrals = [],
  serviceReferrals = [],
  monitoringReferralIds = [],
  legacyReferToRhu = false,
} = {}) {
  const conditions = (conditionReferrals || []).length;
  const services = (serviceReferrals || []).length;
  const monitoring = new Set(monitoringReferralIds || []).size;
  const legacy = conditions === 0 && services === 0 && legacyReferToRhu === true ? 1 : 0;
  return conditions + services + monitoring + legacy;
}

/** Show and require the shared-referral acknowledgment only when two or more sources are included. */
export function referralNeedsAcknowledgment({ count = 0 } = {}) {
  return count >= 2;
}

/** Identity of the acknowledged shared referral. Coverage, destination, or urgency changes invalidate it. */
export function referralAcknowledgmentKey({ coverage = [], receivingRhuId = "", urgencyLevel = "" } = {}) {
  return [...(coverage || []), String(receivingRhuId || ""), String(urgencyLevel || "")].join("\n");
}

/** Blocking errors only. Date mismatches are warnings and never appear here. */
export function nextActionErrors({
  state = initialNextActions(),
  followUp = {},
  referral = {},
  reasonExempt = false,
  acknowledged = false,
  count = 0,
} = {}) {
  const errors = {};
  if (state.bhcFollowUp === true) {
    if (!text(followUp?.date)) errors.followUpDate = FOLLOW_UP_DATE_ERROR;
    if (!reasonExempt && !text(followUp?.reason)) errors.followUpReason = FOLLOW_UP_REASON_ERROR;
  }
  if (state.referToRhu === true && !text(referral?.reason)) errors.reasonForReferral = REFERRAL_REASON_ERROR;
  if (referralNeedsAcknowledgment({ count }) && acknowledged !== true) {
    errors.referralAcknowledged = SHARED_ACKNOWLEDGMENT_MESSAGE;
  }
  return errors;
}

/**
 * Save payload fragments. With the follow-up unticked the follow-up fields are
 * "" (the server clears them too). The caller never sends `referral` when
 * needs_referral is false.
 */
export function nextActionsPayload(state, { followUp = {}, monitoringReferralIds = [], followUpSchedules = [], conditionReferred = false, conditionReferralCount, referralCount } = {}) {
  const schedules = Array.isArray(followUpSchedules) ? followUpSchedules.filter((item) => item?.date && item?.purpose) : [];
  const followUpOn = state?.bhcFollowUp === true || schedules.length > 0;
  const serviceReferrals = Array.isArray(state?.serviceReferrals)
    ? [...new Set(state.serviceReferrals.filter((key) => Object.hasOwn(PROGRAM_CLASSIFICATIONS, key)))]
    : [];
  const referOn = state?.referToRhu === true || serviceReferrals.length > 0;
  const count = Number.isInteger(referralCount)
    ? referralCount
    : referralSourceCount({
      conditionReferrals: Array.from({ length: Number.isInteger(conditionReferralCount) ? conditionReferralCount : (conditionReferred ? 1 : 0) }),
      serviceReferrals,
      monitoringReferralIds,
      legacyReferToRhu: referOn,
    });
  const field = (value) => (followUpOn && schedules.length === 0 ? String(value ?? "") : "");
  const first = schedules[0];
  return {
    needs_referral: hasReferralDecision({ referToRhu: referOn, conditionReferred, monitoringReferralIds }),
    care_plan: {
      bhc_follow_up: followUpOn,
      refer_to_rhu: referOn,
      referral_multiple_issues: count >= 2,
      service_referrals: serviceReferrals,
    },
    monitoring_data: {
      followUpStatus: first ? String(followUp?.status || "Follow-up Required") : field(followUp?.status),
      followUpDate: first ? first.date : field(followUp?.date),
      followUpTime: first ? (first.time || "") : field(followUp?.time),
      followUpReason: first ? first.purpose : field(followUp?.reason),
      ...(schedules.length ? { followUpSchedules: schedules } : {}),
    },
  };
}

export function nextActionsDraft(state) {
  return {
    bhcFollowUp: state?.bhcFollowUp === true,
    referToRhu: state?.referToRhu === true,
    referralMultipleIssues: false,
    serviceReferrals: Array.isArray(state?.serviceReferrals)
      ? [...new Set(state.serviceReferrals.filter((key) => Object.hasOwn(PROGRAM_CLASSIFICATIONS, key)))]
      : [],
  };
}

/**
 * Any missing or non-boolean value becomes false. Multiple-issue coverage is
 * derived from named referral sources, so a stale checkbox never restores.
 * `serviceReferrals` restores onto currently selected Prenatal / EPI / FP keys.
 */
export function restoreNextActions(draftCarePlan, { selectedPrograms = [] } = {}) {
  const draft = draftCarePlan && typeof draftCarePlan === "object" ? draftCarePlan : {};
  const serviceReferrals = restoreServiceReferrals(draft, selectedPrograms);
  const referToRhu = draft.referToRhu === true || serviceReferrals.length > 0;
  return {
    bhcFollowUp: draft.bhcFollowUp === true,
    referToRhu,
    referralMultipleIssues: false,
    serviceReferrals,
  };
}

function coverageName(item) {
  return text(typeof item === "string" ? item : item?.name);
}

/**
 * Review & Confirm rows for this step, in order: BHC Follow-up, RHU Referral,
 * Covers, Reporting, Completes follow-up, Earlier draft notes, Earlier draft notes (continued). Unticked sections
 * and empty rows are omitted.
 *
 * @param {object} input
 * @param {{bhcFollowUp: boolean, referToRhu: boolean}} input.state - the next-actions state.
 * @param {{date?: string, time?: string, reason?: string}} input.followUp - shown only when bhcFollowUp is ticked.
 *   Value is "date · time · reason" (blank parts skipped); "Not scheduled" when all are blank.
 * @param {{priority?: string, reason?: string}} input.referral - shown only when referToRhu is ticked.
 *   Value is "priority · reason" (blank parts skipped); "Refer to RHU" when both are blank.
 * @param {Array<string | {name: string}>} input.coverage - the concerns covered, as plain names or objects with a
 *   `name`. Joined with ", " in the "Covers" row; blank names are dropped.
 * @param {Array<{name: string, reportIn?: string[]}>} input.entries - reporting-only entries. `name` plus whatever
 *   formatEntryDestinations reads: `reportIn` (subset of "morbidity" | "notifiable" | "surveillance"), or the legacy
 *   `reportAs` / `includeInSurveillance`. The "Reporting" row has one `name — destinations` line per entry, the
 *   lines joined with a newline character (a name with no destinations shows the name alone).
 * @param {{followUpTaskId?: number | string} | null} input.continuedLink - the continuedVisitLink() result. When
 *   `followUpTaskId` is present the row "Completes follow-up" reads `FU-<followUpTaskId>`.
 * @param {string} [input.earlierDraftNotes] - read-only text carried over from a converted legacy draft
 *   (the workspace `assessmentNotes`). The row "Earlier draft notes", only when non-blank.
 * @param {string} [input.earlierDraftContinued] - the rest of that text, kept in the workspace `monitoringNotes`
 *   when it did not fit (see continuedDraftNotes). The last row, "Earlier draft notes (continued)", only when
 *   non-blank.
 * @returns {Array<{label: string, value: string}>}
 */
export function nextStepsReviewRows({
  state = initialNextActions(),
  followUp = {},
  followUpSchedules = [],
  referral = {},
  coverage = [],
  entries = [],
  continuedLink = null,
  earlierDraftNotes = "",
  earlierDraftContinued = "",
} = {}) {
  const rows = [];
  const scheduleRows = Array.isArray(followUpSchedules) ? followUpSchedules : [];
  if (scheduleRows.length > 0) {
    for (const item of scheduleRows) {
      const when = [text(item?.date), text(item?.time)].filter(Boolean).join(" · ");
      rows.push({ label: text(item?.purpose) || "BHC Follow-up", value: when || "Not scheduled" });
    }
  } else if (state.bhcFollowUp === true) {
    const when = [text(followUp?.date), text(followUp?.time)].filter(Boolean).join(" · ");
    const value = [when, text(followUp?.reason)].filter(Boolean).join(" · ");
    rows.push({ label: "BHC Follow-up", value: value || "Not scheduled" });
  }
  if (state.referToRhu === true) {
    const value = [text(referral?.priority), text(referral?.reason)].filter(Boolean).join(" · ");
    rows.push({ label: "RHU Referral", value: value || "Refer to RHU" });
  }
  const covers = (coverage || []).map(coverageName).filter(Boolean);
  if (covers.length > 0) rows.push({ label: "Covers", value: covers.join(", ") });
  const reporting = (entries || [])
    .map((entry) => {
      const name = text(entry?.name);
      const destinations = formatEntryDestinations(entry);
      return name && destinations ? `${name} — ${destinations}` : name || destinations;
    })
    .filter(Boolean);
  if (reporting.length > 0) rows.push({ label: "Reporting", value: reporting.join("\n") });
  if (continuedLink?.followUpTaskId !== undefined && continuedLink?.followUpTaskId !== null) {
    rows.push({ label: "Completes follow-up", value: `FU-${continuedLink.followUpTaskId}` });
  }
  if (text(earlierDraftNotes)) rows.push({ label: "Earlier draft notes", value: text(earlierDraftNotes) });
  if (text(earlierDraftContinued)) {
    rows.push({ label: "Earlier draft notes (continued)", value: text(earlierDraftContinued) });
  }
  return rows;
}
