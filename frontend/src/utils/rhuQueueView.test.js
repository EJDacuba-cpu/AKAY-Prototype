import test from 'node:test';
import assert from 'node:assert/strict';
import { filterQueueRows, formatAgeSex, formatWaiting, isSearchable, queueRowActions, queueRows, statusChip, walkInKeyFor } from './rhuQueueView.js';

// 9:30 AM on Oct 25, 2026 in Manila.
const NOW = new Date('2026-10-25T01:30:00Z');

function visit(overrides = {}) {
  return {
    id: 1,
    source: 'walk_in',
    status: 'waiting',
    checked_in_at: '2026-10-25T00:12:00Z',
    closed_at: null,
    waiting_minutes: 78,
    referral: null,
    patient: { id: 9, full_name: 'Maria Dela Cruz', age: 34, sex: 'Female' },
    ...overrides,
  };
}

test('waiting time reads as minutes, then hours', () => {
  assert.equal(formatWaiting(0), 'Just arrived');
  assert.equal(formatWaiting(1), '1 min');
  assert.equal(formatWaiting(65), '65 min');
  assert.equal(formatWaiting(119), '119 min');
  assert.equal(formatWaiting(120), '2 h');
  assert.equal(formatWaiting(125), '2 h 5 min');
  assert.equal(formatWaiting(Number.NaN), 'Just arrived');
  assert.equal(formatWaiting(-4), 'Just arrived');
});

test('a known status is an info chip; anything else is a neutral chip with its own text', () => {
  assert.deepEqual(statusChip('waiting'), { label: 'Waiting', tone: 'info' });
  assert.deepEqual(statusChip('in_consultation'), { label: 'In Consultation', tone: 'info' });
  assert.deepEqual(statusChip('closed'), { label: 'Closed', tone: 'neutral' });
  assert.deepEqual(statusChip(''), { label: 'Unknown', tone: 'neutral' });
  assert.deepEqual(statusChip(undefined), { label: 'Unknown', tone: 'neutral' });
});

test('the row menu follows visit progress and duties', () => {
  const waiting = queueRows([visit()], NOW)[0];
  const inConsult = queueRows([visit({ status: 'in_consultation' })], NOW)[0];
  assert.deepEqual(queueRowActions(waiting, { canEncode: true, canClose: true }).map((item) => item.label), [
    'Start consultation',
    'Open patient record',
    'Close visit',
  ]);
  assert.deepEqual(queueRowActions(inConsult, { canEncode: true, canClose: true }).map((item) => item.label), [
    'Resume consultation',
    'Open patient record',
  ]);
  assert.deepEqual(queueRowActions(waiting, { canEncode: false, canClose: true }).map((item) => item.label), [
    'Open patient record',
    'Close visit',
  ]);
  assert.deepEqual(queueRowActions(waiting, { canEncode: true, canClose: false }).map((item) => item.label), [
    'Start consultation',
    'Open patient record',
  ]);
  assert.equal(queueRowActions(waiting, { canEncode: true, canClose: true }).find((item) => item.action === 'start').to, undefined);
  assert.equal(
    queueRowActions(inConsult, { canEncode: false, canFinalize: true }).some((item) => item.action === 'resume'),
    true,
  );
  assert.equal(
    queueRowActions(inConsult, { canEncode: false, canFinalize: false }).some((item) => item.action === 'resume'),
    false,
  );
});

test('a referred visit becomes a display row', () => {
  const [row] = queueRows([visit({ source: 'referral', referral: { id: 5, sending_bhc: 'BHC Poblacion' } })], NOW);
  assert.equal(row.id, 1);
  assert.equal(row.number, 1);
  assert.equal(row.patientId, 9);
  assert.equal(row.name, 'Maria Dela Cruz');
  assert.equal(row.ageSex, '34 · F');
  assert.equal(row.source, 'referral');
  assert.equal(row.sourceLabel, 'Referred');
  assert.equal(row.fromLabel, 'From BHC Poblacion');
  assert.equal(row.arrivedTime, '8:12 AM');
  assert.equal(row.carriedOver, false);
  assert.equal(row.arrivalNote, 'Waiting 78 min');
  assert.deepEqual(row.status, { label: 'Waiting', tone: 'info' });
});

test('a walk-in has no sending facility', () => {
  const [row] = queueRows([visit()], NOW);
  assert.equal(row.sourceLabel, 'Walk-in');
  assert.equal(row.fromLabel, null);
});

