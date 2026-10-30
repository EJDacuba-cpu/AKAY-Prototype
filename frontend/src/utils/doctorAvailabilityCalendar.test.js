import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarCellLabel,
  calendarDateKey,
  formatLongDate,
  formatUnavailabilityLabel,
  getMonthGridDays,
  groupUnavailabilityByDay,
  manilaCalendarDate,
  manilaDateKey,
  monthRange,
  unavailabilityChipLabel,
  visibleGridWeeks,
  WEEKDAY_LABELS,
} from "./doctorAvailabilityCalendar.js";

test("manilaDateKey keeps YYYY-MM-DD strings and formats Date values in Asia/Manila", () => {
  assert.equal(manilaDateKey("2026-10-23"), "2026-10-23");
  assert.equal(
    manilaDateKey(new Date("2026-10-22T16:00:00.000Z")),
    "2026-10-23",
  );
});

test("manilaCalendarDate builds a local Date from the Manila calendar day", () => {
  const date = manilaCalendarDate(new Date("2026-10-22T16:00:00.000Z"));
  assert.equal(calendarDateKey(date), "2026-10-23");
});

test("month grid is a Sunday-start 42-cell month", () => {
  assert.deepEqual(WEEKDAY_LABELS, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const october = new Date(2026, 9, 1);
  const days = getMonthGridDays(october);
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 0);
  assert.equal(calendarDateKey(days[0]), "2026-09-27");
  assert.equal(calendarDateKey(days[4]), "2026-10-01");
  assert.deepEqual(monthRange(october), { from: "2026-10-01", to: "2026-10-31" });
});

test("grouping keys calendar cells by local date and labels all-day vs timed windows", () => {
  const grouped = groupUnavailabilityByDay([
    { id: "2", localDate: "2026-10-23", startTime: "13:00" },
    { id: "1", localDate: "2026-10-23", startTime: "09:00" },
    { id: "3", local_date: "2026-10-24", allDay: true },
  ]);
  assert.equal(grouped.get("2026-10-23")[0].id, "1");
  assert.equal(grouped.get("2026-10-24").length, 1);
  assert.equal(formatUnavailabilityLabel({ allDay: true }), "All day");
  assert.equal(
    formatUnavailabilityLabel({ startTime: "09:00", endTime: "12:00" }),
    "9:00 AM – 12:00 PM",
  );
});

test("formatLongDate reads a date key as a weekday date without timezone drift", () => {
  assert.equal(formatLongDate("2026-10-28"), "Wed, Oct 28, 2026");
  assert.equal(formatLongDate(""), "");
});

test("chip label adds the doctor name only when asked", () => {
  const row = { allDay: true, doctorName: "Dr. Reyes" };
  assert.equal(unavailabilityChipLabel(row), "All day");
  assert.equal(unavailabilityChipLabel(row, { showDoctor: true }), "Dr. Reyes · All day");
  assert.equal(
    unavailabilityChipLabel({ allDay: true }, { showDoctor: true }),
    "All day",
  );
});

test("calendar cell label gives the long date and the absence count", () => {
  assert.equal(calendarCellLabel("2026-10-28", []), "Wed, Oct 28, 2026, no absences");
  assert.equal(
    calendarCellLabel("2026-10-28", [{ allDay: true }]),
    "Wed, Oct 28, 2026, 1 absence",
  );
  assert.equal(
    calendarCellLabel("2026-10-28", [{ allDay: true }, { allDay: true }]),
    "Wed, Oct 28, 2026, 2 absences",
  );
});

test("visibleGridWeeks keeps only the weeks that touch the month", () => {
  assert.equal(visibleGridWeeks(new Date(2026, 9, 1)).length, 5);
  assert.equal(visibleGridWeeks(new Date(2026, 7, 1)).length, 6);
  const february = new Date(2026, 1, 1);
  const febWeeks = visibleGridWeeks(february);
  assert.equal(febWeeks.length, 4);
  assert.ok(febWeeks.every((week) => week.length === 7));
});
