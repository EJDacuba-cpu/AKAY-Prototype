import test from "node:test";
import assert from "node:assert/strict";
import {
  formatStockQuantity,
  previewInventoryResult,
} from "./medicineInventoryPreview.js";

test("restock previews current plus quantity with the unit", () => {
  const preview = previewInventoryResult({
    mode: "restock",
    currentQuantity: 12,
    inputQuantity: "7",
    unit: "bottles",
  });

  assert.equal(preview.current, 12);
  assert.equal(preview.resulting, 19);
  assert.equal(preview.valid, true);
  assert.equal(preview.wouldBeNegative, false);
  assert.equal(formatStockQuantity(preview.current, preview.unit), "12 bottles");
  assert.equal(
    formatStockQuantity(preview.resulting, preview.unit),
    "19 bottles",
  );
});

test("deduct does not permit negative stock", () => {
  const preview = previewInventoryResult({
    mode: "deduct",
    currentQuantity: 4,
    inputQuantity: "6",
    unit: "pcs",
  });

  assert.equal(preview.resulting, -2);
  assert.equal(preview.wouldBeNegative, true);
  assert.equal(preview.valid, false);
});

test("deduct subtracts the entered quantity", () => {
  const preview = previewInventoryResult({
    mode: "deduct",
    currentQuantity: 10,
    inputQuantity: "3",
    unit: "vials",
  });

  assert.equal(preview.resulting, 7);
  assert.equal(preview.valid, true);
});

test("recorded stock correction uses the entered remaining stock as the result", () => {
  const preview = previewInventoryResult({
    mode: "correction",
    currentQuantity: 10,
    inputQuantity: "3",
    unit: "vials",
  });

  assert.equal(preview.resulting, 3);
  assert.equal(preview.valid, true);
});

test("correction in increases and correction out decreases", () => {
  const increase = previewInventoryResult({
    mode: "adjust",
    action: "correction",
    direction: "in",
    currentQuantity: 5,
    inputQuantity: 2,
  });
  const decrease = previewInventoryResult({
    mode: "adjust",
    action: "correction",
    direction: "out",
    currentQuantity: 5,
    inputQuantity: 2,
  });

  assert.equal(increase.resulting, 7);
  assert.equal(decrease.resulting, 3);
});
