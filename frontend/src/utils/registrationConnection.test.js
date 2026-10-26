import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationLinkEligibility, registrationConnection } from './relationshipLink.js';
import { householdPayload, registrationErrors } from './householdData.js';

const head = { id: '1', firstName: 'Head', sex: 'Male', status: 'active' };
const patient = { firstName: 'New', sex: 'Female' };

test('spouse and sibling confirmations reuse their existing link types', () => {
  assert.equal(registrationLinkEligibility('Wife', patient, head, '', false).offer.type, 'spouse');
  assert.equal(registrationLinkEligibility('Sister', patient, head, '', false).offer.type, 'sibling');
});

test('Son/Daughter requires an explicit correct parent role and preserves label-only fallback', () => {
  assert.match(registrationLinkEligibility('Daughter', patient, head, '', false).reason, /Mother or Father/);
  assert.match(registrationLinkEligibility('Daughter', patient, head, 'mother', false).reason, /registered sex/);
  assert.equal(registrationLinkEligibility('Daughter', patient, head, 'father', false).reason, '');
});

test('reverse parent confirmation requires management and an empty saved parent slot', () => {
  assert.match(registrationLinkEligibility('Mother', patient, head, '', false).reason, /permission/);
  assert.equal(registrationLinkEligibility('Mother', patient, head, '', true).offer.type, 'mother');
  assert.match(registrationLinkEligibility('Mother', patient, { ...head, motherPatientId: '9' }, '', true).reason, /already linked/);
  assert.match(registrationLinkEligibility('Father', patient, head, '', true).reason, /registered sex/);
});

test('unsupported and inactive connections cannot be confirmed', () => {
  for (const label of ['Nephew', 'Niece', 'Aunt', 'Uncle', 'Grandfather', 'Granddaughter', 'Partner']) {
    assert.equal(registrationLinkEligibility(label, patient, head, '', true).offer, null);
  }
  assert.match(registrationLinkEligibility('Wife', patient, { ...head, status: 'inactive' }, '', true).reason, /inactive/);
});

test('label-only removes any stale confirmation and serialization carries only the head-relative command', () => {
  const original = { kind: 'existing', householdId: '7', relationship: 'Daughter', relationshipLink: { type: 'spouse' } };
  assert.deepEqual(registrationConnection(original), { kind: 'existing', householdId: '7', relationship: 'Daughter' });
  const confirmed = registrationConnection(original, 'father');
  assert.deepEqual(householdPayload(confirmed, { households: [{ id: '7', version: 4 }] }), {
    kind: 'existing', household_id: '7', relationship: 'Daughter', version: 4, relationship_link: { type: 'father' },
  });
  assert.equal(original.relationshipLink.type, 'spouse');
});

test('nested registration confirmation errors stay beside the relationship controls', () => {
  assert.deepEqual(registrationErrors({ errors: { 'household.relationship_link.type': ['Invalid role'] } }), { relationshipToHouseholdHead: 'Invalid role' });
});
