import { expiryGroups, groupExpired, validateReceiptExpiry } from './medicineExpiryGroups.js';
import { getFacilityCalendarDate } from './medicineInventoryStatus.js';
import { queryKeys } from './queryKeys.js';

export const medicineDetailsKey = (user, id) => [...queryKeys.medicineTransactions(user, id), 'details', getFacilityCalendarDate()];

// Keep a form mounted across calendar refreshes, while refusing any change of data owner.
export function retainCalendarData(data, previousQuery, currentKey) {
  const previousKey = previousQuery?.queryKey;
  return Array.isArray(previousKey) && previousKey.length === currentKey.length
    && previousKey.every((part, index) => index === currentKey.length - 1 || Object.is(part, currentKey[index]))
    ? data : undefined;
}

export const inventoryPath = role => role === 'rhu' ? '/rhu/medicine-management' : '/bhc/medicine-availability';
export const medicineDetailsPath = (role, id, history = false) => `${inventoryPath(role)}/${encodeURIComponent(id)}${history ? '#history' : ''}`;
export function inventoryActions(canManage) {
  return [
    { key: 'details', label: 'View Details' },
    { key: 'restock', label: 'Restock', disabled: !canManage },
    { key: 'deduct', label: 'Deduct Stock', disabled: !canManage },
    { key: 'quarantine', label: 'Quarantine Stock', disabled: !canManage },
    { key: 'history', label: 'Inventory History' },
  ];
}
export function ledgerQuantity(item) {
  const recorded = Number(item.quantity) || 0;
  const available = Number(item.stockSummary?.available ?? item.stock_summary?.available) || 0;
  return { recorded, available, differs: recorded !== available };
}
export function orderedExpiryGroups(item) {
  return [...expiryGroups(item)].sort((a, b) => String(a.expiration_date || '9999-12-31').localeCompare(String(b.expiration_date || '9999-12-31')) || Number(a.id) - Number(b.id));
}
export function groupActions(group, canManage, active = true) {
  if (!canManage) return [];
  return [Number(group.available_quantity) > 0 && 'quarantine',
    Number(group.quarantined_quantity) > 0 && active && !groupExpired(group) && 'release',
    Number(group.quarantined_quantity) > 0 && 'quarantine_disposal'].filter(Boolean);
}
export function actionGroups(item, mode) {
  return orderedExpiryGroups(item).filter(group => ['release', 'quarantine_disposal'].includes(mode)
    ? Number(group.quarantined_quantity) > 0 && (mode !== 'release' || (!groupExpired(group) && item.is_active !== false))
    : Number(group.available_quantity) > 0);
}
export function validateStockAction(mode, item, form) {
  const errors = {};
  const quantity = Number(form.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) errors.quantity = 'Enter a whole quantity from 1 to 2,147,483,647.';
  if (!String(form.reason || '').trim()) errors.reason = 'Enter the reason for this stock movement.';
  if (String(form.reason || '').trim().length > 1000) errors.reason = 'Use 1,000 characters or fewer.';
  if (mode === 'restock') {
    const issue = validateReceiptExpiry({ ...form, itemType: item.itemType });
    if (issue) errors.expiryDate = issue;
  } else {
    const group = actionGroups(item, mode).find(g => String(g.id) === String(form.expiry_group_id));
    if (!group) errors.expiry_group_id = 'Select a group with stock available for this action.';
    else {
      const maximum = Number(['release', 'quarantine_disposal'].includes(mode) ? group.quarantined_quantity : group.available_quantity);
      if (quantity > maximum) errors.quantity = `This group has only ${maximum.toLocaleString()} ${item.unit || 'units'} in the selected pool.`;
    }
  }
  return errors;
}
