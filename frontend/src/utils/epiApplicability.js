import { EPI_INFANT_SCHEDULE } from "./careTrackingConfig.js";
import { calculateAgeInMonths, isInfantPatient } from "./patientUtils.js";

/**
 * Minimum ages for offering a NEW dose of each stored EPI row.
 *
 * Days are used for the 6-week antigens. Completed months/years match the
 * existing infant helper. Catch-up stays visible after the routine target age
 * unless `newDoseUntilMonths` or `infantOnly` closes the window.
 *
 * Clinical flags (do not auto-validate here): HepB is a single AKAY row, not a
 * 3-dose series; BCG after 2 months may need TST; BCG after 12 months is not
 * newly offered.
 */
const EPI_AGE_RULES = {
  "Newborn Screening": { infantOnly: true },
  CPAB: { minDays: 0 },
  BCG: { minDays: 0, newDoseUntilMonths: 12 },
  "HEPA B": { minDays: 0, newDoseUntilMonths: 12 },
  "OPV 1": { minDays: 42 },
  "OPV 2": { minDays: 42 },
  "OPV 3": { minDays: 42 },
  "PENTA 1": { minDays: 42 },
  "PENTA 2": { minDays: 42 },
  "PENTA 3": { minDays: 42 },
  "PCV 1": { minDays: 42 },
  "PCV 2": { minDays: 42 },
  "PCV 3": { minDays: 42 },
  "IPV 1": { minDays: 42 },
  "IPV 2": { minMonths: 9 },
  "MCV 1": { minMonths: 9 },
  "MCV 2": { minMonths: 12 },
  HPV: { minYears: 9 },
};

function parseCalendarDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value || "").trim();
  const match = text.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function completedYears(dob, visit) {
  let years = visit.getFullYear() - dob.getFullYear();
  if (visit.getMonth() < dob.getMonth() || (visit.getMonth() === dob.getMonth() && visit.getDate() < dob.getDate())) {
    years -= 1;
  }
  return years;
}

export function isEpiItemAgeApplicable(label, birthDate, visitDate) {
  const dob = parseCalendarDate(birthDate);
  const visit = parseCalendarDate(visitDate);
  if (!dob || !visit || visit < dob) return false;
  const rule = EPI_AGE_RULES[label];
  if (!rule) return true;
  if (rule.infantOnly && !isInfantPatient(dob, visit)) return false;
  if (rule.minDays != null) {
    const min = new Date(dob.getFullYear(), dob.getMonth(), dob.getDate() + rule.minDays);
    if (visit < min) return false;
  }
  if (rule.minMonths != null) {
    const months = calculateAgeInMonths(dob, visit);
    if (months === "" || months < rule.minMonths) return false;
  }
  if (rule.minYears != null && completedYears(dob, visit) < rule.minYears) return false;
  if (rule.newDoseUntilMonths != null) {
    const months = calculateAgeInMonths(dob, visit);
    if (months === "" || months > rule.newDoseUntilMonths) return false;
  }
  return true;
}

export function applicableInfantScheduleLabels(birthDate, visitDate) {
  return EPI_INFANT_SCHEDULE.filter((label) => isEpiItemAgeApplicable(label, birthDate, visitDate));
}

export function visibleEpiVaccineOptions(allOptions = [], { birthDate, visitDate, historyLabels = [] } = {}) {
  const recorded = new Set(historyLabels.filter(Boolean));
  return allOptions.filter((label) => recorded.has(label) || isEpiItemAgeApplicable(label, birthDate, visitDate));
}
