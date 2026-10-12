/**
 * Prenatal age and height risk, worked out from facts the system already has
 * (birthdate, height) instead of being ticked by hand.
 *
 * Age risk is under 18 or over 35 at the visit date; height risk is under
 * 145 cm. 18, 35 and 145 are not risks. The messages only state the fact -
 * they never advise or refer (BHC workers do not diagnose or recommend).
 */

export const AGE_RISK_MIN = 18;
export const AGE_RISK_MAX = 35;
export const HEIGHT_RISK_CM = 145;

export function calculateAgeInYears(birthdate, referenceDate = new Date()) {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  const reference = new Date(referenceDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }

  let age = reference.getFullYear() - birth.getFullYear();
  const monthDelta = reference.getMonth() - birth.getMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && reference.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return age;
}

function usableHeight(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const height = Number(value);
  return Number.isFinite(height) && height > 0 ? height : null;
}

/**
 * @param {{ birthdate?: string, visitHeight?: string|number, recordedHeight?: { value: number, date: string } | null, referenceDate?: Date|string }} input
 *   `visitHeight` is this visit's Vital Signs height and wins over `recordedHeight`
 *   (the patient's last recorded height).
 */
export function getMaternalRiskFlags({
  birthdate,
  visitHeight,
  recordedHeight = null,
  referenceDate = new Date(),
} = {}) {
  const age = calculateAgeInYears(birthdate, referenceDate);

  let heightCm = usableHeight(visitHeight);
  let heightSource = heightCm === null ? null : "visit";
  let heightDate = null;
  if (heightCm === null) {
    heightCm = usableHeight(recordedHeight?.value);
    if (heightCm !== null) {
      heightSource = "record";
      heightDate = recordedHeight.date || null;
    }
  }

  return {
    ageRisk: age === null ? null : age < AGE_RISK_MIN || age > AGE_RISK_MAX,
    heightRisk: heightCm === null ? null : heightCm < HEIGHT_RISK_CM,
    age,
    heightCm,
    heightSource,
    heightDate,
  };
}

/** The true flags the worker has not been told about yet, age first. */
export function pendingRiskAnnouncements(flags, acknowledged = []) {
  const seen = new Set(acknowledged || []);
  const items = [];
  if (flags?.ageRisk === true && !seen.has("ageRisk")) {
    items.push({ key: "ageRisk", message: `Age risk — patient is ${flags.age} years old.` });
  }
  if (flags?.heightRisk === true && !seen.has("heightRisk")) {
    const message = flags.heightSource === "record"
      ? `Height risk — last recorded height is ${flags.heightCm} cm${flags.heightDate ? ` (${flags.heightDate})` : ""}.`
      : `Height risk — height entered this visit is ${flags.heightCm} cm.`;
    items.push({ key: "heightRisk", message });
  }
  return items;
}

/** The risk assessment with the two computed flags set (unknown counts as false). */
export function applyRiskFlags(riskAssessment, flags) {
  return {
    ...(riskAssessment || {}),
    ageRisk: flags?.ageRisk === true,
    heightRisk: flags?.heightRisk === true,
  };
}
