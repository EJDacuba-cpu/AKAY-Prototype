import { normalizeBodyFindings } from "./bodyFindings.js";
import { getConsultationPrograms, PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";
import { formatServiceType, getRecordValue } from "./healthRecordPrograms.js";

export function referralListKey(referral = {}) {
  return String(referral.id || referral.trackingId || "");
}

export function referralMatches(referral, selected) {
  const key = String(selected || "").trim();
  if (!key || !referral) return false;
  return String(referral.id || "") === key || String(referral.trackingId || "") === key;
}

export function pickReferral(referrals, selected) {
  const list = Array.isArray(referrals) ? referrals : [];
  if (!list.length) return null;
  const matched = list.find((item) => referralMatches(item, selected));
  if (matched) return matched;
  if (String(selected || "").trim()) return null;
  return list[0] || null;
}

export function linkedReferralRecord(referral, records = []) {
  const id = String(
    referral?.healthRecordId ||
      referral?.health_record_id ||
      referral?.healthRecord?.id ||
      referral?.health_record?.id ||
      "",
  );
  if (!id) return null;

  const fromPatient = (Array.isArray(records) ? records : []).find(
    (record) => String(record?.id || record?.health_record_id || "") === id,
  );
  if (fromPatient) return fromPatient;

  const nested = referral?.healthRecord || referral?.health_record;
  if (nested && String(nested.id || "") === id) return nested;
  return null;
}

export function isNumericReferralId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

export function referralBelongsToPatient(referral, patientId) {
  if (!referral || patientId == null || patientId === "") return false;
  const owner = referral.patientId || referral.patient_id || referral.patient?.id;
  return String(owner || "") === String(patientId);
}

function text(value) {
  const next = String(value || "").trim();
  return next && next !== "Not recorded" ? next : "";
}

export function referredServices(referral, record) {
  const fromRecord = record
    ? getConsultationPrograms(record).map((key) => PROGRAM_CLASSIFICATIONS[key] || key)
    : [];
  const uniquePrograms = [...new Set(fromRecord.filter((item) => text(item)))];
  if (uniquePrograms.length) return uniquePrograms.join(" · ");
  return formatServiceType(referral?.referralCategory || referral?.category, "");
}

export function referralHistoryOfPresentIllness(record) {
  if (!record) return "";
  return text(
    getRecordValue(record, [
      "history_of_present_illness",
      "historyOfPresentIllness",
      "summaryOfPresentIllness",
      "summary_of_present_illness",
    ], ""),
  );
}

export function referralPhysicalExam(record) {
  if (!record) return "";
  const direct = text(getRecordValue(record, ["physicalExam", "physical_exam"], ""));
  if (direct) return direct;
  const monitoring = record.monitoringData || record.monitoring_data || {};
  return text(monitoring.physicalExam || monitoring.physical_exam);
}

export function referralBodyFindings(record) {
  if (!record) return [];
  return normalizeBodyFindings(record.bodyFindings || record.body_findings);
}

function vitalItems(record) {
  if (!record) return [];
  const nested = record.vitalSigns || record.vital_signs;
  const bag = nested && typeof nested === "object" ? nested : {};
  const systolic = record.systolicBp || record.systolic_bp || bag.systolicBp || bag.systolic_bp;
  const diastolic = record.diastolicBp || record.diastolic_bp || bag.diastolicBp || bag.diastolic_bp;
  const temperature = record.temp || record.temperature || bag.temp || bag.temperature;
  const pulse = record.pulse || record.heart_rate || record.heartRate || bag.pulse;
  const spo2 = record.spo2 || record.spO2 || bag.spo2 || bag.spO2;
  const weight = record.weight || bag.weight;
  const height = record.height || bag.height;
  return [
    { label: "BP", value: systolic && diastolic ? `${systolic}/${diastolic} mmHg` : "" },
    { label: "Temperature", value: temperature ? String(temperature) : "" },
    { label: "Pulse", value: pulse ? String(pulse) : "" },
    { label: "SpO2", value: spo2 ? String(spo2) : "" },
    { label: "Weight", value: weight ? `${weight} kg` : "" },
    { label: "Height", value: height ? `${height} cm` : "" },
  ];
}

/**
 * Read-only BHC slip fields for one selected referral. Clinical values come
 * from that referral's snapshot and its linked BHC record only.
 */
export function referralSlipModel(referral, record) {
  if (!referral) {
    return {
      available: false,
      missingReferral: true,
      missingLinkedRecord: true,
      services: "",
      reason: "",
      chiefComplaint: "",
      historyOfPresentIllness: "",
      physicalExam: "",
      actions: "",
      vitals: [],
      bodyFindings: [],
      referringHci: "",
      practitioner: "",
    };
  }

  const linked = record || null;
  const missingLinkedRecord = !linked;
  const services = referredServices(referral, linked);
  const reason = text(referral.reasonForReferral || referral.reason_for_referral || referral.referralReason);
  const chiefComplaint = text(
    referral.chiefComplaint ||
      referral.chief_complaint ||
      (linked ? getRecordValue(linked, ["chiefComplaint", "chief_complaint", "concern"], "") : ""),
  );
  const historyOfPresentIllness = referralHistoryOfPresentIllness(linked);
  const physicalExam = referralPhysicalExam(linked);
  const actions = text(
    referral.initialActionsTaken ||
      referral.initial_action_taken ||
      (linked
        ? getRecordValue(linked, [
            "initialActionsTaken",
            "initialActionTaken",
            "initial_actions_taken",
            "initial_action_taken",
            "treatmentNotes",
            "treatment_notes",
          ], "")
        : ""),
  );

  return {
    available: true,
    missingReferral: false,
    missingLinkedRecord,
    services,
    reason,
    chiefComplaint,
    historyOfPresentIllness,
    physicalExam,
    actions,
    vitals: vitalItems(linked),
    bodyFindings: referralBodyFindings(linked),
    referringHci: text(referral.referringHci || referral.barangayHealthCenter?.name || referral.barangay_health_center?.name),
    practitioner: text(referral.referringPractitioner || referral.referring_practitioner),
  };
}
