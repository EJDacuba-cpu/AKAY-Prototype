import {
  formatAlcohol,
  formatDiet,
  formatFamilyHistory,
  formatHospitalizations,
  formatSmoking,
} from "./backgroundFormat.js";
import { packYears } from "./patientHistory.js";

/**
 * One read-only line per background section for the Overview's compact
 * Patient Background card. Allergies and current diseases are left out -
 * the Overview already shows them in Alerts & Allergies and Current
 * Conditions. Similar illness is per visit, so it is not part of the
 * longitudinal summary. The full read-only view is the Patient Background tab;
 * it is updated in a consultation (which also uses this summary on its card).
 */
const SECTIONS = [
  {
    key: "medical",
    label: "Past medical",
    fields: [
      { label: "Hospitalizations & surgeries", read: (bg) => formatHospitalizations(bg.hospitalizations) },
    ],
  },
  {
    key: "family",
    label: "Family",
    fields: [
      { label: "Conditions", read: (bg) => formatFamilyHistory(bg.familyHistory) },
    ],
  },
  {
    key: "social",
    label: "Social",
    fields: [
      {
        label: "Smoking",
        read: (bg) => {
          const smoking = bg.personalSocial?.smoking;
          return formatSmoking(smoking, packYears(smoking || {}));
        },
      },
      { label: "Alcohol", read: (bg) => formatAlcohol(bg.personalSocial?.alcohol) },
      { label: "Diet", read: (bg) => formatDiet(bg.personalSocial?.diet) },
    ],
  },
];

/** @returns {{ key: string, label: string, text: string }[]} text is "" when nothing is recorded. */
export function summarizeBackground(background) {
  const bg = background || {};
  return SECTIONS.map(({ key, label, fields }) => ({
    key,
    label,
    text: fields
      .map((field) => [field.label, String(field.read(bg) || "").trim()])
      .filter(([, value]) => value)
      .map(([fieldLabel, value]) => `${fieldLabel}: ${value}`)
      .join(" · "),
  }));
}
