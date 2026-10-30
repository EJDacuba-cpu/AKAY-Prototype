/** The page skeletons that exist. A page names one explicitly; anything else shows the generic `module` shape. */
export const SKELETON_VARIANTS = [
  "dashboard",
  "table",
  "details",
  "form",
  "module",
  "follow-ups",
  "medicine",
  "reports",
  "patient-details",
  "health-records",
  "facilities",
];

export function resolveSkeletonVariant(name) {
  return SKELETON_VARIANTS.includes(name) ? name : "module";
}
