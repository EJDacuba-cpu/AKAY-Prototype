// Pure household form rules shared by live BHC and deferred prototypes.
export const ADDRESS_FIELDS = ["streetAddress", "purokArea", "barangay", "municipality"];
export const RELATIONSHIPS = [
  "Spouse / Partner", "Son / Daughter", "Parent", "Sibling", "Grandchild",
  "Grandparent", "Son / Daughter-in-law", "Parent-in-law", "Niece / Nephew",
  "Aunt / Uncle", "Cousin", "Other relative", "Non-relative",
];
export const HEAD_RELATIONSHIP = "Household head";
export const NO_HOUSEHOLD_MESSAGE = "Search for a household or create a new one.";
export const MINOR_HEAD_MESSAGE = "A patient under 18 can't be a household head. Register the parent or guardian first, then add this child to their household.";
export const MISSING_BIRTH_DATE_MESSAGE = "Enter the date of birth first.";

export const normalize = (value) => String(value ?? "").trim().toLowerCase();
export const patientName = (patient) =>
  [patient?.firstName, patient?.middleName, patient?.lastName].filter(Boolean).join(" ") || "Unnamed patient";
export const addressText = (address) => ADDRESS_FIELDS.map((key) => address?.[key]).filter(Boolean).join(", ");
export const addressValues = (address) => Object.fromEntries(ADDRESS_FIELDS.map((key) => [key, address?.[key] || ""]));

// Whole years on `today`; a birthday later in the year has not happened yet.
export function canHeadHousehold(patient, today = new Date()) {
  const [year, month, day] = String(patient?.birthDate || "").split("-").map(Number);
  if (!year || !month || !day) return { ok: false, code: "missing-birth-date", reason: MISSING_BIRTH_DATE_MESSAGE };
  const birthdayPassed = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  const age = today.getFullYear() - year - (birthdayPassed ? 0 : 1);
  return age >= 18 ? { ok: true } : { ok: false, code: "minor", reason: MINOR_HEAD_MESSAGE };
}

// Archived households count too, so a retired FSN is never handed out again.
export function nextSerialNumber(registry, date = new Date()) {
  const year = date.getFullYear();
  const highest = registry.households.reduce((max, household) => {
    const match = /^FSN-(\d{4})-(\d{4})$/i.exec(String(household.serialNumber ?? "").trim());
    return match && Number(match[1]) === year ? Math.max(max, Number(match[2])) : max;
  }, 0);
  return `FSN-${year}-${String(highest + 1).padStart(4, "0")}`;
}

const isSelfHousehold = (connection) => connection?.kind === "new" && connection.headPatientId === "self";

// A self-headed new household takes its address from the form when saved.
export function withFormAddress(connection, form) {
  return isSelfHousehold(connection)
    ? { ...connection, household: { ...connection.household, address: addressValues(form) } }
    : connection;
}

// A household with no members left is archived, never deleted: its FSN stays reserved.
export function archiveEmptyHouseholds(households, patients, now = new Date()) {
  return households.map(household => !household.archivedAt && !patients.some(patient => patient.householdId === household.id)
    ? { ...household, headPatientId: null, archivedAt: now.toISOString() }
    : household);
}

export function searchHouseholds(registry, query) {
  const needle = normalize(query);
  return registry.households.filter((household) => {
    if (household.archivedAt) return false;
    const members = registry.patients.filter((patient) => patient.householdId === household.id);
    const head = registry.patients.find((patient) => patient.id === household.headPatientId);
    return [household.serialNumber, patientName(head), addressText(household.address), ...members.map(patientName)]
      .some((value) => normalize(value).includes(needle));
  });
}

export function connectionForPatient(patient) {
  return patient?.householdId
    ? { kind: "existing", householdId: patient.householdId, relationship: patient.relationshipToHouseholdHead }
    : null;
}

export function householdForConnection(registry, connection) {
  if (!connection) return null;
  return connection.kind === "new"
    ? connection.household
    : registry.households.find((household) => household.id === connection.householdId) || null;
}

