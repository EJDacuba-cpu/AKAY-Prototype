/**
 * The three mutually exclusive dispositions a finished visit can have.
 *
 * These are a VIEW over the two fields that are actually persisted -
 * `needsReferral` and `followUpStatus` - not a fourth stored field. Nothing
 * writes a "nextAction" key to the record payload or to a draft, so no new key
 * had to be added to HealthRecordRequest or to
 * HealthRecordDraftPayloadService::SCHEMA (which rejects unknown keys).
 */
export const NEXT_ACTION_NONE = "none";
export const NEXT_ACTION_SCHEDULE = "schedule";
export const NEXT_ACTION_REFERRAL = "referral";

/**
 * Canonical follow-up statuses. "Routine Monitoring" is deliberately still here
 * even though the Next Action UI offers no card for it: it is a value that
 * existing rows hold and that normalizePatientStatus still resolves, so records
 * saved before this UI must keep round-tripping unchanged.
 */
export const FOLLOW_UP_STATUS_ROUTINE = "Routine Monitoring";
export const FOLLOW_UP_STATUS_REQUIRED = "Follow-up Required";
export const FOLLOW_UP_STATUS_COMPLETED = "Completed";

export function normalizePatientStatus(status) {
  const value = String(status || "").trim();
  const compact = value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) return FOLLOW_UP_STATUS_ROUTINE;
  if (["routine monitoring", "routine", "monitoring"].includes(compact)) {
    return FOLLOW_UP_STATUS_ROUTINE;
  }
  if (
    ["follow up", "follow up required", "follow up after 2 days"].includes(
      compact,
    )
  ) {
    return FOLLOW_UP_STATUS_REQUIRED;
  }
  if (
    [
      "completed",
      "complete",
      "recovered",
      "closed",
      "no further follow up required",
    ].includes(compact)
  ) {
    return FOLLOW_UP_STATUS_COMPLETED;
  }
  if (["needs referral", "for referral", "referral"].includes(compact)) {
    return FOLLOW_UP_STATUS_ROUTINE;
  }

  return value || FOLLOW_UP_STATUS_ROUTINE;
}

/**
 * Which card the Next Action step shows as selected, given what the form holds.
 *
 * Referral wins over a scheduled follow-up because that is what the server
 * already does: FollowUpTaskSyncService::syncRecord() cancels any unfulfilled
 * task as soon as needs_referral is set. The old UI let a user pick both and
 * silently dropped the follow-up on save; the card model makes the exclusivity
 * visible rather than introducing it.
 *
 * "Routine Monitoring" maps to the No Follow-up card for display only. Selecting
 * a card is what rewrites followUpStatus - simply landing on this step must not,
 * or resuming an older draft would quietly downgrade a routine-monitoring record
 * to Completed.
 */
export function deriveNextAction({ needsReferral, followUpStatus } = {}) {
  if (needsReferral) return NEXT_ACTION_REFERRAL;

  return normalizePatientStatus(followUpStatus) === FOLLOW_UP_STATUS_REQUIRED
    ? NEXT_ACTION_SCHEDULE
    : NEXT_ACTION_NONE;
}

/**
 * The field changes a card click implies. Returned as a patch so callers apply
 * it through their own setters and validation-clearing.
 */
export function getNextActionPatch(action) {
  switch (action) {
    case NEXT_ACTION_REFERRAL:
      return {
        needsReferral: true,
        followUpStatus: FOLLOW_UP_STATUS_COMPLETED,
        clearFollowUpSchedule: true,
      };
    case NEXT_ACTION_SCHEDULE:
      return {
        needsReferral: false,
        followUpStatus: FOLLOW_UP_STATUS_REQUIRED,
        clearFollowUpSchedule: false,
      };
    default:
      return {
        needsReferral: false,
        followUpStatus: FOLLOW_UP_STATUS_COMPLETED,
        clearFollowUpSchedule: true,
      };
  }
}

/**
 * True when the status held by the form is a legacy value the card grid cannot
 * represent. Callers use this to leave `followUpStatus` alone until the user
 * actually picks a card.
 */
export function isLegacyFollowUpStatus(followUpStatus) {
  return normalizePatientStatus(followUpStatus) === FOLLOW_UP_STATUS_ROUTINE;
}
