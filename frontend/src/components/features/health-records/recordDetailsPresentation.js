import { getReportedDiagnoses, usesDiagnosisReporting } from "../../../utils/diagnosisReporting";
import { getSurveillanceDiagnoses } from "../../../utils/surveillance";
import { entryDestinations, formatEntryDestinations } from "../../../utils/reportingEntries";
import { isBhcGeneralV2 } from "../../../utils/consultationWorkflow";
import { diagnosisCarePlanItems } from "../../../utils/recordCarePlan";
import { restoreFollowUpSchedules, entryPurposeKey, VISIT_PURPOSE_KEY } from "../../../utils/followUpSchedules";
import { getParentHealthRecordId, getRecordDateValue, getRecordChiefComplaint, getRecordDiagnosis, getVitalSignItems, formatMeasurement } from "./recordDetailsHelpers";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
export const taskStateLabel = (value) => text(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Not recorded";

/** Zero alone is an old empty-field sentinel; no provenance exists to validate it. */
export function recordedVitalItems(record = {}, patient = record.patient) {
  const isRecorded = (value) => {
    const clean = text(value);
    return clean && !/^0+(?:\.0+)?(?:\s|\/|$)/.test(clean);
  };
  const units = { Temperature: "°C", Weight: "kg", Height: "cm" };
  const items = getVitalSignItems(record, patient).filter((item) => isRecorded(item.value)).map((item) => ({
    ...item, value: units[item.label] && !/[a-z°%]/i.test(item.value) ? formatMeasurement(item.value, units[item.label]) : item.value,
  }));
  const vitals = record.vital_signs || record.vitalSigns || {};
  for (const [label, key, unit] of [["Pulse", "pulse", "bpm"], ["SpO₂", "spo2", "%"]]) {
    const value = record[key] ?? vitals[key];
    if (isRecorded(value)) items.push({ label, value: formatMeasurement(value, unit) });
  }
  return items;
}

const OUTCOME_LABELS = {
  managed_at_bhc: "Managed at BHC",
  refer_to_rhu: "Refer to RHU",
};

/** Header Pending duplicates the referral status already shown under Follow-up. */
export function isDuplicatePendingReferralBadge(status) {
  const compact = text(status).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return ["pending", "pending rhu review", "for monitoring", "under assessment"].includes(compact);
}

export function diagnosisTextDistinctFromConcerns(diagnosis, concerns = []) {
  const value = text(diagnosis).toLowerCase();
  if (!value) return false;
  return !concerns.some((item) => text(item.name).toLowerCase() === value);
}

function concernOutcome(entry = {}) {
  return OUTCOME_LABELS[entry.clinicalOutcome] || "";
}

function compactFacts(facts) {
  if (!facts) return null;
  const trackingId = text(facts.trackingId);
  const urgency = text(facts.urgency);
  const facility = text(facts.facility);
  const reason = text(facts.reason);
  if (!trackingId && !urgency && !facility && !reason) return null;
  return { trackingId, urgency, facility, reason };
}

/** Original consultation schedules only. Task due dates are operational and may have been rescheduled. */
export function historicalFollowUpSchedules(record = {}) {
  const md = record.monitoringData || record.monitoring_data || {};
  const stored = record.followUpSchedules ?? md.followUpSchedules ?? md.follow_up_schedules;
  if (Array.isArray(stored)) {
    return restoreFollowUpSchedules(stored)
      .filter((row) => text(row.date))
      .map((row, index) => ({
        id: `saved-${index}`,
        date: row.date,
        time: row.time || "",
        reason: row.purpose || "",
        purposeKey: row.purposeKey,
        sourceEntryId: row.sourceEntryId,
      }));
  }
  const date = text(md.followUpDate || md.follow_up_date || record.followUpDate || record.follow_up_date);
  if (!date) return [];
  return [{
    id: "legacy-follow-up",
    date,
    time: text(md.followUpTime || md.follow_up_time || record.followUpTime || record.follow_up_time),
    reason: text(md.followUpReason || md.follow_up_reason || record.followUpReason || record.follow_up_reason),
    purposeKey: VISIT_PURPOSE_KEY,
    sourceEntryId: null,
  }];
}

function scheduleMatchesConcern(schedule, entry) {
  const entryId = text(entry?.id);
  if (!entryId) return false;
  if (text(schedule.sourceEntryId) === entryId) return true;
  return text(schedule.purposeKey) === entryPurposeKey(entryId);
}

function historicalReferralFacts(record = {}, linkedReferral = null) {
  return {
    trackingId: text(
      linkedReferral?.trackingId
        || linkedReferral?.tracking_id
        || record.linkedTrackingId
        || record.linked_tracking_id
        || record.referralTrackingId
        || record.referral_tracking_id,
    ),
    urgency: text(
      linkedReferral?.urgencyLevel
        || linkedReferral?.urgency_level
        || record.referralUrgency
        || record.urgencyLevel
        || record.referral_urgency,
    ),
    facility: text(
      linkedReferral?.receivingFacility
        || linkedReferral?.receiving_facility
        || linkedReferral?.ruralHealthUnit?.name
        || linkedReferral?.rural_health_unit?.name,
    ),
    reason: text(
      linkedReferral?.reasonForReferral
        || linkedReferral?.reason_for_referral
        || record.referralReason
        || record.referral_reason,
    ),
    rhuId: text(
      linkedReferral?.ruralHealthUnitId
        || linkedReferral?.rural_health_unit_id
        || linkedReferral?.ruralHealthUnit?.id
        || linkedReferral?.rural_health_unit?.id
        || linkedReferral?.receivingRhuId
        || linkedReferral?.receiving_rhu_id,
    ),
  };
}

function concernReferral(entry = {}, visitFacts = {}) {
  if (entry.clinicalOutcome !== "refer_to_rhu") return null;
  const ref = entry.referral;
  if (!ref || typeof ref !== "object") return null;
  const urgency = text(ref.urgencyLevel || ref.urgency_level);
  const reason = text(ref.reasonForReferral || ref.reason_for_referral);
  const rhuId = text(ref.receivingRhuId || ref.receiving_rhu_id);
  const namedFacility = text(ref.receivingFacility || ref.receiving_facility);
  const facility = namedFacility || (rhuId && visitFacts.rhuId && rhuId === visitFacts.rhuId ? visitFacts.facility : "");
  return compactFacts({ urgency, reason, facility });
}

/** Presentation only: never turn historical status text into an active task. */
export function recordDetailsPresentation(record = {}, linkedReferral = null) {
  const md = record.monitoringData || record.monitoring_data || {};
  const episode = record.followUpEpisode || record.follow_up_episode || {};
  const id = record.id || record._id;
  const tasks = list(episode.tasks).filter((task) =>
    id != null && String(task.healthRecordId || task.health_record_id) === String(id),
  );
  const storedSchedules = record.followUpSchedules ?? md.followUpSchedules ?? md.follow_up_schedules;
  const schedules = historicalFollowUpSchedules(record);
  const visitFacts = historicalReferralFacts(record, linkedReferral);
  const entries = list(record.diagnoses);
  const mapsReportingToConcerns = usesDiagnosisReporting(entries);
  const usedScheduleIds = new Set();
  const concerns = entries.filter((entry) => text(entry?.name)).map((entry, index) => {
    const followUps = schedules.filter((row) => {
      if (!scheduleMatchesConcern(row, entry)) return false;
      usedScheduleIds.add(row.id);
      return true;
    });
    const referral = concernReferral(entry, visitFacts);
    return {
      key: entry.id || `concern-${index}`,
      name: text(entry.name),
      outcome: concernOutcome(entry),
      reporting: mapsReportingToConcerns ? (formatEntryDestinations(entry) || "Not classified") : "",
      referralDetails: referral ? [referral.urgency, referral.reason].filter(Boolean).join(" · ") : "",
      referral,
      followUps,
    };
  });
  const visitFollowUps = schedules.filter((row) => !usedScheduleIds.has(row.id));
  const hasConcernReferral = concerns.some((item) => item.referral);
  const visitReferral = compactFacts(hasConcernReferral ? { trackingId: visitFacts.trackingId } : visitFacts);
  const outcomes = concerns.filter((item) => item.outcome).map((item) => ({
    key: item.key, name: item.name, plan: item.outcome, referralDetails: item.referralDetails,
  }));
  const oldPlans = diagnosisCarePlanItems(entries).filter((item) => item.plan && !outcomes.some((outcome) => outcome.key === item.key));
  const hasCurrentConsultation = isBhcGeneralV2(record) || outcomes.length > 0;
  const hasCurrentScheduling = Array.isArray(storedSchedules) || isBhcGeneralV2(record);
  const active = tasks.filter((task) => ["pending", "rescheduled", "no_show"].includes(task.state));
  const referralAction = linkedReferral
    ? `Referral${linkedReferral.status ? ` · ${linkedReferral.status}` : ""}`
    : record.needs_referral === true || record.needsReferral === true || record.needsReferral === "yes"
      ? "RHU referral recorded" : "";
  const nextAction = [referralAction, active.length ? "BHC follow-up scheduled" : ""].filter(Boolean).join(" · ") ||
    (tasks.length ? "No active follow-up task" : schedules.length ? "Follow-up recorded · task status unavailable" : hasCurrentConsultation || hasCurrentScheduling ? "No further action recorded" : "Not recorded");
  const read = (...keys) => {
    for (const source of [md, record]) for (const key of keys) if (text(source[key])) return text(source[key]);
    return "";
  };
  // normalizeRecord supplies this from raw saved fields, before its display defaults.
  const legacyStatus = Object.hasOwn(record, "recordedLegacyStatus") ? record.recordedLegacyStatus : read("followUpStatus", "follow_up_status", "status");
  const legacy = [
    ...(!hasCurrentConsultation ? [
      { label: "Patient condition", value: read("patientCondition", "patient_condition") },
      ...oldPlans.map((item) => ({ label: `Recorded care plan · ${item.name}`, value: item.plan })),
    ] : []),
    ...(!hasCurrentScheduling ? [
      { label: "Recorded follow-up status", value: legacyStatus },
      ...(!schedules.length ? [
        { label: "Recorded follow-up date", value: read("followUpDate", "follow_up_date") },
        { label: "Recorded follow-up reason", value: read("followUpReason", "follow_up_reason") },
      ] : []),
    ] : []),
  ].filter((item) => text(item.value));
  const unique = (values) => [...new Map(values.map((value) => [text(value).toLowerCase(), text(value) || "Reporting entry recorded; name unavailable"])).values()];
  const reporting = [
    { label: "Morbidity", names: unique(getReportedDiagnoses(record, "morbidity")) },
    { label: "Notifiable Diseases", names: unique(getReportedDiagnoses(record, "notifiable")) },
    { label: "Surveillance", names: unique(mapsReportingToConcerns
      ? entries.filter((entry) => entryDestinations(entry).includes("surveillance")).map((entry) => entry.name)
      : getSurveillanceDiagnoses(record).map((entry) => entry.name)) },
  ];
  const unmappedReporting = mapsReportingToConcerns ? [] : reporting.filter((group) => group.names.length);
  const parentId = getParentHealthRecordId(record);
  const relatedMap = new Map(list(episode.records).filter((row) => row?.id).map((row) => [String(row.id), row]));
  const original = episode.originalRecord || episode.original_record;
  if (original?.id) relatedMap.set(String(original.id), { ...original, ...relatedMap.get(String(original.id)) });
  if (parentId && !relatedMap.has(String(parentId))) relatedMap.set(String(parentId), { id: parentId, relationshipOnly: true });
  const hasRelated = parentId || [...relatedMap.keys()].some((key) => key !== String(id));
  if (hasRelated && id) relatedMap.set(String(id), { ...record, ...relatedMap.get(String(id)) });
  const related = hasRelated ? [...relatedMap.values()].sort((a, b) => text(getRecordDateValue(a)).localeCompare(text(getRecordDateValue(b))) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true })) : [];
  return {
    schedules,
    visitFollowUps,
    visitReferral,
    referralHref: visitFacts.trackingId ? `/bhc/referrals/${visitFacts.trackingId}` : "",
    followUpHref: schedules.length || tasks.length ? "/bhc/follow-ups" : "",
    outcomes,
    concerns,
    mapsReportingToConcerns,
    unmappedReporting,
    legacy,
    nextAction,
    reporting,
    related,
    showReferralBadge: false,
  };
}

export function relatedVisitSummary(record) {
  return getRecordChiefComplaint(record, "") || getRecordDiagnosis(record, "");
}