export function relationshipForConnection(registry, connection, patientId) {
  const household = householdForConnection(registry, connection);
  const isHead = connection?.kind === "new"
    ? connection.headPatientId === "self"
    : Boolean(patientId && household?.headPatientId === patientId);
  return isHead ? HEAD_RELATIONSHIP : connection?.relationship === HEAD_RELATIONSHIP ? "" : connection?.relationship || "";
}

const defaultAllowed = (label) => RELATIONSHIPS.includes(label);

// `isAllowed(label, savedLabel)` lets live BHC registration use the specific label list; the default keeps the mock prototype on its own list.
export function validateConnection(registry, connection, patientId, patient, isAllowed = defaultAllowed) {
  if (!connection) return { household: NO_HOUSEHOLD_MESSAGE };
  const errors = {};
  const household = householdForConnection(registry, connection);
  if (connection.kind !== "existing" && connection.kind !== "new") {
    return { household: "Choose a valid household." };
  }
  if (!household) return { household: "Select a household." };
  if (connection.kind === "existing" && !household.headPatientId) {
    errors.household = "This household has no assigned head. Choose a household with a head.";
  }
  if (connection.kind === "new") {
    if (household.serialMode !== "auto" && !normalize(household.serialNumber)) errors.serialNumber = "Family Serial Number is required.";
    else if (household.serialMode !== "auto" && registry.households.some((item) => normalize(item.serialNumber) === normalize(household.serialNumber))) {
      errors.serialNumber = "This Family Serial Number already exists.";
    }
    const labels = { streetAddress: "House / Street", purokArea: "Purok", barangay: "Barangay", municipality: "Municipality" };
    ADDRESS_FIELDS.forEach((key) => {
      if (!normalize(household.address?.[key])) errors[key] = `${labels[key]} is required.`;
    });
    if (connection.headPatientId === "self") {
      const eligibility = patient ? canHeadHousehold(patient) : { ok: true };
      if (!eligibility.ok) errors.headPatientId = eligibility.reason;
    } else {
      const head = registry.patients.find((patient) => patient.id === connection.headPatientId);
      if (!head || head.householdId || head.id === patientId) errors.headPatientId = "Select an existing unlinked patient as head.";
    }
  }
  const relationship = relationshipForConnection(registry, connection, patientId);
  const saved = registry.patients.find((item) => item.id === patientId);
  const savedLabel = saved && connection.kind === "existing" && saved.householdId === connection.householdId ? saved.relationshipToHouseholdHead : "";
  if (relationship !== HEAD_RELATIONSHIP && !isAllowed(relationship, savedLabel)) {
    errors.relationship = "Select the patient's relationship to the household head.";
  }
  return errors;
}

export function stageConnection(form, registry, connection) {
  const household = householdForConnection(registry, connection);
  const serial = household?.serialNumber.trim() || "";
  return {
    ...form,
    ...(household && !isSelfHousehold(connection) ? addressValues(household.address) : {}),
    familySerialNumber: serial,
    // Parent names remain available as manual entries after moving household.
    ...(serial !== form.familySerialNumber ? { motherPatientId: "", fatherPatientId: "" } : {}),
  };
}

export function headDeparture(registry, patientId, connection) {
  const patient = registry.patients.find((item) => item.id === patientId);
  const household = registry.households.find((item) => item.id === patient?.householdId);
  if (!household || household.headPatientId !== patientId ||
      (connection?.kind === "existing" && connection.householdId === household.id)) return null;
  return { household, members: registry.patients.filter((item) => item.householdId === household.id && item.id !== patientId) };
}

export function validateHeadReplacement(registry, patientId, connection, replacement, isAllowed = defaultAllowed) {
  const departure = headDeparture(registry, patientId, connection);
  if (!departure?.members.length) return {};
  const errors = {};
  if (replacement?.householdId !== departure.household.id || !departure.members.some((item) => item.id === replacement?.headPatientId)) {
    errors.headPatientId = "Choose a replacement head for the household being left.";
  }
  departure.members.filter((item) => item.id !== replacement?.headPatientId).forEach((item) => {
    if (!isAllowed(replacement?.relationships?.[item.id], item.relationshipToHouseholdHead)) errors[item.id] = "Select relationship to the new head.";
  });
  return errors;
}

