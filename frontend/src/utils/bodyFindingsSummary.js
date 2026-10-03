import { BODY_REGIONS, BODY_SIDES, getBodyRegionLabel, normalizeBodyFindings, normalizeBodySide } from "./bodyFindings.js";
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
    regionLabel: getBodyRegionLabel(item.region, item.side),
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
 * Groups summary findings by side, then region, keeping their order. Every
 * finding already has `side` ("front" | "back"; legacy findings are front).
 * @returns {{ front: Record<string, object[]>, back: Record<string, object[]> }}
 */
export function splitFindingsBySide(findings) {
  const split = Object.fromEntries(BODY_SIDES.map((side) => [side, {}]));
  for (const item of Array.isArray(findings) ? findings : []) {
    const bySide = split[item.side] || split.front;
    (bySide[item.region] ||= []).push(item);
  }
  return split;
}

/**
 * One entry per (side, region) holding findings, for the Recorded Findings
 * list: front areas first, then back, each in BODY_REGIONS order. `label` is
 * the first item's side-aware regionLabel; `items` keep input order.
 * @returns {{ key: string, region: string, side: string, label: string, count: number, items: object[] }[]}
 */
export function groupFindingsByArea(findings) {
  const groups = new Map();
  for (const item of Array.isArray(findings) ? findings : []) {
    const side = normalizeBodySide(item.side);
    const key = `${side}:${item.region}`;
    if (!groups.has(key)) {
      groups.set(key, { key, region: item.region, side, label: item.regionLabel, count: 0, items: [] });
    }
    const group = groups.get(key);
    group.items.push(item);
    group.count += 1;
  }

  const sideOrder = (side) => BODY_SIDES.indexOf(side);
  const regionOrder = (region) => {
    const index = BODY_REGIONS.findIndex(({ key }) => key === region);
    return index === -1 ? BODY_REGIONS.length : index;
  };
  return [...groups.values()].sort(
    (a, b) => sideOrder(a.side) - sideOrder(b.side) || regionOrder(a.region) - regionOrder(b.region),
  );
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
