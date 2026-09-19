import {
  WEEKDAY_LABELS,
  getTasksForDay,
  getWeekDays,
  isSameDay,
} from "./followUpCalendarUtils.js";
import FollowUpEventCard from "./FollowUpEventCard";

export default function FollowUpWeekCalendar({
  weekStart,
  groupedByDay,
  onTaskClick,
  onRecordVisit,
  onReschedule,
  onCancel,
  onViewRecord,
}) {
  const weekDays = getWeekDays(weekStart);
  const cardHandlers = {
    onClick: onTaskClick,
    onRecordVisit,
    onReschedule,
    onCancel,
    onViewRecord,
  };

  // Seven columns stay seven columns on every screen: narrow viewports scroll
  // sideways instead of squeezing each day until the cards are unreadable.
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
      <div className="grid min-w-[840px] grid-cols-7 divide-x divide-[#F1F5F9]">
        {weekDays.map((day) => {
          const isToday = isSameDay(day, new Date());
          const bucket = getTasksForDay(groupedByDay, day);
          const hasTasks = bucket.timed.length > 0 || bucket.untimed.length > 0;

          return (
            <div
              key={day.toISOString()}
              className={`flex min-h-[420px] flex-col ${isToday ? "bg-red-50/20" : ""}`}
            >
              <div
                className={`border-b border-[#F1F5F9] px-2.5 py-2.5 text-center ${
                  isToday ? "bg-red-50/60" : "bg-[#F8FAFC]"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  {WEEKDAY_LABELS[day.getDay()]}
                </p>
                <p
                  className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold ${
                    isToday ? "bg-[#B91C1C] text-white" : "text-[#0F172A]"
                  }`}
                >
                  {day.getDate()}
                </p>
              </div>

              <div className="flex-1 space-y-1.5 p-2">
                {bucket.untimed.map((task) => (
                  <FollowUpEventCard key={task.id} task={task} dense {...cardHandlers} />
                ))}
                {bucket.timed.map((task) => (
                  <FollowUpEventCard key={task.id} task={task} dense {...cardHandlers} />
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
  );
}
