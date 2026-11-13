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

function categoryChipLabel(categoryFilter, value) {
  if (!categoryFilter || !value || value === categoryFilter.defaultValue) return "";
  const match = (categoryFilter.options || []).find((item) => item.key === value);
  return match ? `${categoryFilter.label}: ${match.label}` : "";
}

/**
 * One Filter popover for report pages: reporting period, optional age group
 * (nutrition), and optional TCL/Morbidity category — Apply commits all together.
 */
export default function BhcReportPeriodFilter({
  applied,
  onApply,
  includeAgeGroup = false,
  categoryFilter = null,
}) {
  const categoryKey = categoryFilter?.key || "category";
  const categoryDefault = categoryFilter?.defaultValue;
  const categoryValue = categoryFilter?.value ?? categoryDefault;

  const fields = useMemo(() => {
    const next = [...PERIOD_FIELDS];
    if (categoryFilter) {
      next.push({
        key: categoryFilter.key,
        label: categoryFilter.label,
        resetValue: categoryFilter.defaultValue,
        options: (categoryFilter.options || []).map((item) => ({
          value: item.key,
          label: item.label,
        })),
        fullWidth: true,
      });
    }
    if (includeAgeGroup) next.push(AGE_FIELD);
    return next;
  }, [categoryFilter, includeAgeGroup]);

  const activeFilters = useMemo(() => {
    const chips = [];
    if (applied.selection.preset !== "monthly") {
      chips.push({
        key: "preset",
        label: periodChipLabel(applied.selection, applied.period),
      });
    }
    if (categoryFilter) {
      const label = categoryChipLabel(categoryFilter, categoryValue);
      if (label) chips.push({ key: categoryKey, label });
    }
    if (includeAgeGroup) {
      const ageGroup = normalizeNutritionAgeGroup(applied.selection.ageGroup);
      const label = ageChipLabel(ageGroup);
      if (label) chips.push({ key: "ageGroup", label });
    }
    return chips;
  }, [
    applied.period,
    applied.selection,
    categoryFilter,
    categoryKey,
    categoryValue,
    includeAgeGroup,
  ]);

  function commitPeriod(draft, { ageGroup, category } = {}) {
    const next = prepareBhcReportPeriod(draft);
    if (Object.keys(next.errors || {}).length) return false;
    const resolvedAge = includeAgeGroup
      ? normalizeNutritionAgeGroup(ageGroup ?? draft.ageGroup)
      : "all";
    onApply({
      selection: { ...next.selection, ageGroup: resolvedAge },
      period: next.period,
      ...(categoryFilter
        ? {
            category: (categoryFilter.options || []).some((item) => item.key === category)
              ? category
              : categoryFilter.defaultValue,
          }
        : {}),
    });
    return true;
  }

  function applyDraft(draft) {
    return commitPeriod(draft, {
      ageGroup: draft.ageGroup,
      category: categoryFilter ? draft[categoryKey] : undefined,
    });
  }

  function resetDefaults() {
    commitPeriod(
      { preset: "monthly", from: "", to: "", ageGroup: "all" },
      {
        ageGroup: "all",
        category: categoryFilter?.defaultValue,
      },
    );
  }

  function removeFilter(key) {
    if (key === "ageGroup") {
      commitPeriod(
        {
          preset: applied.selection.preset,
          from: applied.selection.from || "",
          to: applied.selection.to || "",
          ageGroup: "all",
        },
        { ageGroup: "all", category: categoryValue },
      );
      return;
    }
    if (categoryFilter && key === categoryKey) {
      commitPeriod(
        {
          preset: applied.selection.preset,
          from: applied.selection.from || "",
          to: applied.selection.to || "",
          ageGroup: applied.selection.ageGroup,
        },
        { ageGroup: applied.selection.ageGroup, category: categoryFilter.defaultValue },
      );
      return;
    }
    commitPeriod(
      { preset: "monthly", from: "", to: "", ageGroup: applied.selection.ageGroup },
      { ageGroup: applied.selection.ageGroup, category: categoryValue },
    );
  }

  return (
    <ListFilterPopover
      fields={fields}
      applied={{
        ...applied.selection,
        ageGroup: normalizeNutritionAgeGroup(applied.selection.ageGroup),
        ...(categoryFilter ? { [categoryKey]: categoryValue } : {}),
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
            ...(categoryFilter
              ? { [categoryKey]: selection[categoryKey] ?? categoryDefault }
              : {}),
          },
          fields,
        )
      }
      buildDefaults={() =>
        pickFilterValues(
          {
            preset: "monthly",
            from: "",
            to: "",
            ageGroup: "all",
            ...(categoryFilter ? { [categoryKey]: categoryDefault } : {}),
          },
          fields,
        )
      }
      isDefault={(draft) =>
        draft.preset === "monthly"
        && !draft.from
        && !draft.to
        && (!includeAgeGroup || normalizeNutritionAgeGroup(draft.ageGroup) === "all")
        && (!categoryFilter || draft[categoryKey] === categoryDefault)
      }
    />
  );
}