test('a visit still open from before midnight in Manila is marked, one after midnight is not', () => {
  const [late, early] = queueRows([
    visit({ id: 1, checked_in_at: '2026-10-24T15:30:00Z' }), // 11:30 PM Oct 24 Manila
    visit({ id: 2, checked_in_at: '2026-10-24T16:30:00Z' }), // 12:30 AM Oct 25 Manila
  ], NOW);
  assert.equal(late.carriedOver, true);
  assert.equal(late.arrivalNote, 'From Oct 24 · still open');
  assert.equal(early.carriedOver, false);
  assert.equal(early.arrivalNote, 'Waiting 78 min');
});

test('missing pieces never produce "undefined" or "null" text', () => {
  const [noBhc, noReferral, noAge, noAgeSex, noMinutes] = queueRows([
    visit({ source: 'referral', referral: { id: 5, sending_bhc: null } }),
    visit({ source: 'referral', referral: null }),
    visit({ patient: { id: 9, full_name: 'No Age', sex: 'Female' } }),
    visit({ patient: { id: 9, full_name: 'No Details' } }),
    visit({ waiting_minutes: undefined }),
  ], NOW);
  assert.equal(noBhc.fromLabel, null);
  assert.equal(noReferral.fromLabel, null);
  assert.equal(noAge.ageSex, 'F');
  assert.equal(noAgeSex.ageSex, '');
  assert.equal(noMinutes.arrivalNote, 'Just arrived');
});

test('rows keep the server order and are numbered from one', () => {
  const rows = queueRows([visit({ id: 7 }), visit({ id: 3 }), visit({ id: 9 })], NOW);
  assert.deepEqual(rows.map((row) => [row.number, row.id]), [[1, 7], [2, 3], [3, 9]]);
});

test('search needs every token in the name; the source switch narrows further', () => {
  const rows = queueRows([
    visit({ id: 1, patient: { id: 1, full_name: 'Jose Ramos', age: 61, sex: 'Male' } }),
    visit({ id: 2, source: 'referral', referral: { id: 2, sending_bhc: 'BHC A' }, patient: { id: 2, full_name: 'Jose Santos', age: 30, sex: 'Male' } }),
    visit({ id: 3, patient: { id: 3, full_name: 'Ana Ramos', age: 20, sex: 'Female' } }),
  ], NOW);
  assert.deepEqual(filterQueueRows(rows, { search: 'ramos jose', source: 'all' }).map((row) => row.id), [1]);
  assert.deepEqual(filterQueueRows(rows, { search: '  ', source: 'all' }).map((row) => row.id), [1, 2, 3]);
  assert.deepEqual(filterQueueRows(rows, { search: '', source: 'referral' }).map((row) => row.id), [2]);
  assert.deepEqual(filterQueueRows(rows, { search: 'jose', source: 'walk_in' }).map((row) => row.id), [1]);
});

test('a check-in search needs at least two visible characters', () => {
  assert.equal(isSearchable(''), false);
  assert.equal(isSearchable('a'), false);
  assert.equal(isSearchable('  a  '), false);
  assert.equal(isSearchable('ab'), true);
  assert.equal(isSearchable(' jo '), true);
  assert.equal(isSearchable(undefined), false);
});

test('age and sex read the same in the queue and in the check-in results', () => {
  assert.equal(formatAgeSex({ age: 61, sex: 'Male' }), '61 · M');
  assert.equal(formatAgeSex({ sex: 'Other' }), 'O');
  assert.equal(formatAgeSex({}), '');
  assert.equal(formatAgeSex(null), '');
});

test('a missing or unreadable arrival time never breaks the table', () => {
  const rows = queueRows([
    visit({ id: 1, checked_in_at: undefined }),
    visit({ id: 2, checked_in_at: 'not a date' }),
    visit({ id: 3, checked_in_at: null }),
  ], NOW);
  for (const row of rows) {
    assert.equal(row.arrivedTime, '—');
    assert.equal(row.carriedOver, false);
    assert.equal(row.arrivalNote, 'Waiting 78 min');
  }
});

test('a check-in key follows the patient: same patient keeps it, another patient gets a new one', () => {
  let counter = 0;
  const makeId = () => `k${++counter}`;
  const first = walkInKeyFor(null, 7, makeId);
  assert.deepEqual(first, { patientId: 7, key: 'k1' });
  assert.equal(walkInKeyFor(first, 7, makeId), first);
  assert.deepEqual(walkInKeyFor(first, 8, makeId), { patientId: 8, key: 'k2' });
});
