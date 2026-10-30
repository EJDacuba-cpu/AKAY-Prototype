import test from 'node:test';
import assert from 'node:assert/strict';
import { changeHouseholdPayload } from './changeHousehold.js';

const registry = { households: [{ id: '7', version: 3 }, { id: '9', version: 5 }] };

test('the request carries only the household command', () => {
  const body = changeHouseholdPayload({ kind: 'existing', householdId: '9', relationship: 'Sister' }, registry, null);
  assert.deepEqual(body, { household: { kind: 'existing', household_id: '9', relationship: 'Sister', version: 5 } });
  for (const key of ['first_name', 'last_name', 'birthdate', 'street_address', 'family_serial_number']) assert.equal(key in body, false);
});

test('a confirmed spouse/sibling link and a head replacement are carried through', () => {
  const body = changeHouseholdPayload({ kind: 'existing', householdId: '9', relationship: 'Wife', relationshipLink: { type: 'spouse' } }, registry,
    { householdId: '7', headPatientId: '4', relationships: { 5: 'Son' } });
  assert.deepEqual(body.household.relationship_link, { type: 'spouse' });
  assert.deepEqual(body.head_replacement, { household_id: '7', head_patient_id: '4', relationships: { 5: 'Son' }, version: 3 });
});
