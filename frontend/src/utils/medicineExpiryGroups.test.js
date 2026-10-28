import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expiryGroups, eligibleGroups, previewFefo, allocationIntent, validateReceiptExpiry, validateManualAllocation } from './medicineExpiryGroups.js';

const medicine = { expiry_groups: [
  { id: 1, expiration_date: '2026-10-27', available_quantity: 50 },
  { id: 2, expiration_date: '2026-10-28', available_quantity: 3, quarantined_quantity: 8 },
  { id: 3, expiration_date: '2026-11-01', available_quantity: 4 },
  { id: 4, expiry_not_applicable: true, available_quantity: 2 },
] };
const now = new Date('2026-10-27T16:00:00Z');

test('malformed expiry-group payloads cannot crash FEFO or invent available stock', () => {
  for (const expiry_groups of [{}, '[]', 'unknown', 1, true, null]) {
    const item = { quantity: 99, expiry_groups };
    assert.deepEqual(expiryGroups(item), []);
    assert.deepEqual(previewFefo(item, 5, now), { allocations: [], shortage: 5, recordIssue: false });
  }
  assert.deepEqual(expiryGroups(null), []);
});

test('valid camel-case groups survive a malformed snake-case field and invalid rows are excluded', () => {
  const group = medicine.expiry_groups[1];
  const item = { expiry_groups: {}, expiryGroups: [null, 'invalid', [], group] };
  assert.deepEqual(expiryGroups(item).map(g => g.id), [2]);
  assert.deepEqual(previewFefo(item, 4, now), { allocations: [{ expiry_group_id: 2, quantity: 3 }], shortage: 1, recordIssue: false });
  assert.deepEqual(expiryGroups({ expiry_groups: [], expiryGroups: [group] }), []);
});
test('FEFO uses Manila today, excludes expired/quarantine and places NA last', () => {
  assert.deepEqual(eligibleGroups(medicine, now).map(g => g.id), [2, 3, 4]);
  assert.deepEqual(previewFefo(medicine, 11, now), { allocations: [
    { expiry_group_id: 2, quantity: 3 }, { expiry_group_id: 3, quantity: 4 }, { expiry_group_id: 4, quantity: 2 },
  ], shortage: 2, recordIssue: false });
  assert.equal(previewFefo({ quantity: 99 }, 5, now).shortage, 5);
});

test('95 available tablets cover a 20-tablet dispense from the verified expiry group', () => {
  const item = {
    quantity: 95,
    unit: 'tablets',
    stockSummary: { recorded: 95, available: 95, quarantined: 0, expired: 0, unassigned: 0 },
    expiry_groups: [{ id: 11, expiration_date: '2027-03-01', available_quantity: 95, quarantined_quantity: 0 }],
  };
  assert.deepEqual(previewFefo(item, 20, now), {
    allocations: [{ expiry_group_id: 11, quantity: 20 }],
    shortage: 0,
    recordIssue: false,
  });
});

test('FEFO splits across multiple dated groups before reporting a shortage', () => {
  const item = { expiry_groups: [
    { id: 21, expiration_date: '2026-11-01', available_quantity: 30 },
    { id: 22, expiration_date: '2027-03-01', available_quantity: 65 },
  ] };
  assert.deepEqual(previewFefo(item, 40, now), {
    allocations: [{ expiry_group_id: 21, quantity: 30 }, { expiry_group_id: 22, quantity: 10 }],
    shortage: 0,
    recordIssue: false,
  });
  assert.deepEqual(previewFefo(item, 100, now), {
    allocations: [{ expiry_group_id: 21, quantity: 30 }, { expiry_group_id: 22, quantity: 65 }],
    shortage: 5,
    recordIssue: false,
  });
});

test('ISO and keyed group payloads still allocate instead of inventing a shortage', () => {
  const item = {
    stockSummary: { available: 95 },
    expiry_groups: {
      11: { id: 11, expirationDate: '2027-03-01T00:00:00.000000Z', availableQuantity: 95 },
    },
  };
  assert.deepEqual(previewFefo(item, 20, now), {
    allocations: [{ expiry_group_id: 11, quantity: 20 }],
    shortage: 0,
    recordIssue: false,
  });
});

test('available stock without a verified expiry group is a record issue, not a physical shortage', () => {
  const item = {
    quantity: 95,
    stockSummary: { recorded: 95, available: 95, unassigned: 0 },
    expiry_groups: [{ id: 11, expiration_date: null, available_quantity: 95 }],
  };
  assert.deepEqual(previewFefo(item, 20, now), {
    allocations: [],
    shortage: 20,
    recordIssue: true,
  });
});
test('explicit empty manual intent survives draft JSON and serialization', () => {
  const item = JSON.parse(JSON.stringify({ allocations: [], overrideReason: 'Actual unrecorded supply' }));
  assert.deepEqual(allocationIntent(item), { allocations: [], override_reason: 'Actual unrecorded supply' });
  assert.deepEqual(allocationIntent({ quantity: 2 }), {});
});
test('receipt expiry is explicit and only supplies can use NA', () => {
  assert.ok(validateReceiptExpiry({ itemType: 'medicine' }, now));
  assert.ok(validateReceiptExpiry({ itemType: 'medicine', expiryNotApplicable: true }, now));
  assert.equal(validateReceiptExpiry({ itemType: 'health_supply', expiryNotApplicable: true }, now), '');
  assert.ok(validateReceiptExpiry({ expiryDate: '2026-10-27' }, now));
  assert.equal(validateReceiptExpiry({ expiryDate: '2026-10-28' }, now), '');
});
test('manual allocation validates actual total, stale quantities and mandatory reason', () => {
  assert.ok(validateManualAllocation(medicine, 2, [{ expiry_group_id: 2, quantity: 3 }], 'Selected group', now));
  assert.ok(validateManualAllocation(medicine, 9, [{ expiry_group_id: 2, quantity: 4 }], 'Selected group', now));
  assert.ok(validateManualAllocation(medicine, 9, [], '', now));
  assert.equal(validateManualAllocation(medicine, 9, [], 'Actual unrecorded supply', now), '');
});
test('matching FEFO allocations do not require a reason', () => {
  const allocations = previewFefo(medicine, 9, now).allocations;
  assert.equal(validateManualAllocation(medicine, 9, allocations, '', now), '');
  assert.equal(validateManualAllocation(medicine, 9, [...allocations].reverse(), '', now), '');
});
test('allocations that differ from FEFO still require a reason', () => {
  assert.equal(validateManualAllocation(medicine, 3, [{ expiry_group_id: 3, quantity: 1 }], '', now), 'Enter a reason for this stock choice.');
  assert.equal(validateManualAllocation(medicine, 3, [{ expiry_group_id: 3, quantity: 1 }], 'Selected later expiry', now), '');
});
