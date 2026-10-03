/**
 * Geometry of the body figure, shared by the consultation's Physical Exam
 * body preview and the patient profile's Visual Health Summary so a finding's
 * marker sits in the same place on both.
 *
 * The figure is one of four 1024 x 1536 images (male/female x front/back).
 * Marker positions are normalized [x, y] fractions of the figure box, so they
 * hold at any rendered size. Front view: the patient's right is on the
 * viewer's left. Back view: the patient's right is on the viewer's right.
 * Region keys match BODY_REGIONS in bodyFindings.js.
 */

/** CSS aspect-ratio of the figure box, matching the 1024 x 1536 images. */
export const FIGURE_ASPECT = "2 / 3";

export const FIGURE_KEYS = ["male", "female"];

/** "Female" (trimmed, any case) -> female; anything else -> male. */
export function getFigureKey(sex) {
  return String(sex ?? "").trim().toLowerCase() === "female" ? "female" : "male";
}

export const DOT_POSITIONS = {
  male: {
    front: {
      head: [0.5, 0.075],
      chest: [0.5, 0.245],
      abdomen: [0.5, 0.355],
      pelvis: [0.5, 0.462],
      right_arm: [0.307, 0.32],
      left_arm: [0.691, 0.32],
      right_hand: [0.198, 0.495],
      left_hand: [0.802, 0.495],
      right_leg: [0.415, 0.62],
      left_leg: [0.584, 0.62],
      right_foot: [0.374, 0.912],
      left_foot: [0.62, 0.912],
    },
    back: {
      head: [0.5, 0.07],
      chest: [0.5, 0.245],
      abdomen: [0.5, 0.355],
      pelvis: [0.5, 0.475],
      right_arm: [0.698, 0.32],
      left_arm: [0.302, 0.32],
      right_hand: [0.805, 0.495],
      left_hand: [0.195, 0.495],
      right_leg: [0.588, 0.62],
      left_leg: [0.412, 0.62],
      right_foot: [0.63, 0.92],
      left_foot: [0.37, 0.92],
    },
  },
  female: {
    front: {
      head: [0.5, 0.085],
      chest: [0.5, 0.255],
      abdomen: [0.5, 0.365],
      pelvis: [0.5, 0.47],
      right_arm: [0.32, 0.33],
      left_arm: [0.68, 0.33],
      right_hand: [0.21, 0.49],
      left_hand: [0.789, 0.49],
      right_leg: [0.415, 0.62],
      left_leg: [0.584, 0.62],
      right_foot: [0.378, 0.925],
      left_foot: [0.619, 0.925],
    },
    back: {
      head: [0.5, 0.08],
      chest: [0.5, 0.25],
      abdomen: [0.5, 0.365],
      pelvis: [0.5, 0.48],
      right_arm: [0.685, 0.33],
      left_arm: [0.315, 0.33],
      right_hand: [0.792, 0.49],
      left_hand: [0.207, 0.49],
      right_leg: [0.585, 0.62],
      left_leg: [0.414, 0.62],
      right_foot: [0.624, 0.935],
      left_foot: [0.376, 0.935],
    },
  },
};

/** Normalized [x, y] of a region's marker on the given figure and side. */
export function getDotPosition(figure, side, region) {
  return DOT_POSITIONS[figure]?.[side]?.[region];
}

const toPercent = (fraction) => `${Number((fraction * 100).toFixed(4))}%`;

/** The only coordinate-to-CSS conversion callers use. */
export function markerStyle([x, y]) {
  return { left: toPercent(x), top: toPercent(y) };
}
