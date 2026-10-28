import { getFacilityCalendarDate, formatFacilityDate } from './medicineInventoryStatus.js';

export function expiryGroups(item = {}) {
  const groups = Array.isArray(item?.expiry_groups) ? item.expiry_groups
    : Array.isArray(item?.expiryGroups) ? item.expiryGroups : [];
  return groups.filter(group => group !== null && typeof group === 'object' && !Array.isArray(group));
}
export const groupLabel = (group = {}) => group.expiry_not_applicable ? 'Not Applicable' : formatFacilityDate(group.expiration_date);
export function groupExpired(group, now = new Date()) {
  return !group.expiry_not_applicable && String(group.expiration_date || '').slice(0, 10) < getFacilityCalendarDate(now);
}
export function eligibleGroups(item, now = new Date()) {
  return expiryGroups(item).filter(g => !groupExpired(g, now) && Number(g.available_quantity) > 0)
    .sort((a, b) => String(a.expiration_date || '9999').localeCompare(String(b.expiration_date || '9999')) || Number(a.id) - Number(b.id));
}
export function previewFefo(item, quantity, now = new Date()) {
  let shortage = Math.max(0, Number(quantity) || 0);
  const allocations = [];
  for (const group of eligibleGroups(item, now)) {
    const amount = Math.min(shortage, Number(group.available_quantity));
    if (amount > 0) allocations.push({ expiry_group_id: Number(group.id), quantity: amount });
    shortage -= amount;
  }
  return { allocations, shortage };
}
export function allocationIntent(item = {}) {
  if (!Array.isArray(item.allocations)) return {};
  return { allocations: item.allocations.map(a => ({ expiry_group_id: Number(a.expiry_group_id), quantity: Number(a.quantity) }))
    .sort((a, b) => a.expiry_group_id - b.expiry_group_id), override_reason: String(item.override_reason ?? item.overrideReason ?? '').trim() };
}
export function validateReceiptExpiry(form, now = new Date()) {
  const na = form.expiryNotApplicable ?? form.expiry_not_applicable;
  const date = form.expiryDate || form.expiration_date;
  if (na) return (form.itemType || form.item_type) !== 'health_supply' ? 'Only health supplies may use Not Applicable.' : date ? 'Choose an expiry date or Not Applicable, not both.' : '';
  if (!date) return 'Enter the manufacturer expiry date.';
  return date < getFacilityCalendarDate(now) ? 'Received stock cannot already be expired.' : '';
}
export function validateManualAllocation(item, quantity, allocations, reason, now = new Date()) {
  if (!String(reason || '').trim()) return 'Enter a reason for this stock choice.';
  const groups = eligibleGroups(item, now);
  const seen = new Set();
  let total = 0;
  for (const a of allocations) {
    const group = groups.find(g => Number(g.id) === Number(a.expiry_group_id));
    if (!group || seen.has(Number(a.expiry_group_id)) || !Number.isInteger(Number(a.quantity)) || Number(a.quantity) <= 0 || Number(a.quantity) > Number(group.available_quantity)) return 'Enter a quantity from available dated stock only.';
    seen.add(Number(a.expiry_group_id)); total += Number(a.quantity);
  }
  return total > Number(quantity) ? 'Quantities by expiry date add up to more than the amount given.' : '';
}
