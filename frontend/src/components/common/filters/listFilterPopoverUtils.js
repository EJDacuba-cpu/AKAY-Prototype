export function pickFilterValues(applied = {}, fields = []) {
  return fields.reduce((acc, field) => {
    acc[field.key] = applied[field.key] ?? field.resetValue;
    if (field.type === "datePresets" || field.type === "datePreset") {
      const fromKey = field.dateFromKey || "dateFrom";
      const toKey = field.dateToKey || "dateTo";
      acc[fromKey] = applied[fromKey] ?? "";
      acc[toKey] = applied[toKey] ?? "";
    }
    return acc;
  }, {});
}

export function isDraftDefault(draft, fields = []) {
  return fields.every((field) => {
    if ((draft[field.key] ?? field.resetValue) !== field.resetValue) return false;
    if (field.type === "datePresets" || field.type === "datePreset") {
      const fromKey = field.dateFromKey || "dateFrom";
      const toKey = field.dateToKey || "dateTo";
      return !(draft[fromKey] || draft[toKey]);
    }
    return true;
  });
}
