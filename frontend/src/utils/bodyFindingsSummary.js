import { getBodyRegionLabel, normalizeBodyFindings } from "./bodyFindings.js";
import { getVitalRecordDate } from "./currentPatientVitals.js";

/**
 * Body findings for the patient profile's Visual Health Summary, read only
 * from what was recorded on each visit - never inferred from a diagnosis.
 *
 * "latest" is the single most recent dated record, even when that visit
 * recorded no findings, so an older finding is never presented as current.
 * "history" is every record given, newest first (undated records last).
 */

export function getRecordId(record = {}) {
  const id =
    record.id ??
    record.health_record_id ??
    record.healthRecordId ??
    record.record_id ??
    record.recordId ??
    record._id ??
    "";
  return String(id);
}

function findingsOf(record, visitDate) {
  const recordId = getRecordId(record);
  return normalizeBodyFindings(record.bodyFindings).map((item) => ({
    ...item,
    regionLabel: getBodyRegionLabel(item.region),
    recordId,
    visitDate,
  }));
}

function countRegions(findings) {
  const counts = {};
  for (const { region } of findings) counts[region] = (counts[region] || 0) + 1;
  return counts;
}

/**
 * @param {object[]} records the patient's health records (normalized)
 * @param {"latest"|"history"} mode
 */
export function summarizeBodyFindings(records, mode = "latest") {
  const dated = (Array.isArray(records) ? records : [])
    .filter(Boolean)
    .map((record) => ({ record, date: getVitalRecordDate(record) }));

  if (mode === "history") {
    const ordered = [...dated].sort(
      (a, b) => (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity),
    );
    const perRecord = ordered.map(({ record, date }) => findingsOf(record, date));
    const findings = perRecord.flat();
    return {
      mode: "history",
      visitDate: null,
      visitCount: perRecord.filter((list) => list.length > 0).length,
      findings,
      countByRegion: countRegions(findings),
    };
  }

  const latest = dated
    .filter(({ date }) => date)
    .reduce((best, entry) => (!best || entry.date > best.date ? entry : best), null);
  const findings = latest ? findingsOf(latest.record, latest.date) : [];
  return {
    mode: "latest",
    visitDate: latest?.date ?? null,
    visitCount: latest ? 1 : 0,
    findings,
    countByRegion: countRegions(findings),
  };
}
