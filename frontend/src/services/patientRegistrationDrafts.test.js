import test from "node:test";
import assert from "node:assert/strict";
import { createRegistrationDraftStore, registrationPath } from "./patientRegistrationDrafts.js";
import { commitMockPatient, connectionForPatient, createMockRegistry, searchHouseholds } from "./mockFamilyRegistry.js";
const seed = createMockRegistry();

const form = {
  firstName: "Test", middleName: "Patient", lastName: "Santos", birthDate: "1995-01-01", sex: "Female",
  civilStatus: "Married", occupation: "Teacher", spouseName: "Test Spouse", spouseOccupation: "Vendor",
  contactNumber: "09123456789", philHealthStatus: "With PhilHealth", philHealthNumber: "123456789012",
  nhtsStatus: "NHTS", familySerialNumber: "", streetAddress: "99 Old Street", purokArea: "Purok 7",
  barangay: "Tibig", municipality: "Bulakan", motherName: "Test Mother", fatherName: "Test Father",
};
const snapshot = (overrides = {}) => ({ form, householdConnection: null, headReplacement: null, createdPatientId: "", fieldErrors: {}, ...overrides });
const candidate = (headPatientId = "self") => ({
  kind: "new", headPatientId, relationship: headPatientId === "self" ? "Household head" : "Sibling",
  household: { serialNumber: "FSN-100", address: { streetAddress: "8 New Street", purokArea: "Purok 2", barangay: "Perez", municipality: "Bulakan" } },
});

test("screen navigation preserves the complete registration draft; Back/Cancel leaves registry unchanged", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  const drafts = createRegistrationDraftStore();
  const key = registrationPath("/bhc");
  const original = snapshot({ fieldErrors: { contactNumber: "Review contact" } });
  drafts.write(key, original);
  // Leaving creation without calling stageHousehold is Back/Cancel.
  assert.deepEqual(drafts.read(key), original);
  assert.deepEqual(registry, before);
});

test("cancelling registration after staged creation discards the handoff without creating empty households", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  const drafts = createRegistrationDraftStore();
  const key = registrationPath("/rhu");
  drafts.write(key, snapshot());
  drafts.stageHousehold(key, registry, candidate());
  drafts.discard(key);
  assert.equal(drafts.read(key), null);
  assert.deepEqual(registry, before);
});

test("duplicate serial or missing relationship keeps the previous draft and saved collections intact", () => {
  const registry = createMockRegistry();
  const drafts = createRegistrationDraftStore();
  const key = registrationPath("/bhc");
  drafts.write(key, snapshot());
  const before = drafts.read(key);
  const duplicate = candidate();
  duplicate.household.serialNumber = " fsn-001 ";
  assert.throws(() => drafts.stageHousehold(key, registry, duplicate));
  assert.deepEqual(drafts.read(key), before);
  assert.throws(() => drafts.stageHousehold(key, registry, { ...candidate("mock-patient-7"), relationship: "" }));
  assert.deepEqual(drafts.read(key), before);
  assert.equal(registry.households.length, seed.households.length);
});

test("returning from creation during Edit Patient preserves the saved connection until Save Patient", () => {
  const registry = createMockRegistry();
  const saved = registry.patients[2];
  const before = structuredClone(saved);
  const drafts = createRegistrationDraftStore();
  const key = registrationPath("/bhc", saved.id);
  drafts.write(key, snapshot({ form: saved, patientId: saved.id, householdConnection: connectionForPatient(saved) }));
  drafts.stageHousehold(key, registry, candidate("mock-patient-7"));
  assert.equal(drafts.read(key).form.familySerialNumber, "FSN-100");
  assert.deepEqual(saved, before);
  drafts.discard(key);
  assert.deepEqual(saved, before);
});

test("draft handoffs are isolated by role and edited patient, and callers cannot mutate stored snapshots", () => {
  const drafts = createRegistrationDraftStore();
  const original = snapshot();
  const key = registrationPath("/bhc");
  drafts.write(key, original);
  original.form = { ...form, firstName: "Changed externally" };
  const read = drafts.read(key);
  read.form.firstName = "Changed read";
  assert.equal(drafts.read(key).form.firstName, "Test");
  assert.equal(drafts.read(registrationPath("/rhu")), null);
  assert.equal(drafts.read(registrationPath("/bhc", "mock-patient-7")), null);
});

test("creation cannot confirm after its registration handoff has been discarded", () => {
  const drafts = createRegistrationDraftStore();
  assert.throws(() => drafts.stageHousehold(registrationPath("/bhc"), createMockRegistry(), candidate()));
});

test("a departing head's replacement is staged with the new household and only applied by Save Patient", () => {
  const registry = createMockRegistry();
  const saved = registry.patients[0];
  const before = structuredClone(registry);
  const drafts = createRegistrationDraftStore();
  const key = registrationPath("/bhc", saved.id);
  drafts.write(key, snapshot({ form: saved, patientId: saved.id, householdConnection: connectionForPatient(saved) }));
  const original = drafts.read(key);
  assert.throws(() => drafts.stageHousehold(key, registry, candidate()));
  assert.deepEqual(drafts.read(key), original);
  const replacement = { householdId: saved.householdId, headPatientId: "mock-patient-2", relationships: { "mock-patient-3": "Niece / Nephew" } };
  drafts.stageHousehold(key, registry, candidate(), replacement);
  const returned = drafts.read(key);
  assert.deepEqual(returned.headReplacement, replacement);
  assert.deepEqual(registry, before);
  const committed = commitMockPatient(registry, returned.form, returned.householdConnection, saved.id, () => "replacement-test", returned.headReplacement);
  assert.equal(committed.registry.households[0].headPatientId, "mock-patient-2");
  assert.equal(committed.registry.households.find(item => item.id === committed.patient.householdId).headPatientId, saved.id);
});

test("session cleanup clears every in-memory draft", () => {
  const drafts = createRegistrationDraftStore();
  drafts.write(registrationPath("/bhc"), snapshot());
  drafts.write(registrationPath("/rhu"), snapshot());
  drafts.clear();
  assert.equal(drafts.read(registrationPath("/bhc")), null);
  assert.equal(drafts.read(registrationPath("/rhu")), null);
});

test("household lookup finds FSN, head name, street, purok, barangay and municipality", () => {
  const registry = createMockRegistry();
  assert.equal(searchHouseholds(registry, "fsn-002")[0].id, "mock-household-2");
  assert.equal(searchHouseholds(registry, "Manuel Santos")[0].id, "mock-household-2");
  assert.equal(searchHouseholds(registry, " 48 RIZAL STREET ")[0].id, "mock-household-2");
  assert.equal(searchHouseholds(registry, "purok 3")[0].id, "mock-household-2");
  assert.equal(searchHouseholds(registry, "Bambang")[0].id, "mock-household-2");
  assert.equal(searchHouseholds(registry, "Bulakan").length, registry.households.length);
  assert.deepEqual(searchHouseholds(registry, "no such address"), []);
});
