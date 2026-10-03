/**
 * Geometry of the front-facing 2D body figure, shared by the consultation's
 * Physical Exam body preview and the patient profile's Visual Health Summary
 * so a finding's marker sits in the same place on both. Coordinates are in
 * the figure's 200 x 400 viewBox; keys match BODY_REGIONS in bodyFindings.js.
 */
export const FIGURE_VIEWBOX = { width: 200, height: 400 };

// viewBox 0 0 200 400. A plain, non-interactive silhouette - segmented only
// so it reads as a figure, never highlighted or hit-tested per segment.
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

// One dot per body area, placed over the silhouette above. Hands sit at the
// wrist end of each arm, feet at the ankle end of each leg - no separate
// hand/foot shapes are drawn.
export const DOT_POSITIONS = {
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
