import test from "node:test";
import assert from "node:assert/strict";
import {
  ADDRESS_FIELDS, HEAD_RELATIONSHIP, addressValues, commitMockPatient,
  connectionForPatient, createMockRegistry, searchHouseholds, stageConnection,
  validateConnection,
  headDeparture, validateHeadReplacement,
  MINOR_HEAD_MESSAGE, MISSING_BIRTH_DATE_MESSAGE, NO_HOUSEHOLD_MESSAGE,
  canHeadHousehold, nextSerialNumber, withFormAddress,
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
  const legacy = registry.patients.find((item) => item.id === "mock-patient-7");
  const updated = commitMockPatient(registry, legacy, existing(), legacy.id, id);
  assert.equal(updated.registry.patients.length, registry.patients.length);
  assert.equal(updated.patient.id, legacy.id);
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
  const moveTo = existing("mock-household-2", "Sibling");
  assert.equal(headDeparture(registry, saved.id, moveTo).members.length, 2);
  assert.throws(() => commitMockPatient(registry, saved, moveTo, saved.id, id));
  assert.deepEqual(registry, before);
  const replacement = { householdId: "mock-household-1", headPatientId: "mock-patient-2", relationships: { "mock-patient-3": "Niece / Nephew" } };
  assert.deepEqual(validateHeadReplacement(registry, saved.id, moveTo, replacement), {});
  const result = commitMockPatient(registry, saved, moveTo, saved.id, id, replacement);
  assert.equal(result.registry.households[0].headPatientId, "mock-patient-2");
  assert.equal(result.registry.patients.find((item) => item.id === "mock-patient-2").relationshipToHouseholdHead, HEAD_RELATIONSHIP);
  assert.equal(result.registry.patients.find((item) => item.id === "mock-patient-3").relationshipToHouseholdHead, "Niece / Nephew");
  assert.equal(result.patient.householdId, "mock-household-2");
  assert.deepEqual(addressValues(result.patient), registry.households[1].address);
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

test("failed patient validation does not create even a valid staged household", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  assert.throws(() => commitMockPatient(registry, { ...patient, firstName: "" }, newHousehold(), undefined, id));
  assert.deepEqual(registry, before);
});

test("nextSerialNumber counts same-year FSN-YYYY-NNNN serials only, archived included", () => {
  const registry = createMockRegistry();
  assert.equal(nextSerialNumber(registry, new Date(2026, 9, 15)), "FSN-2026-0001");
  registry.households.push({ id: "h-a", serialNumber: "FSN-2026-0007", archivedAt: "2026-10-01T00:00:00.000Z", headPatientId: null, address: {} });
  registry.households.push({ id: "h-b", serialNumber: "fsn-2025-0099", headPatientId: null, address: {} });
  assert.equal(nextSerialNumber(registry, new Date(2026, 9, 15)), "FSN-2026-0008");
  assert.equal(nextSerialNumber(registry, new Date(2025, 2, 1)), "FSN-2025-0100");
});

test("canHeadHousehold requires a birth date and age 18+", () => {
  const today = new Date(2026, 9, 15);
  assert.deepEqual(canHeadHousehold({ birthDate: "" }, today), { ok: false, code: "missing-birth-date", reason: MISSING_BIRTH_DATE_MESSAGE });
  assert.deepEqual(canHeadHousehold({ birthDate: "2008-10-16" }, today), { ok: false, code: "minor", reason: MINOR_HEAD_MESSAGE });
  assert.deepEqual(canHeadHousehold({ birthDate: "2008-10-15" }, today), { ok: true });
});

test("saving without a household is rejected and leaves the registry untouched", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  assert.deepEqual(validateConnection(registry, null, undefined, patient), { household: NO_HOUSEHOLD_MESSAGE });
  assert.throws(() => commitMockPatient(registry, patient, null, undefined, id), (error) => error.errors.household === NO_HOUSEHOLD_MESSAGE);
  assert.deepEqual(registry, before);
});

test("a minor cannot head a new self household, including after a later DOB change", () => {
  const registry = createMockRegistry();
  const minor = { ...patient, birthDate: "2015-01-01" };
  assert.equal(validateConnection(registry, newHousehold(), undefined, minor).headPatientId, MINOR_HEAD_MESSAGE);
  assert.throws(() => commitMockPatient(registry, minor, newHousehold(), undefined, id));
});

