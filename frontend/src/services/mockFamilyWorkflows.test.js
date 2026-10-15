import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockRegistry, commitMockPatient, HEAD_RELATIONSHIP } from "./mockFamilyRegistry.js";
import { commitFamily, commitFamilyMember, commitNewFamily, newFamilyHeadStatus, commitRelatedLink, commitRemoveRelatedLink, relatedConnections, familyConnections, graphErrors, connectionRows } from "./mockFamilyWorkflows.js";
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

test("moving a member keeps their connections as cross-household links", () => {
  const registry = createMockRegistry();
  const patient = registry.patients.find(item => item.id === "mock-patient-miguel");
  const unchanged = commitMockPatient(registry, patient, { kind: "existing", householdId: patient.householdId, relationship: patient.relationshipToHouseholdHead }, patient.id).registry;
  assert.deepEqual(unchanged.connections, registry.connections);
  const moved = commitMockPatient(registry, patient, { kind: "existing", householdId: "mock-household-2", relationship: "Other relative" }, patient.id).registry;
  for (const edge of registry.connections.filter(item => [item.from, item.to].includes(patient.id))) assert.ok(moved.connections.some(item => item.from === edge.from && item.to === edge.to && item.type === edge.type));
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

test("Add Family moves an adult member out as head and keeps their links", () => {
  const registry = createMockRegistry();
  const draft = { serialNumber: "FSN-2026-0001", address: { streetAddress: "3 New St", purokArea: "Purok 9", barangay: "Perez", municipality: "Bulakan" }, headPatientId: "mock-patient-miguel" };
  const { registry: next, householdId } = commitNewFamily(registry, draft, () => "x");
  const miguel = next.patients.find(p => p.id === "mock-patient-miguel");
  assert.equal(miguel.householdId, householdId);
  assert.equal(miguel.relationshipToHouseholdHead, HEAD_RELATIONSHIP);
  assert.equal(miguel.streetAddress, "3 New St");
  assert.ok(next.connections.some(edge => edge.from === "mock-patient-roberto" && edge.to === "mock-patient-miguel"));
});

test("Add Family blocks a head of a multi-member household and a minor", () => {
  const registry = createMockRegistry();
  const base = { serialNumber: "FSN-2026-0001", address: { ...registry.households[0].address } };
  assert.throws(() => commitNewFamily(registry, { ...base, headPatientId: "mock-patient-roberto" }), e => e.errors.headPatientId === "Assign a new head for FSN-00208 first.");
  assert.throws(() => commitNewFamily(registry, { ...base, headPatientId: "mock-patient-lucas" }), e => e.errors.headPatientId === "Under 18");
  assert.equal(newFamilyHeadStatus(registry, registry.patients.find(p => p.id === "mock-patient-miguel")).notice, "Currently in FSN-00208 (Son / Daughter). They will move to this new household.");
});

test("Add Family from a single-person household archives the old one", () => {
  const registry = createMockRegistry();
  const { registry: next } = commitNewFamily(registry, { serialNumber: "FSN-2026-0001", address: { ...registry.households[0].address }, headPatientId: "mock-patient-6" }, () => "y");
  assert.ok(next.households.find(h => h.id === "mock-household-3").archivedAt);
});

test("Add Family rejects a head who disappeared after the draft was made", () => {
  const registry = createMockRegistry();
  registry.patients = registry.patients.filter(p => p.id !== "mock-patient-7");
  assert.throws(() => commitNewFamily(registry, { serialNumber: "FSN-2026-0001", address: { ...registry.households[0].address }, headPatientId: "mock-patient-7" }), e => e.errors.headPatientId === "This patient or household is no longer available. Search again.");
});

test("saving member connections keeps links to other households", () => {
  const registry = createMockRegistry();
  registry.connections.push({ from: "mock-patient-roberto", to: "mock-patient-4", type: "sibling" });
  const sofia = registry.patients.find(p => p.id === "mock-patient-sofia");
  const next = commitFamilyMember(registry, "mock-household-cruz", { patientId: sofia.id, relationship: sofia.relationshipToHouseholdHead, connections: connectionRows(registry, "mock-household-cruz", sofia.id) });
  assert.ok(next.connections.some(edge => edge.from === "mock-patient-roberto" && edge.to === "mock-patient-4"));
});

test("child-of creates a reversed parent edge visible from both families", () => {
  const registry = createMockRegistry();
  const next = commitRelatedLink(registry, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "child-of" });
  assert.ok(next.connections.some(e => e.from === "mock-patient-6" && e.to === "mock-patient-4" && e.type === "parent"));
  assert.equal(relatedConnections(next, "mock-household-2")[0].label, "child of");
  assert.equal(relatedConnections(next, "mock-household-3")[0].label, "parent of");
});

test("related link rejects same-household, archived, duplicate and cyclic targets", () => {
  const registry = createMockRegistry();
  assert.throws(() => commitRelatedLink(registry, "mock-household-cruz", { memberId: "mock-patient-miguel", relativeId: "mock-patient-sofia", type: "sibling" }), e => Boolean(e.errors.relativeId));
  const linked = commitRelatedLink(registry, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "child-of" });
  assert.throws(() => commitRelatedLink(linked, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "sibling" }), e => Boolean(e.errors.form));
  assert.throws(() => commitRelatedLink(linked, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "parent-of" }), e => Boolean(e.errors.form));
  linked.households = linked.households.map(h => h.id === "mock-household-3" ? { ...h, archivedAt: "2026-10-15T00:00:00.000Z" } : h);
  assert.throws(() => commitRelatedLink(linked, "mock-household-2", { memberId: "mock-patient-5", relativeId: "mock-patient-6", type: "relative" }), e => Boolean(e.errors.relativeId));
});

test("removing a related link deletes only that edge; stale keys fail cleanly", () => {
  const registry = createMockRegistry();
  const linked = commitRelatedLink(registry, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "relative" });
  const [row] = relatedConnections(linked, "mock-household-2");
  const removed = commitRemoveRelatedLink(linked, row.key);
  assert.equal(removed.connections.length, registry.connections.length);
  assert.throws(() => commitRemoveRelatedLink(removed, row.key), e => e.errors.form === "This link no longer exists.");
});
