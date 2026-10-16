import test from 'node:test';
import assert from 'node:assert/strict';
import { HEAD_TRANSFER_MESSAGE, destinationCandidates, transferBlockedReason } from './householdTransfer.js';

test('the household head cannot be transferred, other members can', () => {
  const household = { id: '1', headPatientId: '10' };
  assert.equal(transferBlockedReason(household, { id: '10' }), HEAD_TRANSFER_MESSAGE);
  assert.equal(transferBlockedReason(household, { id: '11' }), '');
  assert.equal(transferBlockedReason(undefined, { id: '11' }), '');
});

test('destinations exclude the current household, archived households, and households without a head', () => {
  const results = [
    { id: '1', headPatientId: '10' },
    { id: '2', headPatientId: '20' },
    { id: '3', headPatientId: '', },
    { id: '4', headPatientId: '40', archivedAt: '2026-10-01T00:00:00Z' },
    { id: '5', headPatientId: '50', archivedAt: null },
  ];
  assert.deepEqual(destinationCandidates(results, '1').map((item) => item.id), ['2', '5']);
  assert.deepEqual(destinationCandidates([], '1'), []);
  assert.deepEqual(destinationCandidates(undefined, '1'), []);
});
