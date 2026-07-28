import {
  WEEKDAY_LABELS,
  getMonthGridDays,
  getTasksForDay,
  isSameDay,
} from "./followUpCalendarUtils.js";

export default function FollowUpMonthMiniCalendar({ monthDate, groupedByDay, onSelectDay }) {
  const gridDays = getMonthGridDays(monthDate);

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
        {gridDays.map((day) => {
          const inMonth = day.getMonth() === monthDate.getMonth();
          const isToday = isSameDay(day, new Date());
          const bucket = getTasksForDay(groupedByDay, day);
          const count = bucket.timed.length + bucket.untimed.length;
          const dots = Math.min(count, 4);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay?.(day)}
              className={`flex aspect-square flex-col items-center gap-1 border-b border-r border-[#F1F5F9] py-2 text-left transition-colors last:border-r-0 hover:bg-red-50/30 ${
                isToday ? "bg-red-50/60" : inMonth ? "bg-white" : "bg-[#FAFBFC]"
              }`}
            >
              <span
                className={`text-[11.5px] font-semibold ${
                  isToday ? "text-[#B91C1C]" : inMonth ? "text-[#0F172A]" : "text-[#CBD5E1]"
                }`}
              >
                {day.getDate()}
              </span>

              {count > 0 && (
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: dots }).map((_, index) => (
                    <span
                      key={index}
                      className="h-1.5 w-1.5 rounded-full bg-[#B91C1C]"
                    />
                  ))}
                  {count > dots && (
                    <span className="text-[9px] font-bold text-[#B91C1C]">+{count - dots}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
