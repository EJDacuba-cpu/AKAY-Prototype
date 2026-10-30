import test from "node:test";
import assert from "node:assert/strict";
import {
  medicineFormHasErrors,
  validateMedicineForm,
} from "./medicineFormValidation.js";

const validAdd = {
  name: "Paracetamol 500mg",
  expiryDate: "2099-12-31",
  quantity: "12",
  lowStockThreshold: "10",
};

test("add requires name, opening balance, and threshold without mutating the form", () => {
  const blank = { name: "  ", quantity: "", lowStockThreshold: "" };
  const errors = validateMedicineForm(blank, "add");

  assert.deepEqual(errors, {
    name: "Enter a medicine or supply name.",
    expiryDate: "Enter the manufacturer expiry date.",
    quantity: "Enter an opening balance.",
    lowStockThreshold: "Enter a low stock threshold.",
  });
  assert.equal(blank.name, "  ");
  assert.equal(blank.quantity, "");
  assert.equal(medicineFormHasErrors(errors), true);
});

test("edit validates metadata without requiring recorded stock or a correction reason", () => {
  const form = { name: "Amoxicillin", lowStockThreshold: "8" };
  const errors = validateMedicineForm(form, "edit");

  assert.deepEqual(errors, {});
  assert.equal(form.name, "Amoxicillin");
  assert.equal(medicineFormHasErrors(errors), false);
});

test("edit does not turn stale stock into a correction", () => {
  const form = {
    name: "Amoxicillin",
    quantity: "5",
    lowStockThreshold: "8",
    reason: "",
  };
  const errors = validateMedicineForm(form, "edit", { originalQuantity: 8 });

  assert.deepEqual(errors, {});
});

test("pending reconciliation does not require a correction reason to edit metadata", () => {
  const form = {
    name: "Amoxicillin",
    quantity: "8",
    lowStockThreshold: "8",
    reason: "  ",
  };
  const errors = validateMedicineForm(form, "edit", {
    originalQuantity: 8,
    reconciliationRequired: true,
  });

  assert.deepEqual(errors, {});
});

test("a failed submit path keeps entered values", () => {
  const form = { ...validAdd, name: "Kept Paracetamol", quantity: "4" };
  const errors = validateMedicineForm(form, "add");
  assert.deepEqual(errors, {});
  assert.equal(form.name, "Kept Paracetamol");
  assert.equal(form.quantity, "4");
  assert.equal(form.lowStockThreshold, "10");
});

test("non-integer opening balance is rejected", () => {
  const errors = validateMedicineForm(
    { ...validAdd, quantity: "1.5" },
    "add",
  );
  assert.equal(
    errors.quantity,
    "Opening balance must be zero or a whole number.",
  );
});
