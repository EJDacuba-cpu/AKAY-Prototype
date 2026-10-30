import { getRecordDateValue, getRecordId, getRecordIdLabel, isFollowUpVisitRecord } from "./healthRecordPrograms.js";
import { isDateInRange } from "./filterUtils.js";
import { formatReferralStatus } from "./formatters.js";

export const DEFAULT_RECORD_FILTERS = Object.freeze({ search: "", dateFrom: "", dateTo: "", outcome: "", visitType: "" });
export const DEFAULT_RECORD_VIEW = Object.freeze({ filters: DEFAULT_RECORD_FILTERS, page: 1 });

const text = value => String(value ?? "").trim();
const yes = value => value === true || value === 1 || value === "1" || value === "true" || value === "yes";
const linkedRecordId = row => text(row.healthRecordId || row.health_record_id || row.recordId || row.record_id);
const normalizedState = value => text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const ACTIVE_TASK_STATES = new Set(["pending", "rescheduled", "no show"]);
const CLOSED_TASK_STATES = new Set(["fulfilled", "cancelled", "canceled"]);
const ACTIVE_REFERRAL_STATES = new Set(["pending", "received", "for monitoring", "no show"]);
const CLOSED_REFERRAL_STATES = new Set(["completed", "complete", "done", "cancelled", "canceled", "declined", "rejected"]);
const superseded = task => Boolean(task.rescheduledToId || task.rescheduled_to_id);

/** Current actions only. Omitted collections are unknown, not confirmed empty lists. */
export function patientRecordRows(records = [], referrals, followUps) {
  return records.map(record => {
    const id = getRecordId(record);
    const monitoring = record.monitoringData || record.monitoring_data || {};
    const episode = record.followUpEpisode || record.follow_up_episode || {};
    const tasks = (Array.isArray(followUps) ? followUps : episode.tasks || [])
      .filter(task => linkedRecordId(task) === id);
    const linkedReferrals = Array.isArray(referrals)
      ? referrals.filter(row => linkedRecordId(row) === id)
      : (record.referrals || []).filter(row => !linkedRecordId(row) || linkedRecordId(row) === id);
    const hasReferralIntent = yes(record.needsReferral) || yes(record.needs_referral) || record.outcome === "Referred" ||
      (record.diagnoses || []).some(entry => entry.clinicalOutcome === "refer_to_rhu") ||
      Boolean(monitoring.referralHoldId) || (monitoring.conditionReferralOutcomes || []).length > 0 ||
      (!isFollowUpVisitRecord(record) && Boolean(record.linkedTrackingId || record.referralTrackingId || monitoring.linkedTrackingId));
    const referralStatuses = [...new Set(linkedReferrals
      .filter(row => ACTIVE_REFERRAL_STATES.has(normalizedState(row.status)))
      .map(row => formatReferralStatus(row.status, "")))];
    // This server sublabel is the current waiting hold, unlike a historical hold ID.
    const awaitingProvider = record.outcome === "Referred" &&
      (record.outcomeSubLabel || record.outcome_sub_label) === "Awaiting Provider";
    if (awaitingProvider) referralStatuses.push("Awaiting Provider");
    const hasRhuReferral = referralStatuses.length > 0;
    // Server Follow-up is computed from an active task, not a saved legacy status.
    const hasBhcFollowUp = tasks.some(task => !superseded(task) && ACTIVE_TASK_STATES.has(normalizedState(task.state))) ||
      (!Array.isArray(followUps) && tasks.length === 0 && record.outcome === "Follow-up");
    const taskStatesKnown = tasks.every(task => superseded(task) ||
      ACTIVE_TASK_STATES.has(normalizedState(task.state)) || CLOSED_TASK_STATES.has(normalizedState(task.state)));
    const referralStatesKnown = linkedReferrals.every(row =>
      ACTIVE_REFERRAL_STATES.has(normalizedState(row.status)) || CLOSED_REFERRAL_STATES.has(normalizedState(row.status)));
    const followUpResolved = taskStatesKnown && (Array.isArray(followUps) || record.outcome === "Routine");
    const referralResolved = referralStatesKnown && (Array.isArray(referrals)
      ? linkedReferrals.length > 0 || !hasReferralIntent
      : record.outcome === "Routine" && !hasReferralIntent);
    const hasNoFurtherAction = !hasBhcFollowUp && !hasRhuReferral && followUpResolved && referralResolved;
    const outcomeText = [hasBhcFollowUp && "Follow-up Scheduled", hasRhuReferral && `RHU Referral (${referralStatuses.join(", ")})`]
      .filter(Boolean).join(", ") || (hasNoFurtherAction ? "No Further Action" : "—");
    return { ...record, id, hasBhcFollowUp, hasRhuReferral, hasNoFurtherAction, outcomeText };
  }).sort((a, b) => (Date.parse(getRecordDateValue(b)) || 0) - (Date.parse(getRecordDateValue(a)) || 0));
}

export function filterPatientRecords(records, filters = DEFAULT_RECORD_FILTERS) {
  const search = text(filters.search).toLowerCase();
  return records.filter(record => {
    const matchesSearch = !search || [getRecordIdLabel(record), record.chiefComplaint || record.chief_complaint]
      .some(value => text(value).toLowerCase().includes(search));
    const matchesOutcome = !filters.outcome ||
      (filters.outcome === "follow_up" && record.hasBhcFollowUp) ||
      (filters.outcome === "referral" && record.hasRhuReferral) ||
      (filters.outcome === "routine" && record.hasNoFurtherAction);
    const matchesVisit = !filters.visitType || (filters.visitType === "follow_up_visit" ? isFollowUpVisitRecord(record) : !isFollowUpVisitRecord(record));
    return matchesSearch && matchesOutcome && matchesVisit && isDateInRange(getRecordDateValue(record), filters.dateFrom, filters.dateTo);
  });
}
