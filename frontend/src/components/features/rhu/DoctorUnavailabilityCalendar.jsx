import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Button } from "../../ui/button";
import {
  WEEKDAY_LABELS,
  addMonths,
  calendarCellLabel,
  calendarDateKey,
  formatLongDate,
  formatMonthLabel,
  manilaCalendarDate,
  manilaDateKey,
  unavailabilityChipLabel,
  visibleGridWeeks,
} from "../../../utils/doctorAvailabilityCalendar";

// Two chips fit when cells have room (below xl the grid scrolls with the page;
// on a tall screen the fit-to-screen cells are tall enough). Otherwise one chip
// plus "+N more" keeps a short laptop screen from clipping.
const ROOMY_QUERY = "(max-width: 1279px), (min-height: 880px)";

function useRoomyCells() {
  const [roomy, setRoomy] = useState(
    () => typeof window !== "undefined" && window.matchMedia(ROOMY_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(ROOMY_QUERY);
    const sync = () => setRoomy(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return roomy;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/60";

export default function DoctorUnavailabilityCalendar({
  monthDate,
  groupedByDay,
  scopeLabel,
  showDoctorNames = false,
  canAdd = false,
  onMonthChange,
  onAddAt,
  onOpenDay,
}) {
  const todayKey = manilaDateKey();
  const weeks = visibleGridWeeks(monthDate);
  const chipLimit = useRoomyCells() ? 2 : 1;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-neutral-200 bg-white shadow-card xl:h-full">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h2 className="text-[17px] font-bold leading-tight text-ink-800">{formatMonthLabel(monthDate)}</h2>
          <p className="truncate text-[13px] text-neutral-600">{scopeLabel}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            aria-label="Previous month"
            onClick={() => onMonthChange(addMonths(monthDate, -1))}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button type="button" variant="secondary" size="compact" onClick={() => onMonthChange(manilaCalendarDate())}>
            Today
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            aria-label="Next month"
            onClick={() => onMonthChange(addMonths(monthDate, 1))}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-7 border-b border-neutral-200 bg-neutral-100">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-neutral-600"
          >
            {label}
          </div>
        ))}
      </div>

      <div role="group" aria-label={`${formatMonthLabel(monthDate)} calendar`} className="flex flex-col xl:min-h-0 xl:flex-1">
        {weeks.map((week) => (
          <div key={calendarDateKey(week[0])} className="grid grid-cols-7 xl:min-h-[3rem] xl:flex-1">
            {week.map((day, dayIndex) => {
              const key = calendarDateKey(day);
              const inMonth = day.getMonth() === monthDate.getMonth();
              const isToday = key === todayKey;
              const rows = groupedByDay.get(key) || [];
              const canAddHere = canAdd && key >= todayKey;

              return (
                <div
                  key={key}
                  role="group"
                  aria-label={calendarCellLabel(key, rows)}
                  aria-current={isToday ? "date" : undefined}
                  className={`group relative flex min-h-[64px] min-w-0 flex-col gap-1 border-b border-neutral-100 p-1.5 md:min-h-[88px] xl:min-h-0 xl:gap-0.5 xl:overflow-hidden xl:p-1 ${
                    dayIndex === 6 ? "" : "border-r"
                  } ${inMonth ? "bg-white hover:bg-neutral-50" : "bg-neutral-50"}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full text-[12px] font-semibold md:self-start xl:h-5 xl:w-5 xl:text-[11px] ${
                      isToday ? "bg-brand-600 text-white" : inMonth ? "text-ink-800" : "text-neutral-500"
                    }`}
                  >
                    {day.getDate()}
                  </span>

                  {canAddHere ? (
                    <button
                      type="button"
                      onClick={() => onAddAt(key)}
                      aria-label={`Add availability change for ${formatLongDate(key)}`}
                      className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-800 text-white opacity-0 transition-opacity hover:bg-ink-700 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${FOCUS_RING}`}
                    >
                      <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  ) : null}

                  {rows.length > 0 ? (
                    <span className="hidden min-w-0 md:block">
                      {rows.slice(0, chipLimit).map((row) => (
                        <button
                          type="button"
                          key={row.id}
                          onClick={() => onOpenDay(key)}
                          title={unavailabilityChipLabel(row, { showDoctor: true })}
                          aria-label={`View absence: ${unavailabilityChipLabel(row, { showDoctor: true })}, ${formatLongDate(key)}`}
                          className={`mb-0.5 flex w-full items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-left text-[10px] font-semibold text-ink-800 hover:border-neutral-300 ${FOCUS_RING}`}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
                          <span className="truncate">
                            {unavailabilityChipLabel(row, { showDoctor: showDoctorNames })}
                          </span>
                        </button>
                      ))}
                      {rows.length > chipLimit ? (
                        <button
                          type="button"
                          onClick={() => onOpenDay(key)}
                          className={`rounded text-[10px] font-bold text-neutral-600 hover:underline ${FOCUS_RING}`}
                        >
                          +{rows.length - chipLimit} more
                        </button>
                      ) : null}
                    </span>
                  ) : null}

                  {rows.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOpenDay(key)}
                      aria-label={`View ${rows.length} ${rows.length === 1 ? "absence" : "absences"} on ${formatLongDate(key)}`}
                      className={`flex items-center justify-center gap-0.5 rounded md:hidden ${FOCUS_RING}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />
                      {rows.length > 1 ? (
                        <span className="text-[10px] font-bold text-ink-800" aria-hidden="true">
                          {rows.length}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-neutral-200 px-4 py-2.5 text-[11px] text-neutral-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-3.5 w-5 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100" aria-hidden="true">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
          </span>
          Scheduled absence
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full bg-brand-600" aria-hidden="true" />
          Today
        </span>
        {canAdd ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink-800 text-white" aria-hidden="true">
              <Plus size={10} strokeWidth={3} />
            </span>
            Hover a day to add
          </span>
        ) : null}
      </div>
    </section>
  );
}
