import { memo, useCallback, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";

// DOH Form 4b dose-cell legend. A day cell holds either a supervised-dose mark
// (the Tx supporter's 3-letter initials) or one of these administrative codes.
export const DOSE_CELL_LEGEND = [
  { code: "abc", meaning: "Tx supporter initials — supervised dose taken" },
  { code: "X", meaning: "Drug not taken / absent" },
  { code: "I", meaning: "Incomplete regimen" },
  { code: "HOLD", meaning: "On hold" },
  { code: "[ ]", meaning: "Drugs dispensed to patient / supporter" },
  { code: "//", meaning: "Shift to continuation phase" },
];

const DAYS_IN_MONTH = 31;
const MAX_MONTHS = 13;

// Codes that are NOT an administered supervised dose.
const NON_DOSE_MARKERS = new Set(["X", "HOLD", "I", "//"]);

function isDoseCell(value) {
  const clean = String(value || "").trim().toUpperCase();
  if (!clean) return false;
  if (NON_DOSE_MARKERS.has(clean)) return false;
  return true;
}

function isScheduledCell(value) {
  return String(value || "").trim() !== "";
}

export function createEmptyMonth(monthIndex = 0) {
  return {
    monthIndex,
    label: "",
    days: Array.from({ length: DAYS_IN_MONTH }, () => ""),
    monthlyTotal: 0,
    cumulativeDoses: 0,
    monthlyPercent: 0,
    weightKg: "",
    heightCm: "",
  };
}

// Pad/repair a month so days is always exactly DAYS_IN_MONTH strings.
export function normalizeMonth(month = {}, fallbackIndex = 0) {
  const base = createEmptyMonth(
    Number.isFinite(month.monthIndex) ? month.monthIndex : fallbackIndex,
  );
  const days = Array.isArray(month.days) ? month.days : [];
  return {
    ...base,
    ...month,
    monthIndex: base.monthIndex,
    days: Array.from({ length: DAYS_IN_MONTH }, (_, i) =>
      typeof days[i] === "string" ? days[i] : String(days[i] ?? ""),
    ),
    weightKg: month.weightKg ?? "",
    heightCm: month.heightCm ?? "",
  };
}

// Recompute monthly totals, running cumulative doses, and overall adherence.
// Pure — returns a fresh doseCalendar object.
export function recomputeCalendar(months = []) {
  let cumulative = 0;
  let totalDoses = 0;
  let totalScheduled = 0;

  const nextMonths = months.map((month, index) => {
    const normalized = normalizeMonth(month, index);
    const monthlyTotal = normalized.days.reduce(
      (sum, cell) => sum + (isDoseCell(cell) ? 1 : 0),
      0,
    );
    const scheduled = normalized.days.reduce(
      (sum, cell) => sum + (isScheduledCell(cell) ? 1 : 0),
      0,
    );
    cumulative += monthlyTotal;
    totalDoses += monthlyTotal;
    totalScheduled += scheduled;

    return {
      ...normalized,
      monthlyTotal,
      cumulativeDoses: cumulative,
      monthlyPercent: scheduled
        ? Math.round((monthlyTotal / scheduled) * 100)
        : 0,
    };
  });

  return {
    months: nextMonths,
    adherencePercent: totalScheduled
      ? Math.round((totalDoses / totalScheduled) * 100)
      : 0,
  };
}

const DAY_HEADERS = Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1);

const cellInputClass =
  "h-8 w-full min-w-[2.1rem] rounded border border-[#E5E7EB] bg-white px-0.5 text-center text-[11px] font-semibold uppercase text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]/20";

const computedCellClass =
  "px-2 py-1 text-center text-[11px] font-bold text-[#334155]";

