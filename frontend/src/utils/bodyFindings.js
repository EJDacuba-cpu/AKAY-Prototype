/**
 * Regions of the consultation's front-facing 2D body preview. A body finding
 * records WHERE a symptom or finding was noted for this visit - documentation
 * only, never a diagnosis. Keys must match HealthRecord::BODY_REGIONS on the
 * backend. Regions carry no suggested symptoms: the user writes every
 * finding. "Right"/"left" are the PATIENT's sides: on a front-facing figure
 * the patient's right arm is drawn on the viewer's left.
 */
export const BODY_REGIONS = [
  { key: "head", label: "Head" },
  { key: "chest", label: "Chest" },
  { key: "abdomen", label: "Abdomen" },
  { key: "pelvis", label: "Pelvic / reproductive" },
  { key: "right_arm", label: "Right arm" },
  { key: "left_arm", label: "Left arm" },
  { key: "right_leg", label: "Right leg" },
  { key: "left_leg", label: "Left leg" },
];

const REGION_BY_KEY = Object.fromEntries(BODY_REGIONS.map((region) => [region.key, region]));

export const BODY_FINDING_LIMITS = { finding: 150, note: 500, count: 50 };

export function getBodyRegion(key) {
  return REGION_BY_KEY[key] || null;
}

export function getBodyRegionLabel(key) {
  return REGION_BY_KEY[key]?.label || key || "";
}

export function createBodyFindingId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Keeps only well-formed findings on a known region, trimmed to the backend's
 * limits, so a stale draft or an older record can never fail validation.
 */
export function normalizeBodyFindings(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && REGION_BY_KEY[item.region] && String(item.finding || "").trim())
    .slice(0, BODY_FINDING_LIMITS.count)
    .map((item) => ({
      id: String(item.id || createBodyFindingId()).slice(0, 64),
      region: item.region,
      finding: String(item.finding).trim().slice(0, BODY_FINDING_LIMITS.finding),
      note: String(item.note || "").trim().slice(0, BODY_FINDING_LIMITS.note),
    }));
}

/** "Head: Headache (frontal); Left leg: Swelling" - for summaries. */
export function formatBodyFindings(list) {
  return normalizeBodyFindings(list)
    .map(({ region, finding, note }) => `${getBodyRegionLabel(region)}: ${finding}${note ? ` (${note})` : ""}`)
    .join("; ");
}
