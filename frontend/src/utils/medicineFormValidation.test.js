import test from "node:test";
import assert from "node:assert/strict";
import {
  medicineFormHasErrors,
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

test("edit does not require quantity and keeps a valid form unchanged", () => {
  const form = { name: "Amoxicillin", lowStockThreshold: "8" };
  const errors = validateMedicineForm(form, "edit");

  assert.deepEqual(errors, {});
  assert.equal(form.name, "Amoxicillin");
  assert.equal(medicineFormHasErrors(errors), false);
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
