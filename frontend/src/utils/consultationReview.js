// Read-only program values, including nested tables and observations.
export function programReviewRows(value, prefix = "") {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value !== "object") return [{ label: prefix, value: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value) }];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (["medicineId", "given_by_id", "givenById"].includes(key)) return [];
    const label = /^\d+$/.test(key) ? String(Number(key) + 1) : key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, char => char.toUpperCase());
    return programReviewRows(entry, prefix ? prefix + " / " + label : label);
  });
}

const hasReviewValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";

/** Review rows that carry a value; a row with no value is omitted rather than shown as "Not recorded". */
export function compactReviewRows(rows = []) {
  return (rows || []).filter((row) => row && hasReviewValue(row.value));
}

/** Compacts each section's rows and drops a section that ends up with none. */
export function compactReviewSections(sections = []) {
  return (sections || [])
    .map((section) => ({ ...section, rows: compactReviewRows(section.rows) }))
    .filter((section) => section.rows.length > 0);
}
