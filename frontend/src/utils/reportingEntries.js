/**
 * Reporting-only entries of a bhc_general_v2 consultation: {id, name, reportIn[]}.
 * `reportIn` (a subset of morbidity / notifiable / surveillance) is the source of
 * truth; `reportAs` and `includeInSurveillance` are compatibility mirrors the
 * server writes. Older entries carry only those two, so entryDestinations reads
 * both shapes. Mirrors backend/app/Services/ReportingEntries.php::destinations.
 */
import { createDiagnosisId, normalizeNameKey } from "./diagnoses.js";

/** Every place an entry may be reported, in canonical order. */
export const REPORT_DESTINATIONS = Object.freeze(["morbidity", "notifiable", "surveillance"]);

const DESTINATION_LABELS = Object.freeze({
  morbidity: "Morbidity",
  notifiable: "Notifiable",
  surveillance: "Surveillance",
});

function inCanonicalOrder(chosen) {
  return REPORT_DESTINATIONS.filter((destination) => chosen.includes(destination));
}

/**
 * The destinations an entry is reported in, in REPORT_DESTINATIONS order.
 * Uses reportIn when it is an array (known values only, no duplicates);
 * otherwise reads the legacy reportAs / includeInSurveillance.
 */
export function entryDestinations(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];

  if (Array.isArray(entry.reportIn)) return inCanonicalOrder(entry.reportIn);

  const chosen = [];
  if (entry.reportAs === "morbidity" || entry.reportAs === "notifiable") chosen.push(entry.reportAs);
  if (entry.includeInSurveillance === true) chosen.push("surveillance");
  return inCanonicalOrder(chosen);
}

/** A blank entry for the form: no name, reported nowhere yet. */
export function newReportingEntry() {
  return { id: createDiagnosisId(), name: "", reportIn: [] };
}

/** The entry with one destination switched on or off (canonical order kept). */
export function toggleDestination(entry, destination, checked) {
  if (!REPORT_DESTINATIONS.includes(destination)) return { ...entry, reportIn: entryDestinations(entry) };
  const current = entryDestinations(entry).filter((item) => item !== destination);
  return { ...entry, reportIn: inCanonicalOrder(checked ? [...current, destination] : current) };
}

/**
 * The draft / save payload: {id, name, reportIn} per entry, names trimmed.
 * reportIn is always an array (the draft sanitizer rejects null). An entry
 * with a blank name and no destination is an untouched row and is dropped.
 */
export function reportingEntryPayload(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      id: entry?.id,
      name: String(entry?.name ?? "").trim(),
      reportIn: entryDestinations(entry),
    }))
    .filter((entry) => entry.name !== "" || entry.reportIn.length > 0);
}

/**
 * The draft copy: the payload entries that have a name (the draft schema
 * requires one). reportIn stays an array, never null, even when empty.
 */
export function reportingEntryDraft(entries) {
  return reportingEntryPayload(entries).filter((entry) => entry.name !== "");
}

/**
 * The reporting entries of a saved draft: only v2 entries, which carry
 * `reportIn`. A legacy concern list (no reportIn) restores no entries here;
 * converting it is the legacy draft conversion's job.
 */
export function restoreReportingEntries(list) {
  return (Array.isArray(list) ? list : [])
    .filter((entry) => entry && typeof entry === "object" && Array.isArray(entry.reportIn))
    .map((entry) => ({
      id: entry.id ? String(entry.id) : newReportingEntry().id,
      name: String(entry.name ?? ""),
      reportIn: entryDestinations(entry),
    }));
}

/** Validation messages keyed `reportingEntry.<id>.<name|reportIn|duplicate>`. */
export function reportingEntryErrors(entries) {
  const errors = {};
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = normalizeNameKey(entry?.name);
    if (!key) {
      errors[`reportingEntry.${entry?.id}.name`] = "Enter the reported health problem.";
    } else if (seen.has(key)) {
      errors[`reportingEntry.${entry?.id}.duplicate`] = "This health problem is already listed.";
    } else {
      seen.add(key);
    }
    if (entryDestinations(entry).length === 0) {
      errors[`reportingEntry.${entry?.id}.reportIn`] = "Choose at least one report.";
    }
  }
  return errors;
}

/** "Morbidity · Notifiable · Surveillance" for the destinations an entry is in. */
export function formatEntryDestinations(entry) {
  return entryDestinations(entry).map((destination) => DESTINATION_LABELS[destination]).join(" · ");
}

/**
 * The "Reporting" block of a saved v2 record: one line per named entry,
 * "Name — Morbidity · Surveillance" (just the name when it is reported nowhere).
 * Empty when the record reported nothing, so the caller renders no block at all.
 */
export function recordReportingLines(record) {
  const entries = Array.isArray(record?.diagnoses) ? record.diagnoses : [];
  return entries
    .filter((entry) => entry && typeof entry === "object" && String(entry.name ?? "").trim() !== "")
    .map((entry, index) => {
      const name = String(entry.name).trim();
      const destinations = formatEntryDestinations(entry);
      return {
        key: String(entry.id || `reporting-${index}`),
        text: destinations ? `${name} \u2014 ${destinations}` : name,
      };
    });
}
