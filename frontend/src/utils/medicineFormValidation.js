function wholeNumberOrEmpty(value) {
  if (value === "" || value == null) return { empty: true, number: null };
  const number = Number(value);
  if (!Number.isInteger(number)) return { empty: false, number: null };
  return { empty: false, number };
}

export function validateMedicineForm(form = {}, mode = "add", options = {}) {
  const errors = {};

  if (!String(form.name || "").trim()) {
    errors.name = "Enter a medicine or supply name.";
  }

  if (mode === "add") {
    const quantity = wholeNumberOrEmpty(form.quantity);
    if (quantity.empty) {
      errors.quantity = "Enter an opening balance.";
    } else if (quantity.number == null || quantity.number < 0) {
      errors.quantity = "Opening balance must be zero or a whole number.";
    }
  }

  if (mode === "edit") {
    const quantity = wholeNumberOrEmpty(form.quantity);
    if (quantity.empty) {
      errors.quantity = "Enter the recorded stock quantity.";
    } else if (quantity.number == null || quantity.number < 0) {
      errors.quantity = "Recorded stock must be zero or a whole number.";
    }
    if (
      medicineFormNeedsCorrection(form, options) &&
      !String(form.reason || "").trim()
    ) {
      errors.reason = "Enter a reason for this stock correction.";
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

export function medicineFormNeedsCorrection(form = {}, options = {}) {
  const originalQuantity = Number(options.originalQuantity ?? 0);
  const reconciliationRequired = Boolean(options.reconciliationRequired);
  const quantity = wholeNumberOrEmpty(form.quantity);
  const quantityChanged =
    !quantity.empty &&
    quantity.number != null &&
    quantity.number !== originalQuantity;

  return quantityChanged || reconciliationRequired;
}

export function medicineFormHasErrors(errors = {}) {
  return Object.keys(errors).length > 0;
}
