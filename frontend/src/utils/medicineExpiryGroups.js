import { getFacilityCalendarDate, formatFacilityDate, toFacilityCalendarDate } from './medicineInventoryStatus.js';

function collection(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const rows = Object.values(value);
    return rows.length ? rows : null;
  }
  return null;
}

function normalizeGroup(group) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return null;
  const id = Number(group.id);
  if (!Number.isInteger(id) || id < 1) return null;
  return {
    ...group,
    id,
    expiration_date: toFacilityCalendarDate(group.expiration_date ?? group.expirationDate ?? group.expiryDate),
    expiry_not_applicable: Boolean(group.expiry_not_applicable ?? group.expiryNotApplicable),
    available_quantity: Number(group.available_quantity ?? group.availableQuantity ?? 0),
    quarantined_quantity: Number(group.quarantined_quantity ?? group.quarantinedQuantity ?? 0),
  };
}

export function expiryGroups(item = {}) {
  const groups = collection(item?.expiry_groups) ?? collection(item?.expiryGroups) ?? [];
  return groups.map(normalizeGroup).filter(Boolean);
}
export const groupLabel = (group = {}) => group.expiry_not_applicable ? 'Not Applicable' : formatFacilityDate(group.expiration_date);
export function groupExpired(group, now = new Date()) {
  if (group?.expiry_not_applicable) return false;
  const date = toFacilityCalendarDate(group?.expiration_date);
  return date != null && date < getFacilityCalendarDate(now);
}
export function eligibleGroups(item, now = new Date()) {
  return expiryGroups(item).filter(g => Number(g.available_quantity) > 0 && (g.expiry_not_applicable || (g.expiration_date && !groupExpired(g, now))))
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
  const recordedAvailable = Number(item?.stockSummary?.available ?? item?.stock_summary?.available ?? 0);
  return {
    allocations,
    shortage,
    recordIssue: shortage > 0 && allocations.length === 0 && recordedAvailable > 0,
  };
}
export function allocationsMatch(left, right) {
  const normalize = (rows = []) => (Array.isArray(rows) ? rows : [])
    .map((row) => ({ expiry_group_id: Number(row.expiry_group_id), quantity: Number(row.quantity) }))
    .filter((row) => row.expiry_group_id > 0 && row.quantity > 0)
    .sort((a, b) => a.expiry_group_id - b.expiry_group_id);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
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
  const groups = eligibleGroups(item, now);
  const seen = new Set();
  let total = 0;
  for (const a of allocations) {
    const group = groups.find(g => Number(g.id) === Number(a.expiry_group_id));
    if (!group || seen.has(Number(a.expiry_group_id)) || !Number.isInteger(Number(a.quantity)) || Number(a.quantity) <= 0 || Number(a.quantity) > Number(group.available_quantity)) return 'Enter a quantity from available dated stock only.';
    seen.add(Number(a.expiry_group_id)); total += Number(a.quantity);
  }
  if (total > Number(quantity)) return 'Quantities by expiry date add up to more than the amount given.';
  if (allocationsMatch(allocations, previewFefo(item, quantity, now).allocations)) return '';
  return String(reason || '').trim() ? '' : 'Enter a reason for this stock choice.';
}
