export function describeBhcMedicineDeletion(item = {}) {
  const name = item.name || "This medicine";
  const id = item.id || "unknown";

  return {
    title: "Delete from BHC inventory?",
    description: `${name} (Item ID ${id}) will be removed from BHC inventory. This cannot be undone.`,
    confirmText: "Delete item",
  };
}

export function applyInventoryListAfterDelete(items, deletedId, { ok } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!ok) return list;
  return list.filter((item) => String(item.id) !== String(deletedId));
}

export function medicineCreateRequestHeaders(idempotencyKey) {
  if (!idempotencyKey) return {};
  return { "Idempotency-Key": idempotencyKey };
}
