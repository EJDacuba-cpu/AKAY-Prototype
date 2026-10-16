import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLongDate, formatDate } from './formatters.js';

test('date of birth reads as Month Day, Year', () => {
  assert.equal(formatLongDate('2005-04-13'), 'April 13, 2005');
  assert.equal(formatDate('2005-04-13'), 'April 13, 2005');
});

test('calendar dates near year and month edges never shift a day', () => {
  assert.equal(formatLongDate('2024-01-01'), 'January 1, 2024');
  assert.equal(formatLongDate('2024-12-31'), 'December 31, 2024');
  assert.equal(formatLongDate('2024-02-29'), 'February 29, 2024');
  assert.equal(formatLongDate('1999-03-01'), 'March 1, 1999');
});

test('missing or invalid values fall back instead of throwing', () => {
  assert.equal(formatLongDate(null), '—');
  assert.equal(formatLongDate(undefined, 'Not recorded'), 'Not recorded');
  assert.equal(formatLongDate('', 'Not recorded'), 'Not recorded');
  assert.equal(formatLongDate('not-a-date', 'Not recorded'), 'not-a-date');
  assert.equal(formatDate('', 'Not recorded'), 'Not recorded');
});

test('a Date object and a patient object both work, and ISO input is never mutated', () => {
  assert.equal(formatLongDate(new Date(2005, 3, 13)), 'April 13, 2005');
  const patient = { birthDate: '2005-04-13' };
  assert.equal(formatLongDate(patient), 'April 13, 2005');
  assert.equal(patient.birthDate, '2005-04-13');
});