const MonthRow = memo(function MonthRow({
  month,
  index,
  readOnly,
  onDayChange,
  onFieldChange,
  onRemove,
  canRemove,
}) {
  return (
    <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
      <td className="sticky left-0 z-10 bg-white px-2 py-1 align-middle">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-red-50 text-[10px] font-bold text-[#B91C1C]">
            {index}
          </span>
          <input
            type="text"
            value={month.label}
            readOnly={readOnly}
            maxLength={12}
            placeholder="MMM-YY"
            onChange={(e) => onFieldChange(index, "label", e.target.value)}
            className="h-8 w-[68px] rounded border border-[#E5E7EB] bg-white px-1.5 text-center text-[11px] font-semibold uppercase text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]/20"
            aria-label={`Month ${index} label`}
          />
        </div>
      </td>
      {month.days.map((cell, dayIdx) => (
        <td key={dayIdx} className="px-0.5 py-1">
          <input
            type="text"
            value={cell}
            readOnly={readOnly}
            maxLength={4}
            onChange={(e) => onDayChange(index, dayIdx, e.target.value)}
            className={cellInputClass}
            aria-label={`Month ${index} day ${dayIdx + 1}`}
          />
        </td>
      ))}
      <td className={computedCellClass}>{month.monthlyTotal}</td>
      <td className={computedCellClass}>{month.cumulativeDoses}</td>
      <td className={computedCellClass}>{month.monthlyPercent}%</td>
      <td className="px-1 py-1">
        <input
          type="text"
          value={month.weightKg}
          readOnly={readOnly}
          maxLength={6}
          onChange={(e) => onFieldChange(index, "weightKg", e.target.value)}
          className="h-8 w-[52px] rounded border border-[#E5E7EB] bg-white px-1 text-center text-[11px] font-semibold text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]/20"
          aria-label={`Month ${index} weight`}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="text"
          value={month.heightCm}
          readOnly={readOnly}
          maxLength={6}
          onChange={(e) => onFieldChange(index, "heightCm", e.target.value)}
          className="h-8 w-[52px] rounded border border-[#E5E7EB] bg-white px-1 text-center text-[11px] font-semibold text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]/20"
          aria-label={`Month ${index} height`}
        />
      </td>
      {!readOnly && (
        <td className="px-1 py-1">
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={!canRemove}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Remove month ${index}`}
          >
            <Trash2 size={14} />
          </button>
        </td>
      )}
    </tr>
  );
});

/**
 * Faithful digital rendering of the DOH Form 4b "Administration of Drugs"
 * dose calendar: rows are treatment months (0..12), columns are days 1..31,
 * each cell a supervised-dose mark. Monthly totals, cumulative doses, monthly %
 * and overall adherence auto-compute. Controlled — the parent owns state.
 */
export default function TbDoseCalendar({ value, onChange, readOnly = false }) {
  const months = useMemo(
    () => (Array.isArray(value?.months) ? value.months : []),
    [value],
  );
  const adherencePercent = value?.adherencePercent ?? 0;

  const emit = useCallback(
    (nextMonths) => onChange(recomputeCalendar(nextMonths)),
    [onChange],
  );

  const handleDayChange = useCallback(
    (monthIndex, dayIndex, raw) => {
      const cellValue = raw.toUpperCase().slice(0, 4);
      const next = months.map((month, i) => {
        if (i !== monthIndex) return month;
        const days = [...(month.days || [])];
        days[dayIndex] = cellValue;
        return { ...month, days };
      });
      emit(next);
    },
    [months, emit],
  );

  const handleFieldChange = useCallback(
    (monthIndex, field, raw) => {
      const next = months.map((month, i) =>
        i === monthIndex ? { ...month, [field]: raw } : month,
      );
      emit(next);
    },
    [months, emit],
  );

  const handleAddMonth = useCallback(() => {
    if (months.length >= MAX_MONTHS) return;
    emit([...months, createEmptyMonth(months.length)]);
  }, [months, emit]);

  const handleRemoveMonth = useCallback(
    (monthIndex) => {
      emit(months.filter((_, i) => i !== monthIndex));
    },
    [months, emit],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-medium text-slate-500">
          {DOSE_CELL_LEGEND.map((item) => (
            <span key={item.code} className="inline-flex items-center gap-1">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700">
                {item.code}
              </span>
              {item.meaning}
            </span>
          ))}
        </div>
        <div className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-[#B91C1C]">
          Overall Adherence: {adherencePercent}%
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left">
                Month
              </th>
              {DAY_HEADERS.map((day) => (
                <th key={day} className="px-0.5 py-2 text-center font-bold">
                  {day}
                </th>
              ))}
              <th className="px-2 py-2 text-center">Total</th>
              <th className="px-2 py-2 text-center">Cum.</th>
              <th className="px-2 py-2 text-center">%</th>
              <th className="px-2 py-2 text-center">Wt(kg)</th>
              <th className="px-2 py-2 text-center">Ht(cm)</th>
              {!readOnly && <th className="px-1 py-2" />}
            </tr>
          </thead>
          <tbody>
            {months.length === 0 ? (
              <tr>
                <td
                  colSpan={DAYS_IN_MONTH + 7}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  No treatment months yet. Add the first month to begin tracking
                  supervised doses.
                </td>
              </tr>
            ) : (
              months.map((month, index) => (
                <MonthRow
                  key={index}
                  month={normalizeMonth(month, index)}
                  index={index}
                  readOnly={readOnly}
                  onDayChange={handleDayChange}
                  onFieldChange={handleFieldChange}
                  onRemove={handleRemoveMonth}
                  canRemove={months.length > 1}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={handleAddMonth}
          disabled={months.length >= MAX_MONTHS}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#B91C1C] hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={14} />
          Add Treatment Month
        </button>
      )}
    </div>
  );
}
