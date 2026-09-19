import {
  WEEKDAY_LABELS,
  getMonthGridDays,
  getTasksForDay,
  isSameDay,
} from "./followUpCalendarUtils.js";
import FollowUpEventCard from "./FollowUpEventCard";

const VISIBLE_EVENTS_PER_CELL = 2;

export default function FollowUpMonthCalendar({
  monthDate,
  groupedByDay,
  onSelectDay,
  onTaskClick,
  onRecordVisit,
  onReschedule,
  onCancel,
  onViewRecord,
}) {
  const gridDays = getMonthGridDays(monthDate);
  const cardHandlers = {
    onClick: onTaskClick,
    onRecordVisit,
    onReschedule,
    onCancel,
    onViewRecord,
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
      <div className="grid grid-cols-7 border-b border-[#F1F5F9] bg-[#F8FAFC]">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {gridDays.map((day, index) => {
          const inMonth = day.getMonth() === monthDate.getMonth();
          const isToday = isSameDay(day, new Date());
          const bucket = getTasksForDay(groupedByDay, day);
          const dayTasks = [...bucket.untimed, ...bucket.timed];
          const hiddenCount = dayTasks.length - VISIBLE_EVENTS_PER_CELL;
          const lastInRow = index % 7 === 6;

          return (
            <div
              key={day.toISOString()}
              className={`flex min-h-[64px] min-w-0 flex-col gap-1 border-b border-[#F1F5F9] p-1 sm:p-1.5 md:min-h-[112px] ${
                lastInRow ? "" : "border-r"
              } ${isToday ? "bg-red-50/40" : inMonth ? "bg-white" : "bg-[#FAFBFC]"}`}
            >
              <button
                type="button"
                onClick={() => onSelectDay?.(day)}
                aria-label={`Open ${day.toDateString()} in Day view`}
                className={`flex h-6 w-6 flex-none items-center justify-center self-center rounded-full text-[11.5px] font-semibold transition-colors md:self-start ${
                  isToday
                    ? "bg-[#B91C1C] text-white"
                    : inMonth
                      ? "text-[#0F172A] hover:bg-red-50 hover:text-[#B91C1C]"
                      : "text-[#CBD5E1] hover:bg-[#F1F5F9]"
                }`}
              >
                {day.getDate()}
              </button>

              {dayTasks.length > 0 && (
                <>
                  {/* Narrow screens: a count marker, tap through to Day view. */}
                  <button
                    type="button"
                    onClick={() => onSelectDay?.(day)}
                    className="flex items-center justify-center gap-0.5 md:hidden"
                    aria-label={`${dayTasks.length} follow-up${dayTasks.length === 1 ? "" : "s"}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#B91C1C]" />
                    {dayTasks.length > 1 && (
                      <span className="text-[9px] font-bold text-[#B91C1C]">
                        {dayTasks.length}
                      </span>
                    )}
                  </button>

                  <div className="hidden min-w-0 space-y-1 md:block">
                    {dayTasks.slice(0, VISIBLE_EVENTS_PER_CELL).map((task) => (
                      <FollowUpEventCard
                        key={task.id}
                        task={task}
                        dense
                        {...cardHandlers}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onSelectDay?.(day)}
                        className="w-full rounded px-1 py-0.5 text-left text-[10px] font-bold text-[#B91C1C] hover:bg-red-50"
                      >
                        +{hiddenCount} more
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