test("withFormAddress copies the form address into a new self household only", () => {
  const form = { ...patient, streetAddress: "1 Late Edit Street" };
  assert.equal(withFormAddress(newHousehold(), form).household.address.streetAddress, "1 Late Edit Street");
  const joined = existing();
  assert.equal(withFormAddress(joined, form), joined);
});

test("staging a new self household keeps the typed address", () => {
  const registry = createMockRegistry();
  const staged = stageConnection(patient, registry, { ...newHousehold(), household: { serialNumber: "FSN-2026-0001", address: {} } });
  assert.equal(staged.streetAddress, patient.streetAddress);
  assert.equal(staged.familySerialNumber, "FSN-2026-0001");
});

test("moving the last member out archives the old household; search hides it; its FSN stays taken", () => {
  const registry = createMockRegistry();
  const carmen = registry.patients.find((item) => item.id === "mock-patient-6");
  const result = commitMockPatient(registry, carmen, existing("mock-household-1", "Other relative"), carmen.id, id);
  const old = result.registry.households.find((item) => item.id === "mock-household-3");
  assert.ok(old.archivedAt);
  assert.equal(old.headPatientId, null);
  assert.ok(!searchHouseholds(result.registry, "FSN-003").length);
  const reuse = { ...newHousehold(), household: { serialNumber: "fsn-003 ", address: addressValues(patient) } };
  assert.equal(validateConnection(result.registry, reuse, undefined, patient).serialNumber, "This Family Serial Number already exists.");
});

test("a moved child's registration parent ID becomes one explicit parent edge", () => {
  const registry = createMockRegistry();
  const lucas = { ...registry.patients.find((item) => item.id === "mock-patient-lucas"), motherPatientId: "mock-patient-ana" };
  registry.connections = registry.connections.filter((edge) => !(edge.from === "mock-patient-ana" && edge.to === lucas.id));
  const moved = commitMockPatient(registry, lucas, existing("mock-household-2", "Grandchild"), lucas.id, id).registry;
  assert.equal(moved.patients.find((item) => item.id === lucas.id).motherPatientId, "");
  assert.equal(moved.connections.filter((edge) => edge.type === "parent" && edge.from === "mock-patient-ana" && edge.to === lucas.id).length, 1);
});

test("Change Household keeps a saved parent link as one explicit edge even after staging clears the form IDs", () => {
  const registry = createMockRegistry();
  registry.patients = registry.patients.map((item) => item.id === "mock-patient-lucas" ? { ...item, motherPatientId: "mock-patient-ana" } : item);
  registry.connections = registry.connections.filter((edge) => !(edge.from === "mock-patient-ana" && edge.to === "mock-patient-lucas"));
  const saved = registry.patients.find((item) => item.id === "mock-patient-lucas");
  const draft = stageConnection(saved, registry, existing("mock-household-2", "Grandchild"));
  assert.equal(draft.motherPatientId, "");
  const moved = commitMockPatient(registry, draft, existing("mock-household-2", "Grandchild"), saved.id, id).registry;
  assert.equal(moved.connections.filter((edge) => edge.type === "parent" && edge.from === "mock-patient-ana" && edge.to === saved.id).length, 1);
  assert.equal(moved.patients.find((item) => item.id === saved.id).motherPatientId, "");
});

test("unlinking a parent without changing household drops the registration link and creates no edge", () => {
  const registry = createMockRegistry();
  registry.patients = registry.patients.map((item) => item.id === "mock-patient-lucas" ? { ...item, motherPatientId: "mock-patient-ana" } : item);
  registry.connections = registry.connections.filter((edge) => !(edge.from === "mock-patient-ana" && edge.to === "mock-patient-lucas"));
  const saved = registry.patients.find((item) => item.id === "mock-patient-lucas");
  const unlinked = commitMockPatient(registry, { ...saved, motherPatientId: "" }, connectionForPatient(saved), saved.id, id).registry;
  assert.ok(!unlinked.connections.some((edge) => edge.from === "mock-patient-ana" && edge.to === saved.id));
});
