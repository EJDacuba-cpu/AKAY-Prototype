import test from "node:test";
import assert from "node:assert/strict";
import {
  applyInventoryListAfterDelete,
  describeBhcMedicineDeletion,
  medicineCreateRequestHeaders,
} from "./medicineMutationSafety.js";

const items = [
  { id: "12", name: "Paracetamol" },
  { id: "13", name: "Amoxicillin" },
];

test("delete copy names the medicine, item id, and irreversible warning", () => {
  const copy = describeBhcMedicineDeletion(items[0]);
  assert.equal(copy.title, "Delete from BHC inventory?");
  assert.match(copy.description, /Paracetamol/);
  assert.match(copy.description, /Item ID 12/);
  assert.match(copy.description, /cannot be undone/);
});

test("cancelled or failed deletion keeps the inventory list", () => {
  assert.deepEqual(
    applyInventoryListAfterDelete(items, "12", { ok: false }),
    items,
  );
});

test("successful deletion removes only that row", () => {
  assert.deepEqual(applyInventoryListAfterDelete(items, "12", { ok: true }), [
    { id: "13", name: "Amoxicillin" },
  ]);
});

test("create requests send Idempotency-Key only when a submission key exists", () => {
  assert.deepEqual(medicineCreateRequestHeaders(), {});
  assert.deepEqual(medicineCreateRequestHeaders("abc-123"), {
    "Idempotency-Key": "abc-123",
  });
});
