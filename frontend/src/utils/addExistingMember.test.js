import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMemberBlockReason,
  currentHouseholdLabel,
  destinationVersionUnchanged,
  sourceMembershipUnchanged,
} from './addExistingMember.js';

test('blocks patient already in destination household', () => {
  const reason = addMemberBlockReason(
    { id: '7', householdId: '9' },
    { id: '9' },
  );
  assert.match(reason, /already/i);
});

test('allows unlinked patient', () => {
  assert.equal(addMemberBlockReason({ id: '7', householdId: '' }, { id: '9' }), '');
});

test('requires head replacement when leaving as multi-member head', () => {
  const reason = addMemberBlockReason(
    {
      id: '1',
      householdId: '3',
      household: { head_patient_id: '1', members_count: 3 },
    },
    { id: '9' },
  );
  assert.match(reason, /Assign a new head/i);
});

test('source membership and destination version guards', () => {
  assert.equal(
    sourceMembershipUnchanged(
      { id: '7', householdId: '3', familySerialNumber: 'FSN-1' },
      { id: '7', householdId: '3', familySerialNumber: 'FSN-1' },
    ),
    true,
  );
  assert.equal(
    sourceMembershipUnchanged(
      { id: '7', householdId: '3' },
      { id: '7', householdId: '4' },
    ),
    false,
  );
  assert.equal(
    destinationVersionUnchanged({ id: '9', version: 2 }, { id: '9', version: 2 }),
    true,
  );
  assert.equal(
    destinationVersionUnchanged({ id: '9', version: 2 }, { id: '9', version: 3 }),
    false,
  );
});

test('current household label', () => {
  assert.equal(currentHouseholdLabel({ familySerialNumber: 'FSN-2026-0001' }), 'FSN-2026-0001');
  assert.equal(currentHouseholdLabel({}), 'No household assigned');
});
