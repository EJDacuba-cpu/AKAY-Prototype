import { CARE_PLAN, CARE_PLAN_LABELS } from "./carePlan.js";

/**
 * Read-back of what a saved record stored for Care Plan & Next Steps. Display
 * only: nothing here is derived or suggested.
 */

// New next actions and the retired Monitor values older records still hold.
const SHOWN_PLANS = new Set([
  CARE_PLAN.RECHECK, CARE_PLAN.FOLLOW_UP, CARE_PLAN.REFER, CARE_PLAN.MONITOR, CARE_PLAN.MONITOR_REFER,
]);

const RETIRED_PLANS = new Set([CARE_PLAN.NONE, CARE_PLAN.MONITOR, CARE_PLAN.MONITOR_REFER]);

/**
 * "Health Concerns" for a record saved with health concerns; "Care Plan" for an
 * older record, which holds a retired next action (No Ongoing Tracking,
 * Monitor at BHC) and was a suspected-condition care plan.
 */
export function diagnosisCarePlanHeading(diagnoses) {
  const retired = Array.isArray(diagnoses) && diagnoses.some((diagnosis) => RETIRED_PLANS.has(diagnosis?.carePlan));
  return retired ? "Care Plan" : "Health Concerns";
}

/** vital_signs.fbs as "126 mg/dL"; "" when not recorded. */
export function formatFbs(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text ? `${text} mg/dL` : "";
}

/**
 * The per-diagnosis care plan of a saved record: only diagnoses set to
 * Monitor / Refer / Monitor + Refer, or included in surveillance (No Ongoing
 * Tracking rows are left out to keep the list short).
 */
export function diagnosisCarePlanItems(diagnoses) {
  if (!Array.isArray(diagnoses)) return [];
  return diagnoses
    .filter((diagnosis) => diagnosis && String(diagnosis.name || "").trim())
    .map((diagnosis, index) => ({
      key: String(diagnosis.id || `diagnosis-${index}`),
      name: String(diagnosis.name).trim(),
      plan: SHOWN_PLANS.has(diagnosis.carePlan) ? CARE_PLAN_LABELS[diagnosis.carePlan] : "",
      inSurveillance: diagnosis.includeInSurveillance === true,
    }))
    .filter((item) => item.plan || item.inSurveillance);
}
