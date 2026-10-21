import test from "node:test";
import assert from "node:assert/strict";
import {
  medicineFormHasErrors,
  medicineFormNeedsCorrection,
  validateMedicineForm,
} from "./medicineFormValidation.js";

const validAdd = {
  name: "Paracetamol 500mg",
  quantity: "12",
  lowStockThreshold: "10",
};

test("add requires name, opening balance, and threshold without mutating the form", () => {
  const blank = { name: "  ", quantity: "", lowStockThreshold: "" };
  const errors = validateMedicineForm(blank, "add");

  assert.deepEqual(errors, {
    name: "Enter a medicine or supply name.",
    quantity: "Enter an opening balance.",
    lowStockThreshold: "Enter a low stock threshold.",
  });
  assert.equal(blank.name, "  ");
  assert.equal(blank.quantity, "");
  assert.equal(medicineFormHasErrors(errors), true);
});

test("edit keeps metadata-only forms valid when recorded stock is unchanged", () => {
  const form = { name: "Amoxicillin", quantity: "8", lowStockThreshold: "8" };
  const errors = validateMedicineForm(form, "edit", { originalQuantity: 8 });

  assert.deepEqual(errors, {});
  assert.equal(form.name, "Amoxicillin");
  assert.equal(medicineFormHasErrors(errors), false);
  assert.equal(
    medicineFormNeedsCorrection(form, { originalQuantity: 8 }),
    false,
  );
});

test("edit requires a reason when recorded stock changes", () => {
  const form = {
    name: "Amoxicillin",
    quantity: "5",
    lowStockThreshold: "8",
    reason: "",
  };
  const errors = validateMedicineForm(form, "edit", { originalQuantity: 8 });

  assert.equal(errors.reason, "Enter a reason for this stock correction.");
  assert.equal(
    medicineFormNeedsCorrection(form, { originalQuantity: 8 }),
    true,
  );
});

test("edit requires a reason when reconciliation is pending", () => {
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

  assert.equal(errors.reason, "Enter a reason for this stock correction.");
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
