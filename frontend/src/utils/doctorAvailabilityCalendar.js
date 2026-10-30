export const MANILA_TIMEZONE = "Asia/Manila";
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function manilaDateKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) {
    return value.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIMEZONE }).format(date);
}

export function manilaCalendarDate(value = new Date()) {
  const key = manilaDateKey(value);
  if (!key) return new Date();
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function calendarDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addMonths(date, amount) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

export function formatMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function getMonthGridDays(monthDate) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

export function visibleGridWeeks(monthDate) {
  const days = getMonthGridDays(monthDate);
  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    const week = days.slice(index, index + 7);
    if (week.some((day) => day.getMonth() === monthDate.getMonth())) weeks.push(week);
  }
  return weeks;
}

export function formatLongDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return "";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function monthRange(monthDate) {
  const year = monthDate.getFullYear();
  const month = String(monthDate.getMonth() + 1).padStart(2, "0");
  const last = new Date(year, monthDate.getMonth() + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(last).padStart(2, "0")}`,
  };
}

export function groupUnavailabilityByDay(rows = []) {
  const byDay = new Map();
  for (const row of rows) {
    const key = row.localDate || row.local_date;
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(row);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => String(a.startTime || a.start_time || "").localeCompare(String(b.startTime || b.start_time || "")));
  }
  return byDay;
}

export function formatUnavailabilityLabel(row) {
  if (row?.allDay || row?.all_day) return "All day";
  const start = row?.startTime || row?.start_time;
  const end = row?.endTime || row?.end_time;
  if (start && end) return `${formatClock(start)} – ${formatClock(end)}`;
  return "Unavailable";
}

export function unavailabilityChipLabel(row, { showDoctor = false } = {}) {
  const label = formatUnavailabilityLabel(row);
  return showDoctor && row?.doctorName ? `${row.doctorName} · ${label}` : label;
}

export function calendarCellLabel(key, rows = []) {
  const count = rows.length;
  const summary = count === 0 ? "no absences" : `${count} ${count === 1 ? "absence" : "absences"}`;
  return `${formatLongDate(key)}, ${summary}`;
}

function formatClock(value) {
  const [hour, minute] = String(value).split(":");
  const numeric = Number(hour);
  const suffix = numeric >= 12 ? "PM" : "AM";
  const twelve = numeric % 12 || 12;
  return `${twelve}:${minute} ${suffix}`;
}
