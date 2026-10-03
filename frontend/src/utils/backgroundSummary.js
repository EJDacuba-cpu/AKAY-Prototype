/**
 * One read-only line per background section for the Overview's compact
 * Patient Background card. Allergies and current diseases are left out -
 * the Overview already shows them in Alerts & Allergies and Current
 * Conditions. Full editing lives on the Patient Information tab.
 */
const SECTIONS = [
  {
    key: "medical",
    label: "Past medical",
    fields: [
      { label: "Hospitalizations", read: (bg) => bg.hospitalizations },
      { label: "Surgeries", read: (bg) => bg.surgeries },
    ],
  },
  {
    key: "family",
    label: "Family",
    fields: [
      { label: "Similar", read: (bg) => bg.familyHistory?.similarIllness },
      { label: "Chronic", read: (bg) => bg.familyHistory?.chronicIllness },
      { label: "Hereditary", read: (bg) => bg.familyHistory?.hereditaryIllness },
    ],
  },
  {
    key: "social",
    label: "Social",
    fields: [
      { label: "Smoking", read: (bg) => bg.personalSocial?.smoking },
      { label: "Alcohol", read: (bg) => bg.personalSocial?.alcohol },
      { label: "Diet", read: (bg) => bg.personalSocial?.diet },
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
