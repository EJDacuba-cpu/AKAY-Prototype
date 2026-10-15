import { ADDRESS_FIELDS, HEAD_RELATIONSHIP, RELATIONSHIPS, MockRegistryError, addressValues, canHeadHousehold, commitMockPatient, patientName, publishMockRegistry } from "./mockFamilyRegistry.js";

const normalize = value => String(value ?? "").trim().toLowerCase();
export const familyName = (registry, household) => {
  const head = registry.patients.find(patient => patient.id === household.headPatientId);
  return head ? `${head.lastName} family` : household.serialNumber;
};
export const familyMembers = (registry, householdId) => registry.patients.filter(patient => patient.householdId === householdId);
export const connectionKey = edge => edge.type === "parent" ? `parent:${edge.from}:${edge.to}` : `${edge.type}:${[edge.from, edge.to].sort().join(":")}`;

// Registration's explicit parent selections are also valid connections. A
// relationship-to-head label and civil status never create graph edges.
export function familyConnections(registry, householdId) {
  const members = familyMembers(registry, householdId);
  const ids = new Set(members.map(patient => patient.id));
  const edges = [...(registry.connections || [])];
  for (const patient of members) for (const key of ["motherPatientId", "fatherPatientId"]) {
    if (patient[key]) edges.push({ from: patient[key], to: patient.id, type: "parent" });
  }
  return [...new Map(edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)).map(edge => [connectionKey(edge), edge])).values()];
}

export function connectionRows(registry, householdId, patientId) {
  return familyConnections(registry, householdId).filter(edge => edge.from === patientId || edge.to === patientId).map(edge => ({
    relativeId: edge.from === patientId ? edge.to : edge.from,
    type: edge.type === "parent" && edge.to === patientId ? "child" : edge.type,
  }));
}

