import ListFilterPopover, {
  pickFilterValues,
  isDraftDefault,
} from "../../common/filters/ListFilterPopover";
import SearchField from "../../common/filters/SearchField";
import SearchFilterCluster from "../../common/filters/SearchFilterCluster";

const CALENDAR_SPAN_FIELD = {
  key: "calendarSpan",
  label: "Calendar",
  resetValue: "week",
  options: [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ],
  fullWidth: true,
};

function buildFollowUpFields(config, calendar) {
  const mapped = config.map((field) => ({
    ...field,
    options:
      calendar && field.key === "state"
        ? field.options.map((option) =>
            option === "All Active" ? { value: option, label: "All statuses" } : option,
          )
        : field.options,
  }));
  return calendar ? [CALENDAR_SPAN_FIELD, ...mapped] : mapped;
}

function pickFollowUpValues(applied, fields, filters, calendarSpan) {
  const base = pickFilterValues(
    {
      ...filters,
      calendarSpan,
    },
    fields,
  );
  return base;
}

export default function FollowUpToolbar({
  filters,
  config,
  activeFilters,
  calendar,
  calendarSpan = "week",
  onSearch,
  onApply,
  onRemove,
  onClear,
}) {
  const fields = buildFollowUpFields(config, calendar);
  const applied = calendar
    ? { serviceType: filters.serviceType, state: filters.state, calendarSpan }
    : { serviceType: filters.serviceType, state: filters.state };

  return (
    <div className="followup-modern-toolbar">
      <div className="followup-heading">
        <h1 className="text-[17px] font-bold tracking-tight text-ink-800">
          Follow-up Worklist
        </h1>
        <p className="mt-1 text-[13px] text-neutral-600">
          Review return visits, track due dates, and manage follow-up actions.
        </p>
      </div>
      <div className="followup-search-controls min-w-0 justify-self-end">
        <SearchFilterCluster
          search={
            <SearchField
              value={filters.search}
              onChange={onSearch}
              placeholder="Search patient or record..."
              label="Search follow-ups"
            />
          }
          filter={
            <ListFilterPopover
              fields={fields}
              applied={applied}
              activeFilters={activeFilters}
              onApply={onApply}
              onRemoveFilter={onRemove}
              onClearAll={onClear}
              pickValues={(currentApplied, currentFields) =>
                pickFollowUpValues(
                  currentApplied,
                  currentFields,
                  filters,
                  calendarSpan,
                )
              }
              isDefault={(draft, currentFields) =>
                isDraftDefault(draft, currentFields)
              }
              buildDefaults={(currentFields) =>
                pickFilterValues(
                  calendar
                    ? {
                        serviceType: "",
                        state: "All Active",
                        calendarSpan: "week",
                      }
                    : { serviceType: "", state: "All Active" },
                  currentFields,
                )
              }
            />
          }
        />
      </div>
    </div>
  );
}
