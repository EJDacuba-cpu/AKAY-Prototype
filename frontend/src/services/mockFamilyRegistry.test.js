import test from "node:test";
import assert from "node:assert/strict";
import {
  ADDRESS_FIELDS, HEAD_RELATIONSHIP, addressValues, commitMockPatient,
  connectionForPatient, createMockRegistry, searchHouseholds, stageConnection,
  validateConnection,
  headDeparture, validateHeadReplacement,
} from "./mockFamilyRegistry.js";

const patient = { firstName: "Test", lastName: "Santos", birthDate: "1990-01-01", sex: "Male", civilStatus: "Single", streetAddress: "99 Test Street", purokArea: "Purok 5", barangay: "Tibig", municipality: "Bulakan", familySerialNumber: "" };
const existing = (householdId = "mock-household-1", relationship = "Cousin") => ({ kind: "existing", householdId, relationship });
const newHousehold = (headPatientId = "self") => ({
  kind: "new", headPatientId, relationship: headPatientId === "self" ? "" : "Sibling",
  household: { serialNumber: "FSN-100", address: addressValues(patient) },
});
let sequence = 0;
const id = () => `test-${++sequence}`;
const seed = createMockRegistry();

test("same-surname households stay separate; search covers serial, head and extended-family member", () => {
  const registry = createMockRegistry();
  assert.deepEqual(searchHouseholds(registry, "santos").map((item) => item.serialNumber), ["FSN-001", "FSN-002"]);
  assert.notDeepEqual(registry.households[0].address, registry.households[1].address);
  assert.equal(searchHouseholds(registry, "  fsn-002 ")[0].headPatientId, "mock-patient-4");
  assert.equal(searchHouseholds(registry, "Roberto")[0].id, "mock-household-1");
  assert.equal(searchHouseholds(registry, "Ana Reyes")[0].id, "mock-household-1");
  assert.equal(searchHouseholds(registry, "Paolo").length, 0);
});

test("unlinked save creates neither a household nor a placeholder serial, regardless of surname", () => {
  const registry = createMockRegistry();
  const result = commitMockPatient(registry, { ...patient, familySerialNumber: "IGNORE-ME" }, null, undefined, id);
  assert.equal(result.registry.households.length, registry.households.length);
  assert.equal(result.patient.householdId, null);
  assert.equal(result.patient.familySerialNumber, "");
  assert.equal(result.patient.relationshipToHouseholdHead, "");
  assert.deepEqual(addressValues(result.patient), addressValues(patient));
});

test("confirming a connection stages address without modifying saved patient or registry; discarding draft is safe", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  const saved = registry.patients.find((item) => item.id === "mock-patient-7");
  const staged = stageConnection(saved, registry, existing());
  assert.equal(staged.familySerialNumber, "FSN-001");
  assert.deepEqual(addressValues(staged), registry.households[0].address);
  assert.deepEqual(registry, before);
  assert.equal(saved.householdId, null);
  const cancelled = { ...saved };
  assert.equal(cancelled.familySerialNumber, "");
  assert.deepEqual(addressValues(cancelled), addressValues(before.patients[6]));
});

test("missing relationship or invalid household prevents save without partial writes", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  assert.ok(validateConnection(registry, existing("mock-household-1", "")).relationship);
  assert.ok(validateConnection(registry, existing("missing")).household);
  assert.ok(validateConnection(registry, existing("mock-household-1", HEAD_RELATIONSHIP)).relationship);
  assert.throws(() => commitMockPatient(registry, patient, existing("mock-household-1", ""), undefined, id));
  assert.deepEqual(registry, before);
});

test("new household requires unique trimmed case-insensitive serial and every address field", () => {
  const registry = createMockRegistry();
  const duplicate = newHousehold();
  duplicate.household.serialNumber = " fsn-001 ";
  assert.ok(validateConnection(registry, duplicate).serialNumber);
  for (const field of ADDRESS_FIELDS) {
    const draft = newHousehold();
    draft.household.address[field] = "  ";
    assert.ok(validateConnection(registry, draft)[field]);
    assert.throws(() => commitMockPatient(registry, patient, draft, undefined, id));
  }
  assert.equal(registry.households.length, seed.households.length);
  assert.equal(registry.patients.length, seed.patients.length);
});

test("new household and registering head save together, after staging no empty household exists", () => {
  const registry = createMockRegistry();
  const draft = newHousehold();
  const staged = stageConnection(patient, registry, draft);
  assert.equal(registry.households.length, seed.households.length);
  const result = commitMockPatient(registry, staged, draft, undefined, id);
  const household = result.registry.households.find((item) => item.id === result.patient.householdId);
  assert.equal(result.registry.households.length, seed.households.length + 1);
  assert.equal(result.registry.patients.length, seed.patients.length + 1);
  assert.equal(household.headPatientId, result.patient.id);
  assert.equal(result.patient.relationshipToHouseholdHead, HEAD_RELATIONSHIP);
});

test("existing unlinked head is linked atomically with new patient; existing linked patients cannot be selected", () => {
  const registry = createMockRegistry();
  const result = commitMockPatient(registry, patient, newHousehold("mock-patient-7"), undefined, id);
  const head = result.registry.patients.find((item) => item.id === "mock-patient-7");
  assert.equal(head.householdId, result.patient.householdId);
  assert.equal(head.relationshipToHouseholdHead, HEAD_RELATIONSHIP);
  assert.deepEqual(addressValues(head), addressValues(result.patient));
  assert.equal(registry.patients[6].householdId, null);
  assert.ok(validateConnection(registry, newHousehold("mock-patient-1")).headPatientId);
  assert.ok(validateConnection(registry, newHousehold("missing")).headPatientId);
  assert.ok(validateConnection(registry, { ...newHousehold("mock-patient-7"), relationship: "" }).relationship);
});

