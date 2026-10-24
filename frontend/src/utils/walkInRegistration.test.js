import test from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicatePrompt,
  isCheckInFlow,
  newCheckInKey,
  newWalkIn,
  postSaveDestination,
  withCheckIn,
} from './walkInRegistration.js';

test('only ?check_in=1 marks the walk-in flow', () => {
  assert.equal(isCheckInFlow('?check_in=1'), true);
  assert.equal(isCheckInFlow('?household=4&check_in=1'), true);
  assert.equal(isCheckInFlow('?check_in=0'), false);
  assert.equal(isCheckInFlow('?household=4'), false);
  assert.equal(isCheckInFlow(''), false);
  assert.equal(isCheckInFlow(undefined), false);
});

test('a check-in key comes from the injected id source', () => {
  assert.equal(newCheckInKey(() => 'abc-123'), 'abc-123');
  assert.notEqual(newCheckInKey(), newCheckInKey());
});

test('withCheckIn adds the key and only sends the duplicate confirmation when true', () => {
  const payload = { first_name: 'Ana' };
  assert.deepEqual(withCheckIn(payload, { key: 'k1' }), { first_name: 'Ana', check_in: { key: 'k1' } });
  assert.deepEqual(withCheckIn(payload, { key: 'k1', confirmDuplicate: false }), { first_name: 'Ana', check_in: { key: 'k1' } });
  assert.deepEqual(
    withCheckIn(payload, { key: 'k1', confirmDuplicate: true }),
    { first_name: 'Ana', check_in: { key: 'k1' }, confirm_possible_duplicate: true },
  );
  assert.deepEqual(payload, { first_name: 'Ana' });
});

test('a possible-duplicate 409 becomes a prompt with display-ready matches', () => {
  const error = {
    status: 409,
    code: 'POSSIBLE_DUPLICATE_PATIENT',
    payload: { matches: [{ id: 7, full_name: 'Ana Cruz', birthdate: '1990-01-01', active_visit_id: 3 }, { id: 8, full_name: 'Ana B. Cruz', birthdate: null, active_visit_id: null }] },
  };
  assert.deepEqual(duplicatePrompt(error), {
    matches: [
      { id: 7, fullName: 'Ana Cruz', birthdate: '1990-01-01', activeVisitId: 3 },
      { id: 8, fullName: 'Ana B. Cruz', birthdate: null, activeVisitId: null },
    ],
  });
});

test('other errors are not duplicate prompts', () => {
  assert.equal(duplicatePrompt(null), null);
  assert.equal(duplicatePrompt({ status: 422, code: 'POSSIBLE_DUPLICATE_PATIENT', payload: { matches: [] } }), null);
  assert.equal(duplicatePrompt({ status: 409, code: 'VISIT_CHECK_IN_KEY_CONFLICT', payload: {} }), null);
  assert.equal(duplicatePrompt({ status: 409, code: 'POSSIBLE_DUPLICATE_PATIENT' }), null);
});

test('after saving, the walk-in flow returns to the patients list and others open the profile', () => {
  assert.equal(postSaveDestination({ checkIn: true, patientsPath: '/rhu/patients', patientId: '9' }), '/rhu/patients');
  assert.equal(postSaveDestination({ checkIn: false, patientsPath: '/rhu/patients', patientId: '9' }), '/rhu/patients/9');
});

test('each walk-in registration gets its own key, so Register Another never reuses one', () => {
  let counter = 0;
  const makeId = () => `id-${++counter}`;
  const first = newWalkIn(makeId);
  const second = newWalkIn(makeId);
  assert.deepEqual(first, { key: 'id-1' });
  assert.deepEqual(second, { key: 'id-2' });
});

test('the default key source still works where randomUUID is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (bytes) => bytes.fill(7) }, configurable: true });
  try {
    const key = newCheckInKey();
    assert.match(key, /^[0-9a-f-]{20,}$/);
  } finally {
    Object.defineProperty(globalThis, 'crypto', original);
  }
});
