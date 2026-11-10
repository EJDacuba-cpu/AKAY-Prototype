import { TABLE_SKELETON_PROFILES } from "./skeletonProfiles.js";

/** Explicit page contracts; unknown names still have a safe generic loading state. */
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
  ...Object.keys(TABLE_SKELETON_PROFILES).filter(name => !["table", "medicine", "health-records"].includes(name)),
  "admin-dashboard", "bhc-dashboard", "rhu-dashboard", "patients",
  "assignment-form", "account-form", "medicine-details", "admin-reports",
  "family-details", "family-form", "doctor-calendar", "notifications",
  "referral-slip", "referral-form", "feedback-form", "record-details",
  "referral-details", "monitoring-handoff", "patient-registration",
];

export function resolveSkeletonVariant(name) {
  return SKELETON_VARIANTS.includes(name) ? name : "module";
}