test("later Edit Patient links the same saved unlinked patient without creating a duplicate patient", () => {
  const registry = createMockRegistry();
  const initial = commitMockPatient(registry, patient, null, undefined, id);
  const updated = commitMockPatient(initial.registry, initial.patient, existing(), initial.patient.id, id);
  assert.equal(updated.registry.patients.length, initial.registry.patients.length);
  assert.equal(updated.patient.id, initial.patient.id);
  assert.equal(updated.patient.householdId, "mock-household-1");
  assert.equal(updated.registry.households.length, seed.households.length);
});

test("moving a member changes only their saved connection/address; prior snapshot survives cancelled edit", () => {
  const registry = createMockRegistry();
  const saved = registry.patients[2];
  const before = structuredClone(saved);
  const draft = stageConnection(saved, registry, existing("mock-household-2"));
  assert.deepEqual(saved, before);
  const result = commitMockPatient(registry, draft, existing("mock-household-2"), saved.id, id);
  assert.equal(result.patient.householdId, "mock-household-2");
  assert.deepEqual(addressValues(result.patient), registry.households[1].address);
  assert.deepEqual(registry.patients[2], before);
  assert.equal(result.registry.patients.find((item) => item.id === "mock-patient-1").householdId, "mock-household-1");
});

test("Remove Connection retains address and clears link/serial only after save", () => {
  const registry = createMockRegistry();
  const saved = registry.patients[2];
  const draft = stageConnection(saved, registry, null);
  assert.equal(draft.familySerialNumber, "");
  assert.deepEqual(addressValues(draft), addressValues(saved));
  assert.equal(connectionForPatient(saved).householdId, "mock-household-1");
  const result = commitMockPatient(registry, draft, null, saved.id, id);
  assert.equal(result.patient.householdId, null);
  assert.equal(result.patient.familySerialNumber, "");
  assert.equal(result.patient.relationshipToHouseholdHead, "");
  assert.deepEqual(addressValues(result.patient), addressValues(saved));
});

test("save rechecks serial/head availability so a stale staged draft cannot partially commit", () => {
  const registry = createMockRegistry();
  const draft = newHousehold("mock-patient-7");
  assert.deepEqual(validateConnection(registry, draft), {});
  const first = commitMockPatient(registry, patient, draft, undefined, id);
  const before = structuredClone(first.registry);
  assert.throws(() => commitMockPatient(first.registry, patient, draft, undefined, id));
  assert.deepEqual(first.registry, before);
});

test("saved head keeps automatic head relationship when reopening their current household", () => {
  const registry = createMockRegistry();
  const saved = registry.patients[0];
  const connection = connectionForPatient(saved);
  assert.deepEqual(validateConnection(registry, connection, saved.id), {});
  const result = commitMockPatient(registry, saved, connection, saved.id, id);
  assert.equal(result.patient.relationshipToHouseholdHead, HEAD_RELATIONSHIP);
});

test("a departing head must explicitly choose a remaining head and relationships; no automatic reassignment", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  const saved = registry.patients[0];
  assert.equal(headDeparture(registry, saved.id, null).members.length, 2);
  assert.throws(() => commitMockPatient(registry, saved, null, saved.id, id));
  assert.deepEqual(registry, before);
  const replacement = { householdId: "mock-household-1", headPatientId: "mock-patient-2", relationships: { "mock-patient-3": "Niece / Nephew" } };
  assert.deepEqual(validateHeadReplacement(registry, saved.id, null, replacement), {});
  const result = commitMockPatient(registry, saved, null, saved.id, id, replacement);
  assert.equal(result.registry.households[0].headPatientId, "mock-patient-2");
  assert.equal(result.registry.patients.find((item) => item.id === "mock-patient-2").relationshipToHouseholdHead, HEAD_RELATIONSHIP);
  assert.equal(result.registry.patients.find((item) => item.id === "mock-patient-3").relationshipToHouseholdHead, "Niece / Nephew");
  assert.equal(result.patient.householdId, null);
  assert.deepEqual(addressValues(result.patient), addressValues(saved));
});

test("moving a head updates both households in one commit while cancelled drafts preserve both", () => {
  const registry = createMockRegistry();
  const replacement = { householdId: "mock-household-1", headPatientId: "mock-patient-2", relationships: { "mock-patient-3": "Niece / Nephew" } };
  const saved = registry.patients[0];
  const connection = existing("mock-household-2", "Sibling");
  const result = commitMockPatient(registry, saved, connection, saved.id, id, replacement);
  assert.equal(registry.households[0].headPatientId, saved.id);
  assert.equal(result.registry.households[0].headPatientId, "mock-patient-2");
  assert.equal(result.registry.households[1].headPatientId, "mock-patient-4");
  assert.equal(result.patient.householdId, "mock-household-2");
  assert.equal(result.patient.relationshipToHouseholdHead, "Sibling");
});

test("removing a sole head preserves the saved household but prevents connecting to a missing head", () => {
  const registry = createMockRegistry();
  const saved = registry.patients[5];
  const result = commitMockPatient(registry, saved, null, saved.id, id);
  assert.equal(result.registry.households[2].headPatientId, null);
  assert.ok(validateConnection(result.registry, existing("mock-household-3")).household);
  assert.equal(result.patient.familySerialNumber, "");
});

test("failed patient validation does not create even a valid staged household", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  assert.throws(() => commitMockPatient(registry, { ...patient, firstName: "" }, newHousehold(), undefined, id));
  assert.deepEqual(registry, before);
});
