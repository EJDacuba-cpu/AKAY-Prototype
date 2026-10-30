const MAX_QUANTITY = 2147483647;

function toNumber(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatStockQuantity(quantity, unit = "") {
  if (quantity == null || Number.isNaN(quantity)) return "—";
  return `${Number(quantity).toLocaleString()} ${String(unit || "").trim()}`.trim();
}

export function previewInventoryResult({
  mode,
  action,
  direction,
  currentQuantity,
  inputQuantity,
  unit = "",
} = {}) {
  const current = Math.max(0, Number(currentQuantity) || 0);
  const input = toNumber(inputQuantity);
  const unitLabel = String(unit || "").trim();

  if (input == null) {
    return {
      current,
      resulting: null,
      valid: false,
      wouldBeNegative: false,
      unit: unitLabel,
    };
  }

  let resulting;
  if (mode === "restock") {
    resulting = current + input;
  } else if (mode === "deduct") {
    resulting = current - input;
  } else if (mode === "correction" || action === "physical_count") {
    resulting = input;
  } else {
    const increase =
      action === "adjustment_in" ||
      (action === "correction" && direction === "in");
    resulting = increase ? current + input : current - input;
  }

  const wouldBeNegative = resulting < 0;
  const minimum = mode === "correction" || action === "physical_count" ? 0 : 1;
  const valid =
    Number.isInteger(input) &&
    input >= minimum &&
    !wouldBeNegative &&
    resulting <= MAX_QUANTITY;

  return {
    current,
    resulting,
    valid,
    wouldBeNegative,
    unit: unitLabel,
  };
}
