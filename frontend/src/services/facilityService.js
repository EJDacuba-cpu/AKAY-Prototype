import { apiRequest, unwrapData, unwrapList } from "./apiClient";

function normalizeFacility(facility = {}, type = "") {
  return {
    ...facility,
    id: facility.id ? String(facility.id) : "",
    name: facility.name || "",
    barangay: facility.barangay || "",
    municipality: facility.municipality || "",
    province: facility.province || "",
    status: facility.status || "active",
    type,
  };
}

function facilityPayload(facility = {}) {
  return {
    name: facility.name,
    barangay: facility.barangay || null,
    municipality: facility.municipality || null,
    province: facility.province || null,
    address: facility.address || null,
    contact_number: facility.contactNumber || facility.contact_number || null,
    status: facility.status || "active",
  };
}

export async function getBarangayHealthCenters() {
  const response = await apiRequest("/barangay-health-centers");
  return unwrapList(response).map((facility) =>
    normalizeFacility(facility, "bhc"),
  );
}

export async function getRuralHealthUnits() {
  const response = await apiRequest("/rural-health-units");
  return unwrapList(response).map((facility) =>
    normalizeFacility(facility, "rhu"),
  );
}

export async function createBarangayHealthCenter(facility) {
  const response = await apiRequest("/barangay-health-centers", {
    method: "POST",
    body: facilityPayload(facility),
  });
  return normalizeFacility(unwrapData(response), "bhc");
}

export async function createRuralHealthUnit(facility) {
  const response = await apiRequest("/rural-health-units", {
    method: "POST",
    body: facilityPayload(facility),
  });
  return normalizeFacility(unwrapData(response), "rhu");
}
