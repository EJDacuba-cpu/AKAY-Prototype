import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockRegistry, commitMockPatient } from "./mockFamilyRegistry.js";
import { commitFamily, commitFamilyMember, familyConnections, graphErrors, connectionRows } from "./mockFamilyWorkflows.js";
import { layoutFamilyTree } from "../utils/familyTree.js";

const draft = (registry, overrides = {}) => ({ serialNumber: "FSN-NEW", address: { ...registry.households[0].address }, headPatientId: "mock-patient-7", ...overrides });

test("new household needs complete details, a unique normalized FSN, and an unlinked registered head", () => {
  const registry = createMockRegistry();
  const before = structuredClone(registry);
  for (const invalid of [{ serialNumber: " fsn-001 " }, { address: {} }, { headPatientId: "" }, { headPatientId: "mock-patient-1" }]) {
    assert.throws(() => commitFamily(registry, draft(registry, invalid)), error => Boolean(error.errors));
    assert.deepEqual(registry, before);
  }
  const saved = commitFamily(registry, draft(registry), undefined, () => "new");
  assert.equal(saved.households.length, registry.households.length + 1);
  assert.equal(saved.patients.find(patient => patient.id === "mock-patient-7").householdId, "mock-household-new");
  assert.deepEqual(registry, before);
});

test("address/FSN corrections update every member in the same household only", () => {
  const registry = createMockRegistry();
  const household = registry.households[0];
  const saved = commitFamily(registry, { ...household, serialNumber: "FSN-CORRECTED", address: { ...household.address, streetAddress: "12 Mabini St." } }, household.id);
  for (const member of saved.patients.filter(patient => patient.householdId === household.id)) {
    assert.equal(member.streetAddress, "12 Mabini St.");
    assert.equal(member.familySerialNumber, "FSN-CORRECTED");
  }
  assert.deepEqual(saved.patients.filter(patient => patient.householdId !== household.id), registry.patients.filter(patient => patient.householdId !== household.id));
  assert.equal(saved.households.length, registry.households.length);
});

test("changing the head requires every remaining member's new head relationship", () => {
  const registry = createMockRegistry(), household = registry.households[0];
  assert.throws(() => commitFamily(registry, { ...household, headPatientId: "mock-patient-2" }, household.id), error => Boolean(error.errors["mock-patient-1"] && error.errors["mock-patient-3"]));
  const saved = commitFamily(registry, { ...household, headPatientId: "mock-patient-2", relationships: { "mock-patient-1": "Spouse / Partner", "mock-patient-3": "Niece / Nephew" } }, household.id);
  assert.equal(saved.patients.find(patient => patient.id === "mock-patient-2").relationshipToHouseholdHead, "Household head");
  assert.deepEqual(saved.connections, registry.connections);
});

test("adding a member is atomic and requires a head relationship and an explicit connection", () => {
  const registry = createMockRegistry(), before = structuredClone(registry);
  const member = { patientId: "mock-patient-7", relationship: "Son / Daughter", connections: [{ relativeId: "mock-patient-1", type: "child" }] };
  for (const bad of [{ relationship: "" }, { connections: [] }, { connections: [{ relativeId: "mock-patient-4", type: "child" }] }, { patientId: "mock-patient-5" }]) {
    assert.throws(() => commitFamilyMember(registry, "mock-household-1", { ...member, ...bad }));
    assert.deepEqual(registry, before);
  }
  const saved = commitFamilyMember(registry, "mock-household-1", member);
  const patient = saved.patients.find(item => item.id === member.patientId);
  assert.equal(patient.familySerialNumber, "FSN-001");
  assert.equal(patient.streetAddress, "12 Mabini Street");
  assert.ok(familyConnections(saved, "mock-household-1").some(edge => edge.from === "mock-patient-1" && edge.to === member.patientId && edge.type === "parent"));
  assert.equal(saved.patients.length, registry.patients.length);
});

test("graph rejects self links, duplicate reversed spouses, ancestry cycles and conflicting pairs", () => {
  const members = ["a", "b", "c"].map(id => ({ id }));
  const parent = (from, to) => ({ from, to, type: "parent" });
  assert.ok(graphErrors(members, [parent("a", "a")]));
  assert.ok(graphErrors(members, [parent("a", "b"), parent("b", "c"), parent("c", "a")]));
  assert.ok(graphErrors(members, [{ from: "a", to: "b", type: "spouse" }, { from: "b", to: "a", type: "spouse" }]));
  assert.ok(graphErrors(members, [parent("a", "b"), { from: "a", to: "b", type: "spouse" }]));
});

test("registration saves preserve other family graphs and moving clears only departed links", () => {
  const registry = createMockRegistry();
  const patient = registry.patients.find(item => item.id === "mock-patient-miguel");
  const unchanged = commitMockPatient(registry, patient, { kind: "existing", householdId: patient.householdId, relationship: patient.relationshipToHouseholdHead }, patient.id).registry;
  assert.deepEqual(unchanged.connections, registry.connections);
  const moved = commitMockPatient(registry, patient, { kind: "existing", householdId: "mock-household-2", relationship: "Other relative" }, patient.id).registry;
  assert.ok(!moved.connections.some(edge => [edge.from, edge.to].includes(patient.id)));
  assert.equal(moved.patients.find(item => item.id === patient.id).streetAddress, "48 Rizal Street");
});

test("explicit registration parents appear in graph; neither surnames nor civil status infer edges", () => {
  const registry = createMockRegistry();
  assert.ok(!familyConnections(registry, "mock-household-1").some(edge => edge.to === "mock-patient-3"));
  const parent = registry.patients.find(patient => patient.id === "mock-patient-roberto");
  const child = registry.patients.find(patient => patient.id === "mock-patient-sofia");
  registry.connections = [];
  child.fatherPatientId = parent.id;
  assert.deepEqual(familyConnections(registry, "mock-household-cruz"), [{ from: parent.id, to: child.id, type: "parent" }]);
  assert.deepEqual(connectionRows(registry, "mock-household-cruz", child.id), [{ relativeId: parent.id, type: "child" }]);
});

test("tree lays out spouses together and children below parents without overlapping cards", () => {
  const registry = createMockRegistry();
  const members = registry.patients.filter(patient => patient.householdId === "mock-household-cruz");
  const edges = familyConnections(registry, "mock-household-cruz");
  const layout = layoutFamilyTree(members, edges, "mock-patient-roberto");
  const node = id => layout.nodes.find(item => item.id === id);
  for (const edge of edges) assert.ok(edge.type === "spouse" ? node(edge.from).y === node(edge.to).y : node(edge.from).y < node(edge.to).y);
  for (const a of layout.nodes) for (const b of layout.nodes) if (a.id !== b.id) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
});
