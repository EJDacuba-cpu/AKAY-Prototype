// Search and filters for the admin Facilities module. Search covers name, barangay and address;
// the default RHU and alternatives filters only apply to BHCs (RHUs have no receiving RHU).
export const ALL_STATUS = "All Status";
export const ALL_RHUS = "All RHUs";
export const ALL_ALTERNATIVES = "All";
export const WITH_ALTERNATIVES = "With alternatives";
export const NO_ALTERNATIVES = "No alternatives";

export const DEFAULT_FACILITY_FILTERS = {
  search: "",
  status: ALL_STATUS,
  rhu: ALL_RHUS,
  alternatives: ALL_ALTERNATIVES,
};

export function filterFacilities(items, filters, type) {
  const query = filters.search.trim().toLowerCase();
  const isBhc = type === "bhc";

  return items.filter((facility) => {
    if (query) {
      const text = [facility.name, facility.barangay, facility.address].filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(query)) return false;
    }
    if (filters.status !== ALL_STATUS && facility.status !== filters.status.toLowerCase()) return false;
    if (!isBhc) return true;
    if (filters.rhu !== ALL_RHUS && facility.rural_health_unit?.name !== filters.rhu) return false;

    const hasAlternatives = (facility.alternative_rhus || []).length > 0;
    if (filters.alternatives === WITH_ALTERNATIVES && !hasAlternatives) return false;
    if (filters.alternatives === NO_ALTERNATIVES && hasAlternatives) return false;

    return true;
  });
}

export function facilityFilterChips(filters, type) {
  const chips = [];

  if (filters.search.trim()) chips.push({ key: "search", label: `Search: "${filters.search.trim()}"` });
  if (filters.status !== ALL_STATUS) chips.push({ key: "status", label: filters.status });
  if (type === "bhc" && filters.rhu !== ALL_RHUS) chips.push({ key: "rhu", label: filters.rhu });
  if (type === "bhc" && filters.alternatives !== ALL_ALTERNATIVES) chips.push({ key: "alternatives", label: filters.alternatives });

  return chips;
}
