/**
 * Step 3 of the BHC General Consultation ("Medication, Treatment & Next Steps"):
 * two independent choices, Schedule BHC Follow-up and Refer to RHU.
 *
 * Pure state and validation helpers (no React). Return dates are suggestions
 * only: nothing here ticks the follow-up. Only setFollowUpChecked (the worker)
 * and restoreNextActions (a saved draft) can set bhcFollowUp.
 */
import { SHARED_ACKNOWLEDGMENT_MESSAGE } from "./carePlanWorkspace.js";
import { formatEntryDestinations } from "./reportingEntries.js";

export const FOLLOW_UP_DATE_ERROR = "Set the follow-up date.";
export const FOLLOW_UP_REASON_ERROR = "Follow-up reason is required.";
export const REFERRAL_REASON_ERROR = "Reason for referral is required.";

const text = (value) => String(value ?? "").trim();

/** Everything unticked. */
export function initialNextActions() {
  return { bhcFollowUp: false, referToRhu: false, referralMultipleIssues: false };
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

/** Referred items the server counts: this referral plus the distinct monitoring referrals. */
export function referralItemCount({ referToRhu = false, monitoringReferralIds = [] } = {}) {
  return (referToRhu === true ? 1 : 0) + new Set(monitoringReferralIds || []).size;
}

export function referralNeedsAcknowledgment({ count = 0, multipleIssues = false } = {}) {
  return count >= 2 || multipleIssues === true;
}

/** Blocking errors only. Date mismatches are warnings and never appear here. */
export function nextActionErrors({
  state = initialNextActions(),
  followUp = {},
  referral = {},
  reasonExempt = false,
  acknowledged = false,
  count = 0,
  multipleIssues = false,
} = {}) {
  const errors = {};
  if (state.bhcFollowUp === true) {
    if (!text(followUp?.date)) errors.followUpDate = FOLLOW_UP_DATE_ERROR;
    if (!reasonExempt && !text(followUp?.reason)) errors.followUpReason = FOLLOW_UP_REASON_ERROR;
  }
  if (state.referToRhu === true && !text(referral?.reason)) errors.reasonForReferral = REFERRAL_REASON_ERROR;
  // The shared acknowledgment also covers monitoring referrals made with Refer unticked.
  // The multiple-issues trigger only counts while Refer to RHU is ticked (the payload sends it false otherwise).
  const multiple = state.referToRhu === true && multipleIssues === true;
  if (referralNeedsAcknowledgment({ count, multipleIssues: multiple }) && acknowledged !== true) {
    errors.referralAcknowledged = SHARED_ACKNOWLEDGMENT_MESSAGE;
  }
  return errors;
}

/**
 * Save payload fragments. With the follow-up unticked the follow-up fields are
 * "" (the server clears them too). The caller never sends `referral` when
 * needs_referral is false.
 */
export function nextActionsPayload(state, { followUp = {}, monitoringReferralIds = [] } = {}) {
  const followUpOn = state?.bhcFollowUp === true;
  const referOn = state?.referToRhu === true;
  const field = (value) => (followUpOn ? String(value ?? "") : "");
  return {
    needs_referral: referOn || (monitoringReferralIds || []).length > 0,
    care_plan: {
      bhc_follow_up: followUpOn,
      refer_to_rhu: referOn,
      referral_multiple_issues: referOn && state?.referralMultipleIssues === true,
    },
    monitoring_data: {
      followUpStatus: field(followUp?.status),
      followUpDate: field(followUp?.date),
      followUpTime: field(followUp?.time),
      followUpReason: field(followUp?.reason),
    },
  };
}

export function nextActionsDraft(state) {
  return {
    bhcFollowUp: state?.bhcFollowUp === true,
    referToRhu: state?.referToRhu === true,
    referralMultipleIssues: state?.referralMultipleIssues === true,
  };
}

/**
 * Any missing or non-boolean value becomes false. referralMultipleIssues is
 * kept only when referToRhu is true, so a stale draft cannot break the invariant.
 */
export function restoreNextActions(draftCarePlan) {
  const draft = draftCarePlan && typeof draftCarePlan === "object" ? draftCarePlan : {};
  const referToRhu = draft.referToRhu === true;
  return {
    bhcFollowUp: draft.bhcFollowUp === true,
    referToRhu,
    referralMultipleIssues: referToRhu && draft.referralMultipleIssues === true,
  };
}

function coverageName(item) {
  return text(typeof item === "string" ? item : item?.name);
}

/**
 * Review & Confirm rows for this step, in order: BHC Follow-up, RHU Referral,
 * Covers, Reporting, Completes follow-up, Earlier draft notes. Unticked sections and empty rows are omitted.
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
 *   (the workspace `assessmentNotes`). The last row, "Earlier draft notes", only when non-blank.
 * @returns {Array<{label: string, value: string}>}
 */
export function nextStepsReviewRows({
  state = initialNextActions(),
  followUp = {},
  referral = {},
  coverage = [],
  entries = [],
  continuedLink = null,
  earlierDraftNotes = "",
} = {}) {
  const rows = [];
  if (state.bhcFollowUp === true) {
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
  return rows;
}
