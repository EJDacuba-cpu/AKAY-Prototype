// Frontend prototype only. Form drafts stay local; explicit saves publish a
// shared snapshot for Patient Registration and Families. No API/database writes.
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

const normalize = (value) => String(value ?? "").trim().toLowerCase();
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

export function createMockRegistry() {
  const households = [
    { id: "mock-household-1", serialNumber: "FSN-001", headPatientId: "mock-patient-1", address: { streetAddress: "12 Mabini Street", purokArea: "Purok 1", barangay: "San Jose", municipality: "Bulakan" } },
    { id: "mock-household-2", serialNumber: "FSN-002", headPatientId: "mock-patient-4", address: { streetAddress: "48 Rizal Street", purokArea: "Purok 3", barangay: "Bambang", municipality: "Bulakan" } },
    { id: "mock-household-3", serialNumber: "FSN-003", headPatientId: "mock-patient-6", address: { streetAddress: "7 Sampaguita Street", purokArea: "Purok 2", barangay: "Perez", municipality: "Bulakan" } },
  ];
  const people = [
    ["mock-patient-1", "Roberto", "Santos", "1970-03-15", "Male", "mock-household-1", HEAD_RELATIONSHIP],
    ["mock-patient-2", "Elena", "Santos", "1972-06-10", "Female", "mock-household-1", "Spouse / Partner"],
    ["mock-patient-3", "Ana", "Reyes", "1998-01-20", "Female", "mock-household-1", "Niece / Nephew"],
    ["mock-patient-4", "Manuel", "Santos", "1981-10-12", "Male", "mock-household-2", HEAD_RELATIONSHIP],
    ["mock-patient-5", "Liza", "Santos", "1983-05-04", "Female", "mock-household-2", "Spouse / Partner"],
    ["mock-patient-6", "Carmen", "Dela Cruz", "1965-08-19", "Female", "mock-household-3", HEAD_RELATIONSHIP],
    ["mock-patient-7", "Paolo", "Santos", "1995-02-11", "Male", null, ""],
    ["mock-patient-8", "Mila", "Reyes", "1992-07-23", "Female", null, ""],
  ];
  households.push({ id: "mock-household-cruz", serialNumber: "FSN-00208", headPatientId: "mock-patient-roberto", address: { streetAddress: "18 Mabini Street", purokArea: "Purok 3", barangay: "Matungao", municipality: "Bulakan" } });
  people.push(
    ["mock-patient-roberto", "Roberto", "Cruz", "1968-03-15", "Male", "mock-household-cruz", HEAD_RELATIONSHIP],
    ["mock-patient-elena", "Elena", "Cruz", "1970-06-10", "Female", "mock-household-cruz", "Spouse / Partner"],
    ["mock-patient-miguel", "Miguel", "Cruz", "1993-01-20", "Male", "mock-household-cruz", "Son / Daughter"],
    ["mock-patient-ana", "Ana", "Cruz", "1994-05-04", "Female", "mock-household-cruz", "Son / Daughter-in-law"],
    ["mock-patient-sofia", "Sofia", "Cruz", "1998-08-19", "Female", "mock-household-cruz", "Son / Daughter"],
    ["mock-patient-lucas", "Lucas", "Cruz", "2018-02-11", "Male", "mock-household-cruz", "Grandchild"],
  );
  return {
    households,
    // These connections are explicitly seeded, never inferred from names/status.
    connections: [
      { from: "mock-patient-1", to: "mock-patient-2", type: "spouse" },
      { from: "mock-patient-4", to: "mock-patient-5", type: "spouse" },
      { from: "mock-patient-roberto", to: "mock-patient-elena", type: "spouse" },
      { from: "mock-patient-miguel", to: "mock-patient-ana", type: "spouse" },
      ...["roberto", "elena"].flatMap(parent => ["miguel", "sofia"].map(child => ({ from: `mock-patient-${parent}`, to: `mock-patient-${child}`, type: "parent" }))),
      ...["miguel", "ana"].map(parent => ({ from: `mock-patient-${parent}`, to: "mock-patient-lucas", type: "parent" })),
    ],
    patients: people.map(([id, firstName, lastName, birthDate, sex, householdId, relationshipToHouseholdHead]) => {
      const household = households.find((item) => item.id === householdId);
      return {
        id, firstName, middleName: "", lastName, birthDate, sex, civilStatus: "Single",
        householdId, relationshipToHouseholdHead,
        familySerialNumber: household?.serialNumber || "",
        ...addressValues(household?.address || { streetAddress: "25 Bonifacio Street", purokArea: "Purok 4", barangay: "Santa Ana", municipality: "Bulakan" }),
      };
    }),
  };
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

export function validateConnection(registry, connection, patientId, patient) {
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
    if (!normalize(household.serialNumber)) errors.serialNumber = "Family Serial Number is required.";
    else if (registry.households.some((item) => normalize(item.serialNumber) === normalize(household.serialNumber))) {
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
  if (relationship !== HEAD_RELATIONSHIP && !RELATIONSHIPS.includes(relationship)) {
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

export function validateHeadReplacement(registry, patientId, connection, replacement) {
  const departure = headDeparture(registry, patientId, connection);
  if (!departure?.members.length) return {};
  const errors = {};
  if (replacement?.householdId !== departure.household.id || !departure.members.some((item) => item.id === replacement?.headPatientId)) {
    errors.headPatientId = "Choose a replacement head for the household being left.";
  }
  departure.members.filter((item) => item.id !== replacement?.headPatientId).forEach((item) => {
    if (!RELATIONSHIPS.includes(replacement?.relationships?.[item.id])) errors[item.id] = "Select relationship to the new head.";
  });
  return errors;
}

export class MockRegistryError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0]);
    this.errors = errors;
  }
}

