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
    assert.deepEqual(previewFefo(item, 5, now), { allocations: [], shortage: 5 });
  }
  assert.deepEqual(expiryGroups(null), []);
});

test('valid camel-case groups survive a malformed snake-case field and invalid rows are excluded', () => {
  const group = medicine.expiry_groups[1];
  const item = { expiry_groups: {}, expiryGroups: [null, 'invalid', [], group] };
  assert.deepEqual(expiryGroups(item), [group]);
  assert.deepEqual(previewFefo(item, 4, now), { allocations: [{ expiry_group_id: 2, quantity: 3 }], shortage: 1 });
  assert.deepEqual(expiryGroups({ expiry_groups: [], expiryGroups: [group] }), []);
});
test('FEFO uses Manila today, excludes expired/quarantine and places NA last', () => {
  assert.deepEqual(eligibleGroups(medicine, now).map(g => g.id), [2, 3, 4]);
  assert.deepEqual(previewFefo(medicine, 11, now), { allocations: [
    { expiry_group_id: 2, quantity: 3 }, { expiry_group_id: 3, quantity: 4 }, { expiry_group_id: 4, quantity: 2 },
  ], shortage: 2 });
  assert.equal(previewFefo({ quantity: 99 }, 5, now).shortage, 5);
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
