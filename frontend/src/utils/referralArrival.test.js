import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalToReferral } from './referralArrival.js';

const ARRIVAL = {
  referral_id: 12,
  tracking_id: 'AKY-20261025-ABC123',
  status: 'Pending',
  referred_at: '2026-10-25T01:00:00.000Z',
  patient: {
    id: 44,
    full_name: 'Rosa Intake',
    birthdate: '1990-05-01',
    age: 36,
    sex: 'Female',
    address: '12 Rizal St, Pitpitan, Bulakan',
    contact_number: '09171234567',
  },
  sending_bhc: 'Pitpitan Health Center',
  receiving_rhu: 'Rural Health Unit Bulakan',
};

test('an arrival summary becomes the referral the scanner shows, flagged summary-only', () => {
  assert.deepEqual(arrivalToReferral(ARRIVAL), {
    id: '12',
    trackingId: 'AKY-20261025-ABC123',
    status: 'Pending',
    patientName: 'Rosa Intake',
    birthDate: '1990-05-01',
    age: 36,
    sex: 'Female',
    ageSex: '36 · F',
    address: '12 Rizal St, Pitpitan, Bulakan',
    contactNumber: '09171234567',
    referringHci: 'Pitpitan Health Center',
    destinationFacility: 'Rural Health Unit Bulakan',
    referralDateTime: '2026-10-25T01:00:00.000Z',
    summaryOnly: true,
  });
});

test('missing pieces stay empty instead of breaking the scanner', () => {
  const referral = arrivalToReferral({ referral_id: 3, tracking_id: 'AKY-X', status: 'Received' });
  assert.equal(referral.patientName, '');
  assert.equal(referral.ageSex, '');
  assert.equal(referral.summaryOnly, true);
  assert.equal(arrivalToReferral(null), null);
});