// Pure transaction: validation precedes every mutation. A failed save leaves
// both the patient and household collections untouched.
export function commitMockPatient(registry, form, connection, patientId, makeId = () => crypto.randomUUID(), replacement = null) {
  const errors = { ...validateConnection(registry, connection, patientId, form), ...validateHeadReplacement(registry, patientId, connection, replacement) };
  if (!form.firstName?.trim()) errors.firstName = "First name is required.";
  if (!form.lastName?.trim()) errors.lastName = "Last name is required.";
  if (patientId && !registry.patients.some((patient) => patient.id === patientId)) errors.patient = "Patient no longer exists in this mock session.";
  if (Object.keys(errors).length) throw new MockRegistryError(errors);

  const id = patientId || `mock-patient-${makeId()}`;
  let household = householdForConnection(registry, connection);
  const households = registry.households.map((item) => ({ ...item, address: { ...item.address } }));
  if (connection?.kind === "new") {
    household = {
      id: `mock-household-${makeId()}`,
      serialNumber: household.serialNumber.trim(),
      address: Object.fromEntries(ADDRESS_FIELDS.map((key) => [key, household.address[key].trim()])),
      headPatientId: connection.headPatientId === "self" ? id : connection.headPatientId,
    };
    households.push(household);
  }
  const saved = {
    ...form, id,
    name: patientName(form), fullName: patientName(form),
    householdId: household?.id || null,
    familySerialNumber: household?.serialNumber || "",
    relationshipToHouseholdHead: relationshipForConnection(registry, connection, patientId),
    ...(household ? addressValues(household.address) : {}),
  };
  let patients = registry.patients.filter((patient) => patient.id !== id).map((patient) => ({ ...patient }));
  if (connection?.kind === "new" && household.headPatientId !== id) {
    patients = patients.map((patient) => patient.id === household.headPatientId ? {
      ...patient, householdId: household.id, familySerialNumber: household.serialNumber,
      relationshipToHouseholdHead: HEAD_RELATIONSHIP, ...addressValues(household.address),
    } : patient);
  }
  patients.push(saved);
  const departure = headDeparture(registry, patientId, connection);
  if (departure) {
    const previousHousehold = households.find((item) => item.id === departure.household.id);
    previousHousehold.headPatientId = departure.members.length ? replacement.headPatientId : null;
    patients = patients.map((item) => item.householdId === previousHousehold.id ? {
      ...item,
      relationshipToHouseholdHead: item.id === previousHousehold.headPatientId ? HEAD_RELATIONSHIP : replacement.relationships[item.id],
    } : item);
  }
  // Links survive a move: edges keep both endpoints, so a moved patient's
  // relatives in the old household become related-family links.
  const parentEdgeKey = (from, to) => `parent:${from}:${to}`;
  const connections = (registry.connections || []).filter(edge =>
    patients.some(item => item.id === edge.from) && patients.some(item => item.id === edge.to));
  const knownParentEdges = new Set(connections.filter(edge => edge.type === "parent").map(edge => parentEdgeKey(edge.from, edge.to)));
  // Staging a household change blanks the form's parent IDs, so a mover's saved
  // parent links are read back from the registry before it is overwritten.
  const previous = patientId ? registry.patients.find(item => item.id === patientId) : null;
  const moved = Boolean(previous?.householdId) && previous.householdId !== household?.id;
  patients = patients.map(item => {
    const next = { ...item };
    for (const key of ["motherPatientId", "fatherPatientId"]) {
      if (item.id === id && moved && !next[key] && previous[key]) next[key] = previous[key];
      if (!next[key]) continue;
      const parent = patients.find(candidate => candidate.id === next[key]);
      if (parent && parent.householdId && parent.householdId === next.householdId) continue;
      // The registration ID no longer applies across households; keep the relationship as an explicit edge.
      if (parent && !knownParentEdges.has(parentEdgeKey(parent.id, next.id))) {
        connections.push({ from: parent.id, to: next.id, type: "parent" });
        knownParentEdges.add(parentEdgeKey(parent.id, next.id));
      }
      next[key] = "";
    }
    return next;
  });
  return { registry: { ...registry, households: archiveEmptyHouseholds(households, patients), patients, connections }, patient: patients.find(item => item.id === id) };
}

let snapshot = createMockRegistry();
const listeners = new Set();
export const getMockRegistry = () => snapshot;
export function subscribeMockRegistry(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function saveMockPatient(form, connection, patientId, replacement) {
  const result = commitMockPatient(snapshot, form, connection, patientId, undefined, replacement);
  publishMockRegistry(() => result.registry);
  return result.patient;
}

export function publishMockRegistry(transaction) {
  // The callback must validate before returning. Exceptions leave the store intact.
  snapshot = transaction(snapshot);
  listeners.forEach((listener) => listener());
  return snapshot;
}
