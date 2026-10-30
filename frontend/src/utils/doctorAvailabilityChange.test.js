import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAvailabilityChange,
  validateAvailabilityChange,
} from "./doctorAvailabilityChange.js";

const TODAY = "2026-10-22";

const unavailable = {
  doctorId: "7",
  status: "Unavailable",
  untilFurtherNotice: false,
  date: "2026-10-28",
  allDay: true,
  startTime: "09:00",
  endTime: "12:00",
};

test("a doctor is always required", () => {
  assert.deepEqual(validateAvailabilityChange({ ...unavailable, doctorId: "" }, { today: TODAY }), {
    doctorId: "Choose a doctor.",
  });
});

test("Available needs only a doctor: no date or time rules apply", () => {
  const form = { ...unavailable, status: "Available", date: "", allDay: false, startTime: "", endTime: "" };
  assert.deepEqual(validateAvailabilityChange(form, { today: TODAY }), {});
});

test("a dated absence needs a date that is not in the past", () => {
  assert.equal(
    validateAvailabilityChange({ ...unavailable, date: "" }, { today: TODAY }).date,
    "Choose a date.",
  );
  assert.equal(
    validateAvailabilityChange({ ...unavailable, date: "2026-10-21" }, { today: TODAY }).date,
    "Past dates can't be scheduled.",
  );
  assert.deepEqual(validateAvailabilityChange({ ...unavailable, date: TODAY }, { today: TODAY }), {});
});

test("a time range needs both times and an end after the start", () => {
  const timed = { ...unavailable, allDay: false };
  assert.deepEqual(validateAvailabilityChange(timed, { today: TODAY }), {});
  assert.equal(
    validateAvailabilityChange({ ...timed, startTime: "" }, { today: TODAY }).time,
    "Choose start and end times.",
  );
  assert.equal(
    validateAvailabilityChange({ ...timed, startTime: "12:00", endTime: "09:00" }, { today: TODAY }).time,
    "End time must be after the start time.",
  );
});

test("until further notice skips the date and time rules", () => {
  const form = { ...unavailable, untilFurtherNotice: true, date: "", allDay: false, startTime: "", endTime: "" };
  assert.deepEqual(validateAvailabilityChange(form, { today: TODAY }), {});
});

test("buildAvailabilityChange picks the write that matches the choice", () => {
  assert.deepEqual(buildAvailabilityChange({ ...unavailable, status: "Available" }), {
    kind: "confirm_available",
    doctorId: "7",
    notes: null,
  });
  assert.deepEqual(buildAvailabilityChange({ ...unavailable, untilFurtherNotice: true }), {
    kind: "mark_unavailable",
    doctorId: "7",
    notes: null,
  });
  assert.deepEqual(buildAvailabilityChange(unavailable), {
    kind: "schedule_absence",
    doctorId: "7",
    absence: { localDate: "2026-10-28", allDay: true, startTime: null, endTime: null },
    notes: null,
  });
  assert.deepEqual(buildAvailabilityChange({ ...unavailable, allDay: false }).absence, {
    localDate: "2026-10-28",
    allDay: false,
    startTime: "09:00",
    endTime: "12:00",
  });
});

test("notes ride along only for Unavailable and only when provided", () => {
  const notes = { remarks: "Call ahead", internalNotes: "", expectedAvailableAt: null };
  assert.deepEqual(buildAvailabilityChange(unavailable, notes).notes, notes);
  assert.equal(buildAvailabilityChange({ ...unavailable, status: "Available" }, notes).notes, null);
});
