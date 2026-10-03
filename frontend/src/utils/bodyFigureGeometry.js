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

// Legacy 200x400 outline - removed once the exam and profile figures move to AnatomyFigure.
export const FIGURE_VIEWBOX = { width: 200, height: 400 };

// Legacy 200x400 outline - removed once the exam and profile figures move to AnatomyFigure.
export const FIGURE_SHAPES = [
  { type: "circle", cx: 100, cy: 34, r: 22 },
  { type: "rect", x: 91, y: 57, width: 18, height: 11, rx: 3 },
  { type: "path", d: "M66 72 Q100 64 134 72 Q142 75 142 84 L138 146 L62 146 L58 84 Q58 75 66 72 Z" },
  { type: "path", d: "M62 149 L138 149 L136 198 L64 198 Z" },
  { type: "path", d: "M64 201 L136 201 L140 232 Q120 244 100 246 Q80 244 60 232 Z" },
  { type: "path", d: "M55 76 Q44 80 42 94 L36 160 L30 224 Q29 236 38 237 Q44 236 45 226 L51 164 L56 110 Z" },
  { type: "path", d: "M145 76 Q156 80 158 94 L164 160 L170 224 Q171 236 162 237 Q156 236 155 226 L149 164 L144 110 Z" },
  { type: "path", d: "M61 236 Q80 247 98 249 L96 318 L93 376 Q92 386 83 386 Q75 386 75 376 L71 318 Z" },
  { type: "path", d: "M139 236 Q120 247 102 249 L104 318 L107 376 Q108 386 117 386 Q125 386 125 376 L129 318 Z" },
];

// Legacy 200x400 outline - removed once the exam and profile figures move to AnatomyFigure.
export const LEGACY_DOT_POSITIONS = {
  head: [100, 32],
  chest: [100, 106],
  abdomen: [100, 174],
  pelvis: [100, 222],
  right_arm: [50, 130],
  left_arm: [150, 130],
  right_hand: [39, 232],
  left_hand: [161, 232],
  right_leg: [84, 292],
  left_leg: [116, 292],
  right_foot: [80, 384],
  left_foot: [120, 384],
};
