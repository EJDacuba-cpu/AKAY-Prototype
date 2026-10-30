// Deferred prototype store. Live BHC uses the household API.
import { ADDRESS_FIELDS, HEAD_RELATIONSHIP, patientName, addressValues, archiveEmptyHouseholds, householdForConnection, relationshipForConnection, validateConnection, headDeparture, validateHeadReplacement } from "./familyRegistry.js";
export * from "./familyRegistry.js";
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
