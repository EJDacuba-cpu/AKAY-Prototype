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

/** First value that is not null, undefined or blank text (so "" does not mask a later key). */
function firstNonBlank(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return undefined;
}

/** The workflow marker, read from whichever monitoring-data key actually carries it. */
function workflowMarkerOf(record) {
  if (!record || typeof record !== "object") return undefined;
  const read = (md) => (md && typeof md === "object" ? md.consultationWorkflow : undefined);
  return firstNonBlank(read(record.monitoring_data), read(record.monitoringData));
}

/** True when the record was saved by the v2 BHC General Consultation. */
export function isBhcGeneralV2(record) {
  return workflowMarkerOf(record) === BHC_GENERAL_V2;
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
  const complaint = String(firstNonBlank(record.chief_complaint, record.chiefComplaint) ?? "").trim();
  return complaint ? { label: "Chief Complaint", value: complaint } : null;
}

/**
 * Whether a detail view should show its own Diagnosis row. A stored diagnosis
 * always shows. A v2 record without one has only the Chief Complaint fallback,
 * which those views already show as the Chief Complaint, so no empty
 * "Diagnosis: Not recorded" row is added. Legacy records are unchanged.
 */
export function showsDiagnosisRow(record, storedDiagnosis = record?.diagnosis) {
  if (String(storedDiagnosis ?? "").trim()) return true;
  return !isBhcGeneralV2(record);
}
