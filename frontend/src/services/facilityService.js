import { apiRequest, unwrapData, unwrapList } from "./apiClient";

function normalizeFacility(facility = {}, type = "") {
  const receivingRhu =
    facility.rural_health_unit || facility.ruralHealthUnit || null;

  return {
    ...facility,
    id: facility.id ? String(facility.id) : "",
    name: facility.name || "",
    barangay: facility.barangay || "",
    municipality: facility.municipality || "",
    province: facility.province || "",
    status: facility.status || "active",
    receivingRuralHealthUnitId:
      facility.rural_health_unit_id || receivingRhu?.id || "",
    receivingRuralHealthUnit: receivingRhu
      ? {
          ...receivingRhu,
          id: receivingRhu.id ? String(receivingRhu.id) : "",
          name: receivingRhu.name || "",
        }
      : null,
    type,
  };
}

function facilityPayload(facility = {}, includeReceivingRhu = false) {
  const payload = {
    name: facility.name,
    barangay: facility.barangay || null,
    municipality: facility.municipality || null,
    province: facility.province || null,
    address: facility.address || null,
    contact_number: facility.contactNumber || facility.contact_number || null,
    status: facility.status || "active",
  };

  if (includeReceivingRhu) {
    payload.rural_health_unit_id =
      facility.receivingRuralHealthUnitId ||
      facility.ruralHealthUnitId ||
      facility.rural_health_unit_id ||
      null;
  }

  return payload;
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
    body: facilityPayload(facility, true),
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
