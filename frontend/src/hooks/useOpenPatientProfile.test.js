import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearProfileOpen,
  endProfileOpen,
  getProfileOpenPatientId,
  resetProfileOpenGate,
  tryBeginProfileOpen,
} from '../utils/patientProfileOpenGate.js';

/**
 * Hook-level scenarios exercised against the shared gate the hook owns.
 * Keeps React Router out of the unit surface while covering double-click,
 * rapid selection, failure release, and reopen.
 */

test.beforeEach(() => {
  resetProfileOpenGate();
});

test('directory double-click: second open while busy is ignored', () => {
  const first = tryBeginProfileOpen('101');
  assert.ok(first);
  assert.equal(tryBeginProfileOpen('101'), null);
  assert.equal(getProfileOpenPatientId(), '101');
});

test('rapid selection across patients keeps the first open only', () => {
  assert.ok(tryBeginProfileOpen('201'));
  assert.equal(tryBeginProfileOpen('202'), null);
  assert.equal(tryBeginProfileOpen('203'), null);
  assert.equal(getProfileOpenPatientId(), '201');
});

test('failed request releases the gate for retry', () => {
  const token = tryBeginProfileOpen('301');
  // Simulate prefetch failure cleanup in the hook.
  endProfileOpen(token);
  assert.equal(getProfileOpenPatientId(), null);
  assert.ok(tryBeginProfileOpen('301'));
});

test('closing / navigation clears the gate so another profile can open', () => {
  tryBeginProfileOpen('401');
  clearProfileOpen();
  assert.equal(getProfileOpenPatientId(), null);
  assert.ok(tryBeginProfileOpen('402'));
});

test('reopening after close uses a fresh generation', () => {
  const first = tryBeginProfileOpen('501');
  clearProfileOpen();
  const second = tryBeginProfileOpen('501');
  assert.ok(second);
  assert.notEqual(second, first);
  assert.equal(endProfileOpen(first), false);
  assert.equal(getProfileOpenPatientId(), '501');
});