export function graphErrors(members, edges) {
  const ids = new Set(members.map(patient => patient.id));
  const keys = new Set();
  const parents = new Map(members.map(patient => [patient.id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) return "Choose two different members of this household.";
    if (!["parent", "spouse", "sibling", "relative", "non-relative"].includes(edge.type)) return "Select a valid connection type.";
    const key = connectionKey(edge);
    if (keys.has(key)) return "This connection is already listed.";
    keys.add(key);
    if (edge.type === "parent") parents.get(edge.from).push(edge.to);
  }
  const reaches = (from, target, visited = new Set()) => {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return (parents.get(from) || []).some(child => reaches(child, target, visited));
  };
  for (const edge of edges) {
    if (edge.type === "parent" && reaches(edge.to, edge.from)) return "A parent–child connection cannot form a cycle.";
    if (["spouse", "sibling"].includes(edge.type) && (reaches(edge.from, edge.to) || reaches(edge.to, edge.from))) return "A parent or descendant cannot also be marked as a spouse or sibling.";
    if (edges.some(other => connectionKey(other) !== connectionKey(edge) && [other.from, other.to].includes(edge.from) && [other.from, other.to].includes(edge.to))) return "Choose one relationship for each pair of members.";
  }
  return "";
}

export function commitFamily(registry, draft, householdId, makeId = () => crypto.randomUUID()) {
  const current = registry.households.find(household => household.id === householdId);
  const errors = {};
  if (householdId && !current) errors.form = "This household no longer exists.";
  if (!normalize(draft.serialNumber)) errors.serialNumber = "Enter a Family Serial Number.";
  else if (registry.households.some(household => household.id !== householdId && normalize(household.serialNumber) === normalize(draft.serialNumber))) errors.serialNumber = "This Family Serial Number already exists.";
  const labels = { streetAddress: "House / Street", purokArea: "Purok", barangay: "Barangay", municipality: "Municipality" };
  for (const key of ADDRESS_FIELDS) if (!normalize(draft.address?.[key])) errors[key] = `${labels[key]} is required.`;
  const head = registry.patients.find(patient => patient.id === draft.headPatientId);
  if (!head || (head.householdId && head.householdId !== householdId)) errors.headPatientId = "Select an unlinked patient or a current member as household head.";
  const members = current ? familyMembers(registry, householdId) : [];
  if (current && current.headPatientId !== draft.headPatientId) {
    for (const member of members.filter(patient => patient.id !== draft.headPatientId)) {
      if (!RELATIONSHIPS.includes(draft.relationships?.[member.id])) errors[member.id] = "Select relationship to the new household head.";
    }
  }
  if (Object.keys(errors).length) throw new MockRegistryError(errors);
  const household = {
    ...current, id: householdId || `mock-household-${makeId()}`, serialNumber: draft.serialNumber.trim(), headPatientId: head.id,
    address: Object.fromEntries(ADDRESS_FIELDS.map(key => [key, draft.address[key].trim()])),
  };
  const patients = registry.patients.map(patient => patient.householdId === household.id || patient.id === head.id ? {
    ...patient, householdId: household.id, familySerialNumber: household.serialNumber, ...addressValues(household.address),
    relationshipToHouseholdHead: patient.id === head.id ? HEAD_RELATIONSHIP
      : current.headPatientId !== head.id ? draft.relationships[patient.id] : patient.relationshipToHouseholdHead,
  } : patient);
  return { ...registry, households: current ? registry.households.map(item => item.id === household.id ? household : item) : [...registry.households, household], patients };
}

export function commitFamilyMember(registry, householdId, draft) {
  const household = registry.households.find(item => item.id === householdId);
  const patient = registry.patients.find(item => item.id === draft.patientId);
  const errors = {};
  if (!household?.headPatientId) errors.form = "Assign a household head in Edit Family first.";
  if (!patient || (patient.householdId && patient.householdId !== householdId)) errors.patientId = "Select an existing unlinked patient. To move a linked patient, use Change Household in Edit Patient.";
  const isHead = household?.headPatientId === patient?.id;
  if (!isHead && !RELATIONSHIPS.includes(draft.relationship)) errors.relationship = "Select the relationship to the household head.";
  if (!patient?.householdId && !draft.connections?.length) errors.connections = "Add a connection to an existing household member.";
  const members = familyMembers(registry, householdId);
  const rows = draft.connections || [];
  rows.forEach((row, index) => {
    if (!members.some(member => member.id === row.relativeId && member.id !== patient?.id)) errors[`connection-${index}`] = "Choose another member of this household.";
    if (!["spouse", "child", "parent", "sibling", "relative", "non-relative"].includes(row.type)) errors[`connection-${index}`] = "Select a connection type.";
  });
  if (Object.keys(errors).length) throw new MockRegistryError(errors);
  const retained = familyConnections(registry, householdId).filter(edge => edge.from !== patient.id && edge.to !== patient.id);
  const additions = rows.map(row => row.type === "child"
    ? { from: row.relativeId, to: patient.id, type: "parent" }
    : { from: patient.id, to: row.relativeId, type: row.type });
  const edges = [...retained, ...additions];
  const memberList = patient.householdId ? members : [...members, patient];
  const graphError = graphErrors(memberList, edges);
  if (graphError) throw new MockRegistryError({ connections: graphError });
  let next = commitMockPatient(registry, patient, { kind: "existing", householdId, relationship: isHead ? HEAD_RELATIONSHIP : draft.relationship }, patient.id).registry;
  const memberIds = new Set(memberList.map(item => item.id));
  // Only edges inside this household are replaced; links to other households stay.
  next = { ...next, connections: [...(next.connections || []).filter(edge => !(memberIds.has(edge.from) && memberIds.has(edge.to))), ...edges] };
  // Removing an explicit parent edge also clears its registration ID; keep the
  // manually entered parent name, just as Patient Registration does on unlink.
  next.patients = next.patients.map(item => {
    if (!memberIds.has(item.id)) return item;
    const result = { ...item };
    for (const key of ["motherPatientId", "fatherPatientId"]) if (result[key] && !edges.some(edge => edge.type === "parent" && edge.from === result[key] && edge.to === result.id)) result[key] = "";
    return result;
  });
  return next;
}

export function saveFamily(draft, householdId) {
  const next = publishMockRegistry(registry => commitFamily(registry, draft, householdId));
  return householdId || next.households.at(-1).id;
}
export const saveFamilyMember = (householdId, draft) => publishMockRegistry(registry => commitFamilyMember(registry, householdId, draft));
export const connectionDescription = (edge, registry) => `${patientName(registry.patients.find(item => item.id === edge.from))} — ${edge.type === "parent" ? "parent of" : edge.type === "spouse" ? "spouse / partner of" : edge.type === "sibling" ? "sibling of" : edge.type === "relative" ? "relative of" : "non-relative of"} — ${patientName(registry.patients.find(item => item.id === edge.to))}`;

export function newFamilyHeadStatus(registry, patient) {
  const eligibility = canHeadHousehold(patient);
  if (!eligibility.ok) return { ok: false, reason: eligibility.code === "minor" ? "Under 18" : "Date of birth not recorded" };
  const household = registry.households.find(item => item.id === patient.householdId);
  if (!household) return { ok: true };
  if (household.headPatientId === patient.id && familyMembers(registry, household.id).some(member => member.id !== patient.id)) {
    return { ok: false, reason: `Assign a new head for ${household.serialNumber} first.` };
  }
  return { ok: true, notice: `Currently in ${household.serialNumber} (${patient.relationshipToHouseholdHead}). They will move to this new household.` };
}

// Add Family shares the registration creation path: the head is saved into a new household.
export function commitNewFamily(registry, draft, makeId = () => crypto.randomUUID()) {
  const errors = {};
  if (!normalize(draft.serialNumber)) errors.serialNumber = "Enter a Family Serial Number.";
  else if (registry.households.some(household => normalize(household.serialNumber) === normalize(draft.serialNumber))) errors.serialNumber = "This Family Serial Number already exists.";
  const labels = { streetAddress: "House / Street", purokArea: "Purok", barangay: "Barangay", municipality: "Municipality" };
  for (const key of ADDRESS_FIELDS) if (!normalize(draft.address?.[key])) errors[key] = `${labels[key]} is required.`;
  const head = registry.patients.find(patient => patient.id === draft.headPatientId);
  if (!head) errors.headPatientId = "This patient or household is no longer available. Search again.";
  else {
    const status = newFamilyHeadStatus(registry, head);
    if (!status.ok) errors.headPatientId = status.reason;
  }
  if (Object.keys(errors).length) throw new MockRegistryError(errors);
  const connection = { kind: "new", headPatientId: "self", relationship: HEAD_RELATIONSHIP, household: { serialNumber: draft.serialNumber, address: draft.address } };
  const result = commitMockPatient(registry, head, connection, head.id, makeId);
  return { registry: result.registry, householdId: result.patient.householdId };
}

export function saveNewFamily(draft) {
  let householdId;
  publishMockRegistry(registry => {
    const result = commitNewFamily(registry, draft);
    householdId = result.householdId;
    return result.registry;
  });
  return householdId;
}
