import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFamilyGraph, sortMembers } from './familyGraph.js';
import { normalizeHousehold, householdPayload } from './householdData.js';

const member = (id, extra = {}) => ({ id, firstName: `P${id}`, lastName: 'Cruz', birthDate: '', ...extra });

test('a relationship-to-head label alone creates no edge', () => {
  const graph = buildFamilyGraph({ headPatientId: '1', members: [member('1'), member('2', { relationshipToHouseholdHead: 'Wife' }), member('3', { relationshipToHouseholdHead: 'Son' })], relationships: [] });
  assert.deepEqual(graph.edges, []);
  assert.equal(graph.members.length, 3);
});

test('edges come only from saved parent links and explicit spouse/sibling rows between members', () => {
  const graph = buildFamilyGraph({
    headPatientId: '1',
    members: [member('1'), member('2'), member('3', { motherPatientId: '2', fatherPatientId: '1' }), member('4', { motherPatientId: '99' })],
    relationships: [{ id: '5', patientId: '1', relativeId: '2', type: 'spouse' }, { id: '6', patientId: '2', relativeId: '99', type: 'sibling' }, { id: '7', patientId: '3', relativeId: '4', type: 'parent' }, { id: '8', patientId: '3', relativeId: '3', type: 'sibling' }],
  });
  assert.deepEqual(graph.edges.map((edge) => `${edge.type}:${edge.from}>${edge.to}`).sort(), ['parent:1>3', 'parent:2>3', 'spouse:1>2']);
  assert.equal(graph.edges.find((edge) => edge.type === 'spouse').id, '5');
});

test('members are ordered head first, then by birth date with missing dates last, then name', () => {
  const ordered = sortMembers([member('3', { birthDate: '2010-01-01' }), member('2', { birthDate: '' }), member('4', { birthDate: '1980-05-05' }), member('1', { birthDate: '2001-01-01' })], '1');
  assert.deepEqual(ordered.map((item) => item.id), ['1', '4', '3', '2']);
});

test('an empty or missing household produces an empty graph', () => {
  assert.deepEqual(buildFamilyGraph(undefined), { members: [], edges: [] });
  assert.deepEqual(buildFamilyGraph({ members: [member('1')] }).edges, []);
});

test('household responses normalize relationship rows and the registration payload carries a confirmed link', () => {
  const household = normalizeHousehold({ id: 7, head_patient_id: 1, members: [], relationships: [{ id: 5, patient_id: 1, relative_id: 2, type: 'spouse' }] });
  assert.deepEqual(household.relationships, [{ id: '5', patientId: '1', relativeId: '2', type: 'spouse' }]);
  assert.deepEqual(normalizeHousehold({ id: 7 }).relationships, []);
  const registry = { households: [{ id: '7', version: 3 }] };
  assert.deepEqual(householdPayload({ kind: 'existing', householdId: '7', relationship: 'Wife', relationshipLink: { type: 'spouse' } }, registry),
    { kind: 'existing', household_id: '7', relationship: 'Wife', version: 3, relationship_link: { type: 'spouse' } });
  assert.equal('relationship_link' in householdPayload({ kind: 'existing', householdId: '7', relationship: 'Wife' }, registry), false);
});
