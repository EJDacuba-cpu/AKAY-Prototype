import { normalizeDate } from "./followUpStatusStyles.jsx";

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getWeekStart(date) {
  const day = startOfDay(date);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

export function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
}

export function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

export function addWeeks(date, amount) {
  return addDays(date, amount * 7);
}

export function addMonths(date, amount) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

export function isSameDay(a, b) {
  return normalizeDate(a) === normalizeDate(b);
}

/**
 * Buckets tasks by day (YYYY-MM-DD). Each day's tasks are split into
 * `timed` (has dueTime, sorted ascending) and `untimed` (auto-generated
 * tasks have no dueTime — never fabricate one, just group them separately).
 */
export function groupTasksByDay(tasks) {
  const byDay = new Map();

  for (const task of tasks) {
    const dayKey = normalizeDate(task.dueDate);
    if (!dayKey) continue;

    if (!byDay.has(dayKey)) byDay.set(dayKey, { timed: [], untimed: [] });
    const bucket = byDay.get(dayKey);

    if (task.dueTime) bucket.timed.push(task);
    else bucket.untimed.push(task);
  }

  for (const bucket of byDay.values()) {
    bucket.timed.sort((a, b) => a.dueTime.localeCompare(b.dueTime));
  }

  return byDay;
}

export function getTasksForDay(groupedByDay, date) {
  return groupedByDay.get(normalizeDate(date)) || { timed: [], untimed: [] };
}

export function getMonthGridDays(monthDate) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = getWeekStart(firstOfMonth);

  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function formatWeekRangeLabel(weekStart, weekEnd) {
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const startLabel = weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const endLabel = weekEnd.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "long",
    day: "numeric",
    year: "numeric",
  });

  return `${startLabel} – ${endLabel}`;
}

export function formatMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatDayHeaderLabel(date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function toDateInputValue(date) {
  return normalizeDate(date);
}
