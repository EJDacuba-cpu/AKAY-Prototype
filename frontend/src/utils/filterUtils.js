export const DEFAULT_DATE_PRESETS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom date" },
];

export function normalizeFilterValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeDateValue(value) {
  if (!value) return "";

  if (value instanceof Date) {
    const copy = new Date(value);
    copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
    return copy.toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);

  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().slice(0, 10);
}

export function isDateInRange(date, from, to) {
  const value = normalizeDateValue(date);
  if (!value) return !from && !to;

  return (!from || value >= from) && (!to || value <= to);
}

export function isDateInPreset(date, preset, range = {}) {
  const selectedPreset = preset || "all";
  if (selectedPreset === "all" || selectedPreset === "") return true;
  if (selectedPreset === "custom") {
    return isDateInRange(date, range.from, range.to);
  }

  const value = normalizeDateValue(date);
  if (!value) return false;

  const parsed = new Date(`${value}T00:00:00`);
  const todayValue = normalizeDateValue(new Date());
  const today = new Date(`${todayValue}T00:00:00`);

  if (selectedPreset === "today") return value === todayValue;

  if (selectedPreset === "this_week") {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return parsed >= weekStart && parsed <= weekEnd;
  }

  if (selectedPreset === "this_month") {
    return (
      parsed.getFullYear() === today.getFullYear() &&
      parsed.getMonth() === today.getMonth()
    );
  }

  return true;
}

export function applyDateFilter(items, dateGetter, filters, options = {}) {
  const presetKey = options.presetKey || "dateRange";
  const fromKey = options.fromKey || "dateFrom";
  const toKey = options.toKey || "dateTo";

  return items.filter((item) =>
    isDateInPreset(dateGetter(item), filters[presetKey], {
      from: filters[fromKey],
      to: filters[toKey],
    }),
  );
}

export function createActiveFilterChips(filters, config) {
  const dateKeys = new Set();

  return config
    .flatMap((field) => {
      if (field.type === "datePresets" || field.type === "datePreset") {
        const fromKey = field.dateFromKey || "dateFrom";
        const toKey = field.dateToKey || "dateTo";
        const customDateKey = field.customDateKey;
        dateKeys.add(fromKey);
        dateKeys.add(toKey);
        if (customDateKey) dateKeys.add(customDateKey);

        const value = filters[field.key] ?? field.resetValue ?? "all";
        if (isResetValue(field, value)) return [];

        const label = getOptionLabel(field, value);
        const from = filters[fromKey];
        const to = filters[toKey];
        const customDate = customDateKey ? filters[customDateKey] : "";
        const suffix =
          value === "custom"
            ? formatCustomDateSuffix(from, to, customDate)
            : label;

        return [
          {
            key: field.key,
            label: `${field.label}: ${suffix}`,
          },
        ];
      }

      if (dateKeys.has(field.key) || field.key === "search") return [];

      const value = filters[field.key];
      if (isResetValue(field, value)) return [];

      return [
        {
          key: field.key,
          label: `${field.label}: ${getOptionLabel(field, value)}`,
        },
      ];
    })
    .filter(Boolean);
}

function isResetValue(field, value) {
  const resetValue = Object.prototype.hasOwnProperty.call(field, "resetValue")
    ? field.resetValue
    : getDefaultResetValue(field);

  return value === undefined || value === null || value === "" || value === resetValue;
}

function getDefaultResetValue(field) {
  if (field.type === "datePresets" || field.type === "datePreset") {
    return "all";
  }

  const firstOption = field.options?.[0];
  if (!firstOption) return "";
  if (typeof firstOption === "string") return firstOption;
  return firstOption.value ?? firstOption.label ?? "";
}

function getOptionLabel(field, value) {
  const options =
    field.type === "datePresets" || field.type === "datePreset"
      ? field.presets || field.options || DEFAULT_DATE_PRESETS
      : field.options || [];

  const option = options.find((item) => {
    const candidate = typeof item === "string" ? item : item.value;
    return candidate === value;
  });

  if (!option) return value;
  return typeof option === "string" ? option : option.label ?? option.value;
}

function formatCustomDateSuffix(from, to, customDate) {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  if (customDate) return customDate;
  return "Custom date";
}
