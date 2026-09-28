/**
 * Regions of the consultation's front-facing 2D body preview. A body finding
 * records WHERE a symptom or finding was noted for this visit - documentation
 * only, never a diagnosis. Keys must match HealthRecord::BODY_REGIONS on the
 * backend. Regions carry no suggested symptoms: the user writes every
 * finding. "Right"/"left" are the PATIENT's sides: on a front-facing figure
 * the patient's right arm is drawn on the viewer's left.
 */
export const BODY_REGIONS = [
  { key: "head", label: "Head / Face" },
  { key: "chest", label: "Chest" },
  { key: "abdomen", label: "Abdomen" },
  { key: "pelvis", label: "Pelvic / Groin" },
  { key: "right_arm", label: "Right arm" },
  { key: "left_arm", label: "Left arm" },
  { key: "right_hand", label: "Right hand" },
  { key: "left_hand", label: "Left hand" },
  { key: "right_leg", label: "Right leg" },
  { key: "left_leg", label: "Left leg" },
  { key: "right_foot", label: "Right foot" },
  { key: "left_foot", label: "Left foot" },
];

const REGION_BY_KEY = Object.fromEntries(BODY_REGIONS.map((region) => [region.key, region]));

export const BODY_FINDING_LIMITS = { finding: 150, note: 500, location: 100, count: 50 };

export const OTHER_LOCATION = "other";

const ARM_LOCATIONS = ["Shoulder", "Upper arm", "Elbow", "Forearm"];
const HAND_LOCATIONS = ["Wrist", "Palm", "Back of hand", "Thumb", "Fingers"];
const LEG_LOCATIONS = ["Hip", "Thigh", "Knee", "Lower leg / Shin"];
const FOOT_LOCATIONS = ["Ankle", "Heel", "Sole", "Top of foot", "Toes"];

// Anatomical places only - never symptoms. "Other / Specify" is appended by
// getSpecificLocationOptions.
const SPECIFIC_LOCATIONS = {
  head: [
    "Scalp", "Forehead", "Eye (Right)", "Eye (Left)", "Ear (Right)", "Ear (Left)",
    "Nose", "Mouth / Oral area", "Jaw", "Neck",
  ],
  chest: ["Upper chest", "Sternum", "Right breast", "Left breast", "Right rib cage", "Left rib cage"],
  abdomen: [
    "Right upper quadrant",
    "Left upper quadrant",
    "Right lower quadrant",
    "Left lower quadrant",
    "Periumbilical (central)",
  ],
  pelvis: ["Groin (Right)", "Groin (Left)", "Genital area", "Lower back / Sacral"],
  right_arm: ARM_LOCATIONS,
  left_arm: ARM_LOCATIONS,
  right_hand: HAND_LOCATIONS,
  left_hand: HAND_LOCATIONS,
  right_leg: LEG_LOCATIONS,
  left_leg: LEG_LOCATIONS,
  right_foot: FOOT_LOCATIONS,
  left_foot: FOOT_LOCATIONS,
};

/** [{ value, label }] for a region's dropdown, ending with Other / Specify. */
export function getSpecificLocationOptions(region) {
  const list = SPECIFIC_LOCATIONS[region];
  if (!list) return [];
  return [
    ...list.map((label) => ({ value: label, label })),
    { value: OTHER_LOCATION, label: "Other / Specify" },
  ];
}

/**
 * Splits a stored location into the dropdown value and the Other text, so an
 * existing finding reopens with the right option selected.
 */
export function splitSpecificLocation(region, location) {
  const text = String(location || "").trim();
  if (!text) return { choice: "", other: "" };
  if ((SPECIFIC_LOCATIONS[region] || []).includes(text)) return { choice: text, other: "" };
  return { choice: OTHER_LOCATION, other: text };
}

export function resolveSpecificLocation(choice, other) {
  const value = choice === OTHER_LOCATION ? String(other || "") : String(choice || "");
  return value.trim().slice(0, BODY_FINDING_LIMITS.location);
}

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
      location: String(item.location || "").trim().slice(0, BODY_FINDING_LIMITS.location),
      finding: String(item.finding).trim().slice(0, BODY_FINDING_LIMITS.finding),
      note: String(item.note || "").trim().slice(0, BODY_FINDING_LIMITS.note),
    }));
}

/** "Head - Forehead: Headache (2 days); Left leg: Swelling" - for summaries. */
export function formatBodyFindings(list) {
  return normalizeBodyFindings(list)
    .map(({ region, location, finding, note }) =>
      `${getBodyRegionLabel(region)}${location ? ` - ${location}` : ""}: ${finding}${note ? ` (${note})` : ""}`)
    .join("; ");
}
