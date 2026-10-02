/**
 * Surveillance readers, per
 * docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 *
 * A diagnosis is included in the Surveillance Report by its own
 * `includeInSurveillance` flag (set under Records & Surveillance). Records
 * saved before that change carry the retired HFMD tagging instead -
 * `monitoring_data.surveillanceTags` or, older still, the `hfmdSurveillance`
 * boolean / `surveillanceCategory` - and still report as one HFMD row through
 * getSurveillanceTags. Nothing here writes a legacy field; new saves no longer
 * send surveillanceTags.
 */

function firstPresent(candidates) {
  for (const value of candidates) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

/**
 * The legacy surveillance tag keys (e.g. ["hfmd"]) for a record or
 * an in-progress consultation's monitoring_data. `record` and
 * `monitoringData` may be the same object (a plain monitoring_data blob) or
 * `record` may be a full health record with `monitoring_data`/`monitoringData`
 * nested inside it - both shapes are read.
 */
export function getSurveillanceTags(record = {}, monitoringData) {
  const md = monitoringData || record.monitoring_data || record.monitoringData || {};

  const explicit = record.surveillanceTags ?? md.surveillanceTags;
  if (Array.isArray(explicit)) {
    return explicit.filter((tag) => typeof tag === "string" && tag.trim() !== "");
  }

  return getLegacyHfmdSurveillance(record, md) ? ["hfmd"] : [];
}

/** True when `tags` includes `key` - a small readability helper for JSX. */
export function hasSurveillanceTag(tags, key) {
  return Array.isArray(tags) && tags.includes(key);
}

const LEGACY_HFMD_NAME = "Hand, Foot and Mouth Disease";

/** Diagnoses included in the Surveillance Report; legacy HFMD-tagged records read as one HFMD row. */
export function getSurveillanceDiagnoses(record = {}) {
  const flagged = (Array.isArray(record.diagnoses) ? record.diagnoses : [])
    .filter((diagnosis) => diagnosis?.includeInSurveillance === true && String(diagnosis.name || "").trim())
    .map((diagnosis) => ({ name: String(diagnosis.name).trim() }));
  if (flagged.length) return flagged;
  return hasSurveillanceTag(getSurveillanceTags(record), "hfmd") ? [{ name: LEGACY_HFMD_NAME }] : [];
}

/**
 * Surveillance Report rows: one `{ record, diagnosis }` per included
 * diagnosis, optionally narrowed by a case-insensitive diagnosis substring,
 * grouped by diagnosis name (case-insensitive; record order kept within a
 * group).
 */
export function getSurveillanceReportEntries(records = [], diagnosisFilter = "") {
  const needle = String(diagnosisFilter || "").trim().toLowerCase();
  const entries = (Array.isArray(records) ? records : []).flatMap((record) =>
    getSurveillanceDiagnoses(record)
      .filter(({ name }) => !needle || name.toLowerCase().includes(needle))
      .map(({ name }) => ({ record, diagnosis: name })),
  );
  const groupKey = ({ diagnosis }) => diagnosis.toLowerCase();
  return entries.sort((a, b) => groupKey(a).localeCompare(groupKey(b)));
}

function getLegacyHfmdSurveillance(record = {}, monitoringData = {}) {
  const explicit = firstPresent([
    record.hfmdSurveillance,
    record.hfmd_surveillance,
    monitoringData.hfmdSurveillance,
    monitoringData.hfmd_surveillance,
  ]);
  if (explicit !== "") return toBoolean(explicit);

  const category = firstPresent([
    record.surveillanceCategory,
    record.surveillance_category,
    record.diseaseSurveillanceCategory,
    record.disease_surveillance_category,
    monitoringData.surveillanceCategory,
    monitoringData.surveillance_category,
    monitoringData.diseaseSurveillanceCategory,
    monitoringData.disease_surveillance_category,
  ]);
  return String(category || "").trim().toLowerCase() === "hfmd";
}
