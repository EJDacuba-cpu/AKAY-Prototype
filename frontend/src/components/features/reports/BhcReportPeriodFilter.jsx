import { useState } from "react";
import { Button } from "../../ui/button";
import { DatePickerField } from "../../common/forms/DatePickerField";
import { PERIOD_PRESETS } from "../../../utils/bhcReporting";
import { prepareBhcReportPeriod } from "../../../utils/bhcReportPeriodFilter";
import { formatLongDate } from "../../../utils/formatters";
import "./report-period-controls.css";

const DATE_FIELDS = [{ key: "from", label: "From" }, { key: "to", label: "To" }];

export default function BhcReportPeriodFilter({ applied, onApply }) {
  const [draft, setDraft] = useState(applied.selection);
  const [errors, setErrors] = useState({});
  const isCustom = draft.preset === "custom";
  const presetPeriod = isCustom ? null : prepareBhcReportPeriod(draft).period;
  const dateValues = isCustom
    ? { from: draft.from, to: draft.to }
    : { from: presetPeriod.start, to: presetPeriod.end };
  const hasChanges = ["preset", "from", "to"].some((key) => draft[key] !== applied.selection[key]);

  function resetChanges() {
    setDraft({ ...applied.selection });
    setErrors({});
  }

  function changeDraft(key, value) {
    if (key === "preset") {
      setDraft((current) => ({
        ...current,
        preset: value,
        ...(value === "custom" ? dateValues : {}),
      }));
    } else {
      setDraft({ preset: "custom", ...dateValues, [key]: value });
    }
    setErrors({});
  }

  function applyDraft(event) {
    event.preventDefault();
    const next = prepareBhcReportPeriod(draft);
    setErrors(next.errors);
    if (Object.keys(next.errors).length) return;
    onApply({ selection: next.selection, period: next.period });
    setDraft(next.selection);
  }

  return (
    <div className="no-print">
      <form
        aria-label="Reporting period"
        onSubmit={applyDraft}
        className="report-period-controls"
      >
        <div className="report-period-grid">
          <fieldset className="report-period-presets space-y-2">
            <legend className="text-xs font-medium text-neutral-600">Reporting period</legend>
            <div className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full p-1">
              {PERIOD_PRESETS.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  variant="ghost"
                  size="compact"
                  aria-pressed={draft.preset === item.value}
                  onClick={() => changeDraft("preset", item.value)}
                  className={"rounded-full " + (draft.preset === item.value
                    ? "bg-white text-ink-900 shadow-xs hover:bg-white"
                    : "text-neutral-600")}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            {errors.preset && <p role="alert" className="text-xs text-alert-600">{errors.preset}</p>}
          </fieldset>
          <div className="report-period-range">
            {DATE_FIELDS.map((field) => (
              <div
                key={field.key}
                title={dateValues[field.key] ? formatLongDate(dateValues[field.key]) : undefined}
                className="report-period-date [&_button[name]]:gap-2 [&_label]:text-xs [&_label]:font-medium [&_label]:tracking-normal [&_label]:normal-case"
              >
                <DatePickerField
                  label={field.label}
                  name={"report-filter-" + field.key}
                  value={dateValues[field.key]}
                  onChange={(value) => changeDraft(field.key, value)}
                  error={isCustom ? errors[field.key] : undefined}
                  min={field.key === "to" ? dateValues.from : undefined}
                  placeholder="Select date"
                  disableFuture
                />
              </div>
            ))}
          </div>
        </div>
        <div className="report-period-footer">
          <p className="report-period-summary" aria-live="polite">
            <span className="font-medium">Showing: </span>
            {formatLongDate(applied.period.start)} &ndash; {formatLongDate(applied.period.end)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="secondary" size="compact" onClick={resetChanges} disabled={!hasChanges}>
              Reset changes
            </Button>
            <Button type="submit" variant="brand" size="compact">Apply</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
