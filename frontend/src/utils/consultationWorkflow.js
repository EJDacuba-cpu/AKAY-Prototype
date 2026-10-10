/**
 * Which consultation workflow a saved record was written under.
 *
 * A "bhc_general_v2" record (the simplified BHC General Consultation) carries
 * `monitoring_data.consultationWorkflow`, written by the server. Its reported
 * health problems are reporting-only entries (see reportingEntries.js), so its
 * plain-text `diagnosis` can be blank while the Chief Complaint is the visit's
 * only assessment text. Every other record keeps reading exactly as before.
 */

export const BHC_GENERAL_V2 = "bhc_general_v2";

function monitoringDataOf(record) {
  if (!record || typeof record !== "object") return {};
  const md = record.monitoring_data ?? record.monitoringData;
  return md && typeof md === "object" ? md : {};
}

/** True when the record was saved by the v2 BHC General Consultation. */
export function isBhcGeneralV2(record) {
  return monitoringDataOf(record).consultationWorkflow === BHC_GENERAL_V2;
}

/**
 * The assessment line a record shows: its Diagnosis when one was stored,
 * else - for a v2 record only - its Chief Complaint, else null. A legacy
 * record with a blank diagnosis never gets the Chief Complaint fallback, and
 * a non-blank stored diagnosis is never replaced.
 */
export function visitAssessmentDisplay(record) {
  if (!record || typeof record !== "object") return null;
  const diagnosis = String(record.diagnosis ?? "").trim();
  if (diagnosis) return { label: "Diagnosis", value: diagnosis };
  if (!isBhcGeneralV2(record)) return null;
  const complaint = String(record.chief_complaint ?? record.chiefComplaint ?? "").trim();
  return complaint ? { label: "Chief Complaint", value: complaint } : null;
}
