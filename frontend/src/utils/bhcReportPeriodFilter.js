import { PERIOD_PRESETS, resolveReportPeriod } from "./bhcReporting.js";
import { normalizeDateValue } from "./filterUtils.js";

function isDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Validate a draft before resolving it; never silently reverse the user's range. */
export function prepareBhcReportPeriod(draft, now = new Date()) {
  const selection = { preset: draft.preset, from: draft.from || "", to: draft.to || "" };
  const errors = {};
  if (!PERIOD_PRESETS.some((item) => item.value === selection.preset)) {
    errors.preset = "Choose a reporting period.";
  }
  if (selection.preset === "custom") {
    const today = normalizeDateValue(now);
    if (!isDateOnly(selection.from)) {
      errors.from = "Choose a valid start date.";
    } else if (selection.from > today) {
      errors.from = "Start date cannot be in the future.";
    }
    if (selection.to && !isDateOnly(selection.to)) {
      errors.to = "Choose a valid end date.";
    } else if (selection.to > today) {
      errors.to = "End date cannot be in the future.";
    } else if (selection.to && selection.from && selection.to < selection.from) {
      errors.to = "End date must be on or after the start date.";
    }
  }
  if (Object.keys(errors).length) return { errors };
  return { errors, selection, period: resolveReportPeriod({ ...selection, now }) };
}
