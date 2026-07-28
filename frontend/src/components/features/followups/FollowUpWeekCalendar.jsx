import {
  WEEKDAY_LABELS,
  getTasksForDay,
  getWeekDays,
  isSameDay,
} from "./followUpCalendarUtils.js";
import FollowUpEventCard from "./FollowUpEventCard";
import FollowUpDayView from "./FollowUpDayView";

export default function FollowUpWeekCalendar({
  weekStart,
  groupedByDay,
  onTaskClick,
  onRecordVisit,
  onReschedule,
}) {
  const weekDays = getWeekDays(weekStart);

  return (
    <>
      {/* Desktop: 7-column week grid */}
      <div className="hidden overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white md:block">
        <div className="grid min-w-[900px] grid-cols-7 divide-x divide-[#F1F5F9]">
          {weekDays.map((day) => {
            const isToday = isSameDay(day, new Date());
            const bucket = getTasksForDay(groupedByDay, day);
            const hasTasks = bucket.timed.length > 0 || bucket.untimed.length > 0;

            return (
              <div key={day.toISOString()} className="flex min-h-[420px] flex-col">
                <div
                  className={`sticky top-0 border-b border-[#F1F5F9] px-2.5 py-2.5 text-center ${
                    isToday ? "bg-red-50/50" : "bg-[#F8FAFC]"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    {WEEKDAY_LABELS[day.getDay()]}
                  </p>
                  <p
                    className={`text-[13px] font-bold ${
                      isToday ? "text-[#B91C1C]" : "text-[#0F172A]"
                    }`}
                  >
                    {day.getDate()}
                  </p>
                </div>

                <div className="flex-1 space-y-1.5 p-2">
                  {bucket.untimed.map((task) => (
                    <FollowUpEventCard
                      key={task.id}
                      task={task}
                      dense
                      onClick={onTaskClick}
                      onRecordVisit={onRecordVisit}
                      onReschedule={onReschedule}
                    />
                  ))}
                  {bucket.timed.map((task) => (
                    <FollowUpEventCard
                      key={task.id}
                      task={task}
                      dense
                      onClick={onTaskClick}
                      onRecordVisit={onRecordVisit}
                      onReschedule={onReschedule}
                    />
                  ))}

                  {!hasTasks && (
                    <p className="py-6 text-center text-[10px] font-medium text-[#CBD5E1]">
                      No scheduled visits
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: stacked day agenda */}
      <div className="space-y-3 md:hidden">
        {weekDays.map((day) => (
          <FollowUpDayView
            key={day.toISOString()}
            date={day}
            tasksForDay={getTasksForDay(groupedByDay, day)}
            onTaskClick={onTaskClick}
            onRecordVisit={onRecordVisit}
            onReschedule={onReschedule}
          />
        ))}
      </div>
    </>
  );
}
