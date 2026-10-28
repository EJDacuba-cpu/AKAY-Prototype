import { validateReceiptExpiry } from "./medicineExpiryGroups.js";
function wholeNumberOrEmpty(value) {
  if (value === "" || value == null) return { empty: true, number: null };
  const number = Number(value);
  if (!Number.isInteger(number)) return { empty: false, number: null };
  return { empty: false, number };
}

export function validateMedicineForm(form = {}, mode = "add") {
  const errors = {};

  if (!String(form.name || "").trim()) {
    errors.name = "Enter a medicine or supply name.";
  }

  if (mode === "add") {
    const expiryError = validateReceiptExpiry(form);
    if (expiryError) errors.expiryDate = expiryError;
    const quantity = wholeNumberOrEmpty(form.quantity);
    if (quantity.empty) {
      errors.quantity = "Enter an opening balance.";
    } else if (quantity.number == null || quantity.number < 0) {
      errors.quantity = "Opening balance must be zero or a whole number.";
    }
  }

  const threshold = wholeNumberOrEmpty(form.lowStockThreshold);
  if (threshold.empty) {
    errors.lowStockThreshold = "Enter a low stock threshold.";
  } else if (threshold.number == null || threshold.number < 0) {
    errors.lowStockThreshold = "Low stock threshold must be zero or a whole number.";
  }

  return errors;
}

export function medicineFormHasErrors(errors = {}) {
  return Object.keys(errors).length > 0;
}
