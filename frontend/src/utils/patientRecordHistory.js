import { getRecordDateValue, getRecordId, getRecordIdLabel, isFollowUpVisitRecord } from "./healthRecordPrograms.js";
import { isDateInRange } from "./filterUtils.js";

export const DEFAULT_RECORD_FILTERS = Object.freeze({ search: "", dateFrom: "", dateTo: "", outcome: "", visitType: "" });
export const DEFAULT_RECORD_VIEW = Object.freeze({ filters: DEFAULT_RECORD_FILTERS, page: 1 });

const text = value => String(value ?? "").trim();
const yes = value => value === true || value === 1 || value === "1" || value === "true" || value === "yes";
const linkedRecordId = row => text(row.healthRecordId || row.health_record_id || row.recordId || row.record_id);

/** Historical actions are independent. Completing a task never erases its original schedule. */
export function patientRecordRows(records = [], referrals = [], followUps = []) {
  const referralRecords = new Set(referrals.map(linkedRecordId).filter(Boolean));
  const followUpRecords = new Set(followUps.map(linkedRecordId).filter(Boolean));

  return records.map(record => {
    const id = getRecordId(record);
    const monitoring = record.monitoringData || record.monitoring_data || {};
    const linkedReferrals = (record.referrals || []).filter(row => !linkedRecordId(row) || linkedRecordId(row) === id);
    const hasRhuReferral = yes(record.needsReferral) || yes(record.needs_referral) || referralRecords.has(id) ||
      linkedReferrals.length > 0 || record.outcome === "Referred" ||
      (record.diagnoses || []).some(entry => entry.clinicalOutcome === "refer_to_rhu") ||
      Boolean(monitoring.referralHoldId) || (monitoring.conditionReferralOutcomes || []).length > 0 ||
      (!isFollowUpVisitRecord(record) && Boolean(record.linkedTrackingId || record.referralTrackingId || monitoring.linkedTrackingId));
    const hasBhcFollowUp = followUpRecords.has(id) || Boolean(text(record.followUpDate || record.follow_up_date || monitoring.followUpDate || monitoring.follow_up_date)) ||
      record.outcome === "Follow-up";
    const outcomeText = [hasBhcFollowUp && "BHC Follow-up", hasRhuReferral && "RHU Referral"].filter(Boolean).join(", ") ||
      (record.outcome === "Routine" ? "Routine" : "—");
    return { ...record, id, hasBhcFollowUp, hasRhuReferral, outcomeText };
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
      (filters.outcome === "routine" && !record.hasBhcFollowUp && !record.hasRhuReferral && record.outcome === "Routine");
    const matchesVisit = !filters.visitType || (filters.visitType === "follow_up_visit" ? isFollowUpVisitRecord(record) : !isFollowUpVisitRecord(record));
    return matchesSearch && matchesOutcome && matchesVisit && isDateInRange(getRecordDateValue(record), filters.dateFrom, filters.dateTo);
  });
}
