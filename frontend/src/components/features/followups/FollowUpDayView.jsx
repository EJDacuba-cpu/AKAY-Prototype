import { Plus } from "lucide-react";
import { formatDayHeaderLabel, isSameDay } from "./followUpCalendarUtils.js";
import FollowUpEventCard from "./FollowUpEventCard";

const DEFAULT_START_HOUR = 3;
const DEFAULT_END_HOUR = 20;

function taskHour(task) {
  const value = String(task.dueTime || task.due_time || "");
  const hour = Number.parseInt(value.slice(0, 2), 10);
  return Number.isFinite(hour) ? hour : null;
}

function hourLabel(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export default function FollowUpDayView({
  date,
  tasksForDay = { timed: [], untimed: [] },
  onTaskClick,
  onRecordVisit,
  onReschedule,
  onSlotClick,
  showHeader = true,
}) {
  const isToday = isSameDay(date, new Date());
  const timedHours = tasksForDay.timed
    .map(taskHour)
    .filter((hour) => hour !== null);
  const startHour = Math.min(DEFAULT_START_HOUR, ...timedHours);
  const endHour = Math.max(DEFAULT_END_HOUR, ...timedHours);
  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, index) => startHour + index,
  );
  const tasksByHour = new Map(
    hours.map((hour) => [
      hour,
      tasksForDay.timed.filter((task) => taskHour(task) === hour),
    ]),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
      {showHeader && (
        <div
          className={`flex items-center justify-between border-b border-[#F1F5F9] px-4 py-3 ${
            isToday ? "bg-red-50/40" : ""
          }`}
        >
          <h3 className="text-[13px] font-bold text-[#0F172A]">
            {formatDayHeaderLabel(date)}
            {isToday && (
              <span className="ml-2 rounded-full bg-[#B91C1C] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                Today
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={() => onSlotClick?.(date)}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#E5E7EB] px-2 text-[11px] font-semibold text-[#64748B] transition-colors hover:border-red-100 hover:bg-red-50/40 hover:text-[#B91C1C]"
          >
            <Plus size={12} />
            Schedule Follow-up
          </button>
        </div>
      )}

      {tasksForDay.untimed.length > 0 && (
        <div className="grid grid-cols-[64px_minmax(0,1fr)] border-b border-[#E5E7EB]">
          <div className="border-r border-[#EEF2F6] bg-[#FAFBFC] px-2 py-3 text-right text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Untimed
          </div>
          <div className="space-y-2 p-3">
            {tasksForDay.untimed.map((task) => (
              <FollowUpEventCard
                key={task.id}
                task={task}
                onClick={onTaskClick}
                onRecordVisit={onRecordVisit}
                onReschedule={onReschedule}
              />
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[680px] overflow-y-auto">
        {hours.map((hour) => {
          const hourTasks = tasksByHour.get(hour) || [];
          return (
            <div
              key={hour}
              className="grid min-h-[72px] grid-cols-[64px_minmax(0,1fr)]"
            >
              <div className="relative border-r border-[#E8EEF3] bg-[#FBFCFD]">
                <span className="absolute right-2 top-0 -translate-y-1/2 bg-[#FBFCFD] px-1 font-mono text-[9px] font-medium text-[#94A3B8]">
                  {hourLabel(hour)}
                </span>
              </div>
              <div className="min-w-0 border-t border-[#EEF2F6] px-3 py-2">
                {hourTasks.length > 0 ? (
                  <div className="grid gap-2 lg:grid-cols-2">
                    {hourTasks.map((task) => (
                      <FollowUpEventCard
                        key={task.id}
                        task={task}
                        onClick={onTaskClick}
                        onRecordVisit={onRecordVisit}
                        onReschedule={onReschedule}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
