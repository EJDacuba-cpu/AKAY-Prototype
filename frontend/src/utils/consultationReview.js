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
