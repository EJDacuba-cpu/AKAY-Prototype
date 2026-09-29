/**
 * Morbidity / Notifiable Disease reporting under Records & Surveillance.
 *
 * The source of truth is per diagnosis: each entry in a consultation's
 * `diagnoses` carries `reportAs` - "morbidity", "notifiable", or null (not
 * reported). The visit-level `monitoring_data.morbidityReportingStatus`
 * ("not_included" | "morbidity" | "notifiable") and its legacy flags
 * (includeInMorbidityReport / isNotifiableDisease) are a derived mirror,
 * written server-side by HealthRecordController::normalizeDiagnosisReporting,
 * so every older reader keeps working.
 *
 * Records saved before this change - and follow-up visits, whose form has a
 * free-text assessment instead of a diagnosis list - carry no `reportAs` at
 * all; for them the visit-level status is the only fact, and it applies to
 * the record's plain-text `diagnosis`.
 *
 * The single shared reader for the consultation workspace, healthRecordService,
 * record details and BHCReports - each used to keep its own copy.
 */

export const DIAGNOSIS_REPORT_TYPES = Object.freeze(["morbidity", "notifiable"]);

export const REPORT_AS_OPTIONS = Object.freeze([
  Object.freeze({ value: null, label: "Not reported" }),
  Object.freeze({ value: "morbidity", label: "Morbidity" }),
  Object.freeze({ value: "notifiable", label: "Notifiable" }),
]);

const REPORTING_STATUSES = ["not_included", ...DIAGNOSIS_REPORT_TYPES];

function firstPresent(candidates) {
  for (const value of candidates) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes"].includes(String(value || "").trim().toLowerCase());
}

/** "morbidity" | "notifiable" | null. */
export function normalizeReportAs(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return DIAGNOSIS_REPORT_TYPES.includes(normalized) ? normalized : null;
}

/** "not_included" | "morbidity" | "notifiable", or "" when unrecognized. */
export function normalizeReportingStatus(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return REPORTING_STATUSES.includes(normalized) ? normalized : "";
}

/**
 * True when this diagnosis list carries the per-diagnosis choice - i.e. it
 * was recorded under this feature. Presence of the key is the signal (a
 * null reportAs is still an explicit "not reported"), which is why
 * normalizeDiagnoses keeps the key only when the source had it.
 */
export function usesDiagnosisReporting(diagnoses) {
  return Array.isArray(diagnoses) && diagnoses.some(
    (entry) => entry && typeof entry === "object" && Object.hasOwn(entry, "reportAs"),
  );
}

/** The visit-level status a diagnosis list implies: notifiable > morbidity > not_included. */
export function deriveReportingStatus(diagnoses) {
  const types = (Array.isArray(diagnoses) ? diagnoses : []).map((entry) => normalizeReportAs(entry?.reportAs));
  if (types.includes("notifiable")) return "notifiable";
  if (types.includes("morbidity")) return "morbidity";
  return "not_included";
}

/** The list with one diagnosis' report choice changed. */
export function setDiagnosisReportAs(diagnoses, id, reportAs) {
  return (diagnoses || []).map((entry) =>
    entry.id === id ? { ...entry, reportAs: normalizeReportAs(reportAs) } : entry,
  );
}

/**
 * A draft saved before this feature has one visit-level status and a
 * diagnosis list with no reportAs. Its intent was "this visit's diagnoses
 * go to that report", so every diagnosis takes that status - nothing else is
 * inferred. A list already carrying reportAs is returned unchanged.
 */
export function applyLegacyReportingStatus(diagnoses, status) {
  const list = Array.isArray(diagnoses) ? diagnoses : [];
  if (usesDiagnosisReporting(list)) return list;
  const reportAs = normalizeReportAs(normalizeReportingStatus(status));
  return list.map((entry) => ({ ...entry, reportAs }));
}

/**
 * The visit-level status stored on a record (or an in-progress payload):
 * the explicit status when present, otherwise the older include/notifiable
 * flag pair. Reads both the record itself and its nested monitoring_data.
 */
export function getMorbidityReportingStatus(record = {}) {
  const md = record.monitoringData || record.monitoring_data || {};
  const explicit = normalizeReportingStatus(firstPresent([
    record.morbidityReportingStatus,
    record.morbidity_reporting_status,
    md.morbidityReportingStatus,
    md.morbidity_reporting_status,
  ]));
  if (explicit) return explicit;

  const included = toBoolean(firstPresent([
    record.includeInMorbidityReport,
    record.include_in_morbidity_report,
    md.includeInMorbidityReport,
    md.include_in_morbidity_report,
  ]));
  if (!included) return "not_included";

  const notifiable = toBoolean(firstPresent([
    record.isNotifiableDisease,
    record.is_notifiable_disease,
    record.isNotifiable,
    record.is_notifiable,
    record.notifiable,
    md.isNotifiableDisease,
    md.is_notifiable_disease,
  ]));
  return notifiable ? "notifiable" : "morbidity";
}

/**
 * The diagnosis names a record contributes to one report ("morbidity" or
 * "notifiable") - one report row each. A per-diagnosis record lists exactly
 * the diagnoses marked for that report; an older or follow-up record whose
 * visit-level status matches contributes its plain-text diagnosis as one row
 * (an empty string when none was typed, so the visit still appears).
 */
export function getReportedDiagnoses(record = {}, reportType) {
  const diagnoses = record.diagnoses;
  if (usesDiagnosisReporting(diagnoses)) {
    return diagnoses
      .filter((entry) => normalizeReportAs(entry?.reportAs) === reportType)
      .map((entry) => String(entry.name || "").trim())
      .filter(Boolean);
  }
  if (getMorbidityReportingStatus(record) !== reportType) return [];
  return [String(firstPresent([record.diagnosis, record.initialDiagnosis, record.initial_diagnosis, record.condition]) || "").trim()];
}

/**
 * One line for a saved record's reporting, e.g.
 * "Morbidity: Asthma · Notifiable: Dengue fever", or "Not reported".
 * A reported visit with no diagnosis text still says which report it is in.
 */
export function formatRecordReporting(record = {}) {
  const parts = DIAGNOSIS_REPORT_TYPES.flatMap((type) => {
    const names = getReportedDiagnoses(record, type);
    if (names.length === 0) return [];
    const listed = names.filter(Boolean).join(", ");
    return [listed ? `${formatReportAs(type)}: ${listed}` : formatReportAs(type)];
  });
  return parts.length ? parts.join(" · ") : "Not reported";
}

/** "Morbidity" | "Notifiable" | "Not reported". */
export function formatReportAs(value) {
  const reportAs = normalizeReportAs(value);
  return REPORT_AS_OPTIONS.find((option) => option.value === reportAs)?.label || "Not reported";
}
