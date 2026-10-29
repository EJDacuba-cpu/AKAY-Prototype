/**
 * Family Conditions choice for the ITR Family History radios.
 * Stored shape is still { noneKnown, items }: there is no persisted Unsure flag.
 */

function itemsOf(family) {
  return Array.isArray(family?.items) ? family.items : [];
}

/** "yes" | "none" | "" (not recorded). Unsure cannot be read back from storage. */
export function familyConditionChoice(family) {
  if (!family || typeof family !== "object") return "";
  if (family.noneKnown === true) return "none";
  if (itemsOf(family).some((item) => String(item?.condition || "").trim())) return "yes";
  return "";
}

/**
 * Slice to stage for a radio choice. Unsure never clears saved None known or
 * saved conditions — it only matches empty history (same as not recorded).
 */
export function familyHistoryForChoice(choice, { items = [], saved = {} } = {}) {
  if (choice === "none") return { noneKnown: true, items: [] };
  if (choice === "yes") return { noneKnown: false, items: Array.isArray(items) ? items : [] };
  if (choice === "unsure") {
    if (saved?.noneKnown === true) return { noneKnown: true, items: [] };
    const savedItems = itemsOf(saved);
    if (savedItems.length) return { noneKnown: false, items: savedItems };
    return { noneKnown: false, items: [] };
  }
  return { noneKnown: false, items: [] };
}

export const FAMILY_CONDITION_OPTIONS = [
  { value: "yes", label: "Yes — Has known family conditions" },
  { value: "none", label: "No — None known" },
  { value: "unsure", label: "Unsure — Patient doesn't know" },
];
