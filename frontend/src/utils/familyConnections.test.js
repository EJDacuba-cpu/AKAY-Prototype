import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionRowsFor, candidateRelatives, describeConnection } from './familyConnections.js';

const member = (id, extra = {}) => ({ id, firstName: `P${id}`, lastName: 'Cruz', ...extra });
const household = {
  members: [member('1'), member('2'), member('3', { motherPatientId: '2' }), member('4'), member('5')],
  relationships: [{ id: 'a', patientId: '1', relativeId: '2', type: 'spouse' }, { id: 'b', patientId: '4', relativeId: '1', type: 'sibling' }],
};

test('connection rows are listed from the member side and only include explicit rows', () => {
  assert.deepEqual(connectionRowsFor(household, '1'), [{ id: 'a', relativeId: '2', type: 'spouse' }, { id: 'b', relativeId: '4', type: 'sibling' }]);
  assert.deepEqual(connectionRowsFor(household, '2'), [{ id: 'a', relativeId: '1', type: 'spouse' }]);
  assert.deepEqual(connectionRowsFor(household, '3'), []);
  assert.deepEqual(connectionRowsFor(undefined, '1'), []);
});

test('parent links are not editable rows and parents/children are not offered as spouse or sibling', () => {
  assert.deepEqual(candidateRelatives(household, '3').map((item) => item.id), ['1', '4', '5']);
  assert.deepEqual(candidateRelatives(household, '2').map((item) => item.id), ['4', '5']);
});

test('already linked members are excluded and a household of one has no candidates', () => {
  assert.deepEqual(candidateRelatives(household, '1').map((item) => item.id), ['3', '5']);
  assert.deepEqual(candidateRelatives({ members: [member('1')], relationships: [] }, '1'), []);
  assert.deepEqual(candidateRelatives(household, 'missing'), []);
});

test('descriptions name the relative', () => {
  assert.equal(describeConnection('spouse', 'Ana Cruz'), 'Spouse of Ana Cruz');
  assert.equal(describeConnection('sibling', 'Ben Cruz'), 'Sibling of Ben Cruz');
});
