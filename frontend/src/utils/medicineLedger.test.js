import assert from 'node:assert/strict';
import { test } from 'node:test';
import { medicineDetailsPath, inventoryActions, ledgerQuantity, orderedExpiryGroups, groupActions, validateStockAction, retainCalendarData } from './medicineLedger.js';

const group = { id: 5, expiration_date: '2099-01-01', available_quantity: 7, quarantined_quantity: 3 };
test('both inventories link to their own details and the single history section', () => {
  assert.equal(medicineDetailsPath('bhc', 7), '/bhc/medicine-availability/7');
  assert.equal(medicineDetailsPath('rhu', 7, true), '/rhu/medicine-management/7#history');
  assert.equal(medicineDetailsPath('bhc', 'a/b'), '/bhc/medicine-availability/a%2Fb');
});

test('midnight refetch retains the same facility snapshot but never crosses user or medicine scope', () => {
  const previous = ['medicine-availability', 'bhc', 'user1', 'facility1', '2026-10-28'];
  const data = [{ id: 7 }];
  assert.equal(retainCalendarData(data, { queryKey: previous }, [...previous.slice(0, -1), '2026-10-29']), data);
  assert.equal(retainCalendarData(data, { queryKey: previous }, ['medicine-availability', 'bhc', 'user1', 'facility2', '2026-10-29']), undefined);
  assert.equal(retainCalendarData(data, { queryKey: previous }, ['medicine-availability', 'bhc', 'user2', 'facility1', '2026-10-29']), undefined);
  const details = ['medicine-transactions', 'user1', 'bhc', 'facility1', '7', 'details', '2026-10-28'];
  assert.equal(retainCalendarData(data, { queryKey: details }, [...details.slice(0, -1), '2026-10-29']), data);
  assert.equal(retainCalendarData(data, { queryKey: details }, [...details.slice(0, 4), '8', 'details', '2026-10-29']), undefined);
});
test('inventory has exactly five actions and view-only staff cannot mutate stock', () => {
  const actions = inventoryActions(false);
  assert.deepEqual(actions.map(a => a.label), ['View Details', 'Restock', 'Deduct Stock', 'Quarantine Stock', 'Inventory History']);
  assert.deepEqual(actions.filter(a => !a.disabled).map(a => a.key), ['details', 'history']);
  assert.equal(inventoryActions(true).every(a => !a.disabled), true);
});
test('quantity breakdown appears only for different recorded and available totals', () => {
  assert.deepEqual(ledgerQuantity({ quantity: 10, stockSummary: { available: 10 } }), { recorded: 10, available: 10, differs: false });
  assert.deepEqual(ledgerQuantity({ quantity: 10, stockSummary: { available: 4 } }), { recorded: 10, available: 4, differs: true });
  assert.equal(ledgerQuantity({ quantity: 10 }).available, 0);
});
test('details orders every expiry group by date, NA last, without changing quantities', () => {
  const groups = [{ ...group, id: 3, expiry_not_applicable: true, expiration_date: null }, group, { ...group, id: 2, expiration_date: '2000-01-01' }];
  assert.deepEqual(orderedExpiryGroups({ expiryGroups: groups }).map(g => g.id), [2, 5, 3]);
  assert.equal(groups[0].id, 3);
});
test('group actions follow permissions, quarantine balances and expiry', () => {
  assert.deepEqual(groupActions(group, false), []);
  assert.deepEqual(groupActions(group, true), ['quarantine', 'release', 'quarantine_disposal']);
  assert.deepEqual(groupActions({ ...group, expiration_date: '2000-01-01' }, true), ['quarantine', 'quarantine_disposal']);
  assert.deepEqual(groupActions({ ...group, available_quantity: 0, quarantined_quantity: 0 }, true), []);
  assert.deepEqual(groupActions(group, true, false), ['quarantine', 'quarantine_disposal']);
});
test('focused forms validate the selected pool, positive whole quantity and required reason', () => {
  const item = { expiryGroups: [group], itemType: 'medicine' };
  const form = { expiry_group_id: 5, quantity: '2', reason: 'Verified physical movement' };
  assert.deepEqual(validateStockAction('quarantine', item, form), {});
  assert.ok(validateStockAction('deduct', item, { ...form, quantity: 8 }).quantity);
  assert.ok(validateStockAction('quarantine_disposal', item, { ...form, quantity: 4 }).quantity);
  assert.ok(validateStockAction('release', { ...item, expiryGroups: [{ ...group, expiration_date: '2000-01-01' }] }, form).expiry_group_id);
  assert.ok(validateStockAction('quarantine', item, { ...form, reason: '  ' }).reason);
  assert.ok(validateStockAction('deduct', item, { ...form, quantity: '1.5' }).quantity);
  assert.ok(validateStockAction('deduct', item, { ...form, expiry_group_id: 8 }).expiry_group_id);
});
