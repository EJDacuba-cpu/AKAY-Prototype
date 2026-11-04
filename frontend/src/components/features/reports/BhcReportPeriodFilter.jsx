import { useMemo } from "react";
import ListFilterPopover, {
  pickFilterValues,
} from "../../common/filters/ListFilterPopover";
import { PERIOD_PRESETS } from "../../../utils/bhcReporting";
import { prepareBhcReportPeriod } from "../../../utils/bhcReportPeriodFilter";

const PERIOD_FIELDS = [
  {
    key: "preset",
    label: "Reporting period",
    resetValue: "monthly",
    options: PERIOD_PRESETS.map((item) => ({
      value: item.value,
      label: item.value === "custom" ? "Custom Date Range" : item.label,
    })),
    type: "datePresets",
    presets: PERIOD_PRESETS.map((item) => ({
      value: item.value,
      label: item.value === "custom" ? "Custom Date Range" : item.label,
    })),
    dateFromKey: "from",
    dateToKey: "to",
    customValue: "custom",
    fullWidth: true,
  },
];

function periodChipLabel(selection, period) {
  if (selection.preset === "weekly") return "Period: Weekly";
  if (selection.preset === "monthly") return "Period: Monthly";
  if (selection.preset === "custom") {
    return period?.label
      ? `Period: ${period.label}`
      : "Period: Custom Date Range";
  }
  return `Period: ${period?.label || selection.preset}`;
}

export default function BhcReportPeriodFilter({ applied, onApply }) {
  const activeFilters = useMemo(() => {
    if (applied.selection.preset === "monthly") return [];
    return [
      {
        key: "preset",
        label: periodChipLabel(applied.selection, applied.period),
      },
    ];
  }, [applied.period, applied.selection]);

  function applyDraft(draft) {
    const next = prepareBhcReportPeriod(draft);
    if (Object.keys(next.errors || {}).length) return false;
    onApply({ selection: next.selection, period: next.period });
  }

  function resetToMonthly() {
    const next = prepareBhcReportPeriod({ preset: "monthly", from: "", to: "" });
    onApply({ selection: next.selection, period: next.period });
  }

  return (
    <ListFilterPopover
      fields={PERIOD_FIELDS}
      applied={applied.selection}
      activeFilters={activeFilters}
      activeCount={activeFilters.length}
      ariaLabel="Filters"
      onApply={applyDraft}
      onRemoveFilter={() => resetToMonthly()}
      onClearAll={resetToMonthly}
      pickValues={(selection) =>
        pickFilterValues(
          {
            preset: selection.preset || "monthly",
            from: selection.from || "",
            to: selection.to || "",
          },
          PERIOD_FIELDS,
        )
      }
      buildDefaults={() =>
        pickFilterValues({ preset: "monthly", from: "", to: "" }, PERIOD_FIELDS)
      }
      isDefault={(draft) =>
        draft.preset === "monthly" && !draft.from && !draft.to
      }
    />
  );
}
