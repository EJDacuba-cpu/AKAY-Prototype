import { useMemo } from "react";
import ListFilterPopover, {
  pickFilterValues,
} from "../../common/filters/ListFilterPopover";
import { PERIOD_PRESETS } from "../../../utils/bhcReporting";
import { prepareBhcReportPeriod } from "../../../utils/bhcReportPeriodFilter";
import {
  NUTRITION_AGE_GROUPS,
  normalizeNutritionAgeGroup,
} from "../../../utils/nutritionReporting";

const PERIOD_FIELDS = [
  {
    key: "preset",
    label: "Reporting period",
    resetValue: "monthly",
    options: PERIOD_PRESETS.map((item) => ({
      value: item.value,
      label: item.value === "custom" ? "Custom Date" : item.label,
    })),
    type: "datePresets",
    presets: PERIOD_PRESETS.map((item) => ({
      value: item.value,
      label: item.value === "custom" ? "Custom Date" : item.label,
    })),
    dateFromKey: "from",
    dateToKey: "to",
    customValue: "custom",
    fullWidth: true,
  },
];

const AGE_FIELD = {
  key: "ageGroup",
  label: "Age group",
  resetValue: "all",
  options: NUTRITION_AGE_GROUPS.map((item) => ({
    value: item.value,
    label: item.label,
  })),
  fullWidth: true,
};

function periodChipLabel(selection, period) {
  if (selection.preset === "weekly") return "Period: Weekly";
  if (selection.preset === "monthly") return "Period: Monthly";
  if (selection.preset === "custom") {
    return period?.label
      ? `Period: ${period.label}`
      : "Period: Custom Date";
  }
  return `Period: ${period?.label || selection.preset}`;
}

function ageChipLabel(ageGroup) {
  const match = NUTRITION_AGE_GROUPS.find((item) => item.value === ageGroup);
  return match && match.value !== "all" ? `Age: ${match.label}` : "";
}

export default function BhcReportPeriodFilter({
  applied,
  onApply,
  includeAgeGroup = false,
}) {
  const fields = useMemo(
    () => (includeAgeGroup ? [...PERIOD_FIELDS, AGE_FIELD] : PERIOD_FIELDS),
    [includeAgeGroup],
  );

  const activeFilters = useMemo(() => {
    const chips = [];
    if (applied.selection.preset !== "monthly") {
      chips.push({
        key: "preset",
        label: periodChipLabel(applied.selection, applied.period),
      });
    }
    if (includeAgeGroup) {
      const ageGroup = normalizeNutritionAgeGroup(applied.selection.ageGroup);
      const label = ageChipLabel(ageGroup);
      if (label) chips.push({ key: "ageGroup", label });
    }
    return chips;
  }, [applied.period, applied.selection, includeAgeGroup]);

  function applyDraft(draft) {
    const next = prepareBhcReportPeriod(draft);
    if (Object.keys(next.errors || {}).length) return false;
    const ageGroup = includeAgeGroup
      ? normalizeNutritionAgeGroup(draft.ageGroup)
      : "all";
    onApply({
      selection: { ...next.selection, ageGroup },
      period: next.period,
    });
  }

  function resetDefaults() {
    const next = prepareBhcReportPeriod({ preset: "monthly", from: "", to: "" });
    onApply({
      selection: { ...next.selection, ageGroup: "all" },
      period: next.period,
    });
  }

  function removeFilter(key) {
    if (key === "ageGroup") {
      onApply({
        selection: { ...applied.selection, ageGroup: "all" },
        period: applied.period,
      });
      return;
    }
    const next = prepareBhcReportPeriod({
      preset: "monthly",
      from: "",
      to: "",
    });
    onApply({
      selection: {
        ...next.selection,
        ageGroup: includeAgeGroup
          ? normalizeNutritionAgeGroup(applied.selection.ageGroup)
          : "all",
      },
      period: next.period,
    });
  }

  return (
    <ListFilterPopover
      fields={fields}
      applied={{
        ...applied.selection,
        ageGroup: normalizeNutritionAgeGroup(applied.selection.ageGroup),
      }}
      activeFilters={activeFilters}
      activeCount={activeFilters.length}
      ariaLabel="Filters"
      onApply={applyDraft}
      onRemoveFilter={(key) => removeFilter(key)}
      onClearAll={resetDefaults}
      pickValues={(selection) =>
        pickFilterValues(
          {
            preset: selection.preset || "monthly",
            from: selection.from || "",
            to: selection.to || "",
            ageGroup: normalizeNutritionAgeGroup(selection.ageGroup),
          },
          fields,
        )
      }
      buildDefaults={() =>
        pickFilterValues(
          { preset: "monthly", from: "", to: "", ageGroup: "all" },
          fields,
        )
      }
      isDefault={(draft) =>
        draft.preset === "monthly"
        && !draft.from
        && !draft.to
        && (!includeAgeGroup || normalizeNutritionAgeGroup(draft.ageGroup) === "all")
      }
    />
  );
}
