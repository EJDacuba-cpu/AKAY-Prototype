import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
} from "../services/doctorAvailabilityModel.js";

/**
 * One modal drives three different writes, because the backend keeps two
 * different things: a stored status (confirmed now, no date) and dated
 * absences (RhuProvider::isEffectivelyAvailable reads both).
 *
 *  - Available             -> confirm the stored status; no date or time
 *  - Unavailable + dates   -> a scheduled absence
 *  - Unavailable, no end   -> stored status Unavailable until confirmed again
 */
export const CHANGE_KIND = {
  CONFIRM_AVAILABLE: "confirm_available",
  MARK_UNAVAILABLE: "mark_unavailable",
  SCHEDULE_ABSENCE: "schedule_absence",
};

function isDatedAbsence(form) {
  return form.status === AVAILABILITY_UNAVAILABLE && !form.untilFurtherNotice;
}

export function validateAvailabilityChange(form, { today }) {
  const errors = {};

  if (!form.doctorId) errors.doctorId = "Choose a doctor.";
  if (!isDatedAbsence(form)) return errors;

  if (!form.date) errors.date = "Choose a date.";
  else if (form.date < today) errors.date = "Past dates can't be scheduled.";

  if (!form.allDay) {
    if (!form.startTime || !form.endTime) errors.time = "Choose start and end times.";
    else if (form.endTime <= form.startTime) errors.time = "End time must be after the start time.";
  }

  return errors;
}

export function buildAvailabilityChange(form, notes = null) {
  const doctorId = form.doctorId;

  if (form.status === AVAILABILITY_AVAILABLE) {
    return { kind: CHANGE_KIND.CONFIRM_AVAILABLE, doctorId, notes: null };
  }

  if (form.untilFurtherNotice) {
    return { kind: CHANGE_KIND.MARK_UNAVAILABLE, doctorId, notes };
  }

  return {
    kind: CHANGE_KIND.SCHEDULE_ABSENCE,
    doctorId,
    absence: {
      localDate: form.date,
      allDay: form.allDay,
      startTime: form.allDay ? null : form.startTime,
      endTime: form.allDay ? null : form.endTime,
    },
    notes,
  };
}
