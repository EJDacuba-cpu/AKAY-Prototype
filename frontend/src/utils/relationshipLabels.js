// Relationship to the household head. Only Husband/Wife/Father/Mother/Son/Daughter
// may be chosen for new members; those six also drive an explicit connection.
// Keep in sync with backend App\Services\RelationshipLabels.
export const RELATIONSHIP_LABELS = [
  "Husband", "Wife", "Father", "Mother", "Son", "Daughter",
];

// Saved before the connectable list. They stay readable and are never rewritten.
export const LEGACY_LABELS = [
  "Partner", "Brother", "Sister",
  "Grandfather", "Grandmother", "Grandson", "Granddaughter",
  "Father-in-law", "Mother-in-law", "Son-in-law", "Daughter-in-law",
  "Uncle", "Aunt", "Nephew", "Niece", "Cousin", "Other relative", "Non-relative",
  "Spouse / Partner", "Son / Daughter", "Parent", "Sibling", "Grandchild", "Grandparent",
  "Son / Daughter-in-law", "Parent-in-law", "Niece / Nephew", "Aunt / Uncle",
];

const LINK_TYPES = { Husband: "spouse", Wife: "spouse", Brother: "sibling", Sister: "sibling" };
const clean = (value) => String(value ?? "").trim();

export const linkTypeForLabel = (label) => LINK_TYPES[clean(label)] || null;

/**
 * Explicit registration connection for the six connectable labels.
 * - Son/Daughter: head becomes mother/father from the head's sex.
 * - Mother/Father: new patient becomes parent of the head; only when their sex matches.
 * - Husband/Wife: spouse link (no sex gate here; backend stores the pair).
 */
export function relationshipLinkFor(relationship, head = {}, registrant = {}) {
  const label = clean(relationship);
  if (label === "Husband" || label === "Wife") return { type: "spouse" };
  if (label === "Mother") return clean(registrant.sex) === "Female" ? { type: "mother" } : null;
  if (label === "Father") return clean(registrant.sex) === "Male" ? { type: "father" } : null;
  if (label === "Son" || label === "Daughter") {
    const sex = clean(head.sex);
    if (sex === "Female") return { type: "mother" };
    if (sex === "Male") return { type: "father" };
    return null;
  }
  return null;
}

/** Frontend copy when Mother/Father is chosen but the new patient's sex does not match. */
export function parentRoleMismatchMessage(relationship, registrant = {}) {
  const label = clean(relationship);
  const sex = clean(registrant.sex);
  if (label === "Mother" && sex && sex !== "Female") {
    return "Mother must be Female. For a child of this household, choose Son or Daughter instead.";
  }
  if (label === "Father" && sex && sex !== "Male") {
    return "Father must be Male. For a child of this household, choose Son or Daughter instead.";
  }
  if ((label === "Mother" || label === "Father") && !sex) {
    return "Select the patient's sex first before confirming Mother/Father.";
  }
  return "";
}

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
