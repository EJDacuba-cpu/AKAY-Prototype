import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearProfileOpen,
  endProfileOpen,
  getProfileOpenPatientId,
  resetProfileOpenGate,
  subscribeProfileOpen,
  tryBeginProfileOpen,
} from './patientProfileOpenGate.js';

test.beforeEach(() => {
  resetProfileOpenGate();
});

test('acquires a lock for one patient and blocks a second open', () => {
  const first = tryBeginProfileOpen(12);
  assert.equal(typeof first, 'number');
  assert.equal(getProfileOpenPatientId(), '12');
  assert.equal(tryBeginProfileOpen(99), null);
  assert.equal(getProfileOpenPatientId(), '12');
});

test('double-click on the same patient cannot start a second open', () => {
  assert.ok(tryBeginProfileOpen('7'));
  assert.equal(tryBeginProfileOpen('7'), null);
});

test('failed or cancelled open releases the lock so reopen works', () => {
  const token = tryBeginProfileOpen('3');
  assert.equal(endProfileOpen(token), true);
  assert.equal(getProfileOpenPatientId(), null);
  const next = tryBeginProfileOpen('3');
  assert.ok(next);
  assert.notEqual(next, token);
});

test('stale end token does not clear a newer open', () => {
  const stale = tryBeginProfileOpen('1');
  endProfileOpen(stale);
  const current = tryBeginProfileOpen('2');
  assert.equal(endProfileOpen(stale), false);
  assert.equal(getProfileOpenPatientId(), '2');
  assert.equal(endProfileOpen(current), true);
  assert.equal(getProfileOpenPatientId(), null);
});

test('clearProfileOpen releases after navigation or close', () => {
  tryBeginProfileOpen('44');
  assert.equal(clearProfileOpen(), true);
  assert.equal(getProfileOpenPatientId(), null);
  assert.ok(tryBeginProfileOpen('55'));
});

test('rapid selection notifies subscribers once per transition', () => {
  const seen = [];
  const stop = subscribeProfileOpen(() => seen.push(getProfileOpenPatientId()));
  const token = tryBeginProfileOpen(8);
  endProfileOpen(token);
  clearProfileOpen();
  stop();
  assert.deepEqual(seen, ['8', null]);
});

test('blank patient ids never acquire the lock', () => {
  assert.equal(tryBeginProfileOpen(''), null);
  assert.equal(tryBeginProfileOpen(null), null);
  assert.equal(getProfileOpenPatientId(), null);
});
