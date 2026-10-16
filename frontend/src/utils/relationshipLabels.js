// Relationship to the household head is a display label. Only Husband/Wife and
// Brother/Sister may be confirmed as an explicit spouse/sibling link; Partner never is.
// Keep in sync with backend App\Services\RelationshipLabels.
export const RELATIONSHIP_LABELS = [
  "Husband", "Wife", "Partner", "Brother", "Sister", "Father", "Mother", "Son", "Daughter",
  "Grandfather", "Grandmother", "Grandson", "Granddaughter",
  "Father-in-law", "Mother-in-law", "Son-in-law", "Daughter-in-law",
  "Uncle", "Aunt", "Nephew", "Niece", "Cousin", "Other relative", "Non-relative",
];

// Saved before the specific list. They stay readable and are never rewritten.
export const LEGACY_LABELS = [
  "Spouse / Partner", "Son / Daughter", "Parent", "Sibling", "Grandchild", "Grandparent",
  "Son / Daughter-in-law", "Parent-in-law", "Niece / Nephew", "Aunt / Uncle", "Cousin", "Other relative", "Non-relative",
];

const LINK_TYPES = { Husband: "spouse", Wife: "spouse", Brother: "sibling", Sister: "sibling" };
const clean = (value) => String(value ?? "").trim();

export const linkTypeForLabel = (label) => LINK_TYPES[clean(label)] || null;

// A legacy label is accepted only while it equals the value already saved for this member.
export function isAcceptedLabel(label, current = "") {
  const value = clean(label);
  return RELATIONSHIP_LABELS.includes(value) || (Boolean(clean(current)) && value === clean(current) && LEGACY_LABELS.includes(value));
}

// Dropdown entries. A saved label outside the new list is kept as a disabled "Saved" entry so it still displays.
export function labelOptions(current = "") {
  const options = RELATIONSHIP_LABELS.map((value) => ({ value, label: value, legacy: false }));
  const saved = clean(current);
  if (saved && saved !== "Household head" && !RELATIONSHIP_LABELS.includes(saved)) {
    options.push({ value: saved, label: `Saved: ${saved} (choose a specific relationship)`, legacy: true });
  }
  return options;
}
