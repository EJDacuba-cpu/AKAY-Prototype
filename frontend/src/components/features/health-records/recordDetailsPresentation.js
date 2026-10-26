import { getReportedDiagnoses, usesDiagnosisReporting } from "../../../utils/diagnosisReporting";
import { getSurveillanceDiagnoses } from "../../../utils/surveillance";
import { entryDestinations } from "../../../utils/reportingEntries";
import { isBhcGeneralV2 } from "../../../utils/consultationWorkflow";
import { diagnosisCarePlanItems } from "../../../utils/recordCarePlan";
import { getParentHealthRecordId, getRecordDateValue, getRecordChiefComplaint, getRecordDiagnosis, getVitalSignItems, formatMeasurement } from "./recordDetailsHelpers";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
export const taskStateLabel = (value) => text(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Not recorded";

/** Zero alone is an old empty-field sentinel; no provenance exists to validate it. */
export function recordedVitalItems(record = {}) {
  const isRecorded = (value) => {
    const clean = text(value);
    return clean && !/^0+(?:\.0+)?(?:\s|\/|$)/.test(clean);
  };
  const units = { Temperature: "°C", Weight: "kg", Height: "cm" };
  const items = getVitalSignItems(record).filter((item) => isRecorded(item.value)).map((item) => ({
    ...item, value: units[item.label] && !/[a-z°%]/i.test(item.value) ? formatMeasurement(item.value, units[item.label]) : item.value,
  }));
  const vitals = record.vital_signs || record.vitalSigns || {};
  for (const [label, key, unit] of [["Pulse", "pulse", "bpm"], ["SpO₂", "spo2", "%"]]) {
    const value = record[key] ?? vitals[key];
    if (isRecorded(value)) items.push({ label, value: formatMeasurement(value, unit) });
  }
  return items;
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
  const schedules = tasks.length ? tasks.map((task) => ({
    id: task.id, date: task.dueDate || task.due_date, time: task.dueTime || task.due_time,
    reason: task.purpose || task.reason || "", state: task.state,
    completedRecordId: task.fulfilledByHealthRecordId || task.fulfilled_by_health_record_id,
  })) : list(storedSchedules).map((row, index) => ({
    id: `saved-${index}`, date: row.date, time: row.time, reason: row.purpose,
    // A saved schedule proves intent, but does not prove the task is still pending.
    state: "task_status_unavailable",
  }));
  const entries = list(record.diagnoses);
  const outcomes = entries.filter((entry) => ["managed_at_bhc", "refer_to_rhu"].includes(entry?.clinicalOutcome))
    .map((entry, index) => ({ key: entry.id || `outcome-${index}`, name: text(entry.name),
      plan: entry.clinicalOutcome === "managed_at_bhc" ? "Managed at BHC" : "Refer to RHU",
      referralDetails: entry.clinicalOutcome === "refer_to_rhu"
        ? [entry.referral?.urgencyLevel, entry.referral?.reasonForReferral].filter(Boolean).join(" · ") : "",
    }));
  const oldPlans = diagnosisCarePlanItems(entries).filter((item) => item.plan && !outcomes.some((outcome) => outcome.key === item.key));
  const hasCurrentConsultation = isBhcGeneralV2(record) || outcomes.length > 0;
  const hasCurrentScheduling = tasks.length > 0 || Array.isArray(storedSchedules) || isBhcGeneralV2(record);
  const hasCurrent = hasCurrentConsultation || hasCurrentScheduling;
  const active = schedules.filter((row) => ["pending", "rescheduled", "no_show"].includes(row.state));
  const referralAction = linkedReferral
    ? `Referral${linkedReferral.status ? ` · ${linkedReferral.status}` : ""}`
    : record.needs_referral === true || record.needsReferral === true || record.needsReferral === "yes"
      ? "RHU referral recorded" : "";
  const nextAction = [referralAction, active.length ? "BHC follow-up scheduled" : ""].filter(Boolean).join(" · ") ||
    (tasks.length ? "No active follow-up task" : schedules.length ? "Follow-up recorded · task status unavailable" : hasCurrent ? "No further action recorded" : "Not recorded");
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
      { label: "Recorded follow-up date", value: read("followUpDate", "follow_up_date") },
      { label: "Recorded follow-up reason", value: read("followUpReason", "follow_up_reason") },
    ] : []),
  ].filter((item) => text(item.value));
  const unique = (values) => [...new Map(values.map((value) => [text(value).toLowerCase(), text(value) || "Reporting entry recorded; name unavailable"])).values()];
  const reporting = [
    { label: "Morbidity", names: unique(getReportedDiagnoses(record, "morbidity")) },
    { label: "Notifiable Diseases", names: unique(getReportedDiagnoses(record, "notifiable")) },
    { label: "Surveillance", names: unique(usesDiagnosisReporting(entries)
      ? entries.filter((entry) => entryDestinations(entry).includes("surveillance")).map((entry) => entry.name)
      : getSurveillanceDiagnoses(record).map((entry) => entry.name)) },
  ];
  const parentId = getParentHealthRecordId(record);
  const relatedMap = new Map(list(episode.records).filter((row) => row?.id).map((row) => [String(row.id), row]));
  const original = episode.originalRecord || episode.original_record;
  if (original?.id) relatedMap.set(String(original.id), { ...original, ...relatedMap.get(String(original.id)) });
  if (parentId && !relatedMap.has(String(parentId))) relatedMap.set(String(parentId), { id: parentId, relationshipOnly: true });
  const hasRelated = parentId || [...relatedMap.keys()].some((key) => key !== String(id));
  if (hasRelated && id) relatedMap.set(String(id), { ...record, ...relatedMap.get(String(id)) });
  const related = hasRelated ? [...relatedMap.values()].sort((a, b) => text(getRecordDateValue(a)).localeCompare(text(getRecordDateValue(b))) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true })) : [];
  return { schedules, outcomes, legacy, nextAction, reporting, related };
}

export function relatedVisitSummary(record) {
  return getRecordChiefComplaint(record, "") || getRecordDiagnosis(record, "");
}
