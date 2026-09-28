/**
 * Community-Based Surveillance tags - the registry-driven successor to the
 * single hardcoded HFMD checkbox, per
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md.
 *
 * The single shared reader every surveillance-aware screen uses
 * (ConsultationWorkspace, healthRecordService, BHCReports) - previously each
 * of the three duplicated its own legacy-field lookup. `monitoring_data.
 * surveillanceTags` is used when present; a record saved before this feature
 * (only the legacy `hfmdSurveillance` boolean) is read as `["hfmd"]`. Legacy
 * fields are never written from here - that only happens server-side
 * (HealthRecordController::normalizeSurveillanceData) or, for backward
 * compatibility with older code paths, alongside a save's own payload.
 */
import { normalizeNameKey } from "./diagnoses.js";

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
 * The surveillance tag keys (registry keys, e.g. ["hfmd"]) for a record or
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

/**
 * The surveillance disease `text` names or is an alias of, per the
 * registry's `surveillance_diseases` map ({ [key]: { name, aliases } }), or
 * null. Exact match ignoring case and extra spaces only - no fuzzy,
 * substring or typo matching, mirroring ClinicalRegistry::matchSurveillance
 * on the backend. Used only to SUGGEST a tag; nothing here ticks one.
 */
export function matchSurveillanceDisease(text, surveillanceDiseases = {}) {
  const key = normalizeNameKey(text);
  if (!key) return null;
  for (const [diseaseKey, disease] of Object.entries(surveillanceDiseases)) {
    const names = [disease?.name, ...(disease?.aliases || [])];
    if (names.some((name) => normalizeNameKey(name) === key)) {
      return { key: diseaseKey, name: disease.name };
    }
  }
  return null;
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
