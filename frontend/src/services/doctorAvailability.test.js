import test from "node:test";
import assert from "node:assert/strict";
import {
  AWAITING_RHU_UPDATE,
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
  bhcCoordinationText,
  bhcExpectedReturnLabel,
  combineExpectedReturn,
  isExpectedReturnOverdue,
  normalizeAvailability,
  normalizeProvider,
  normalizeUnavailability,
  splitExpectedReturn,
} from "./doctorAvailabilityModel.js";
import { isOfficialProvider } from "../utils/doctorRoster.js";

test("normalizeProvider keeps official userId from snake or camel case", () => {
  assert.equal(normalizeProvider({ id: 4, user_id: 12, name: "Dr. Official" }).userId, "12");
  assert.equal(normalizeProvider({ id: 5, userId: 9, name: "Dr. Official" }).userId, "9");
  assert.equal(isOfficialProvider(normalizeProvider({ id: 4, user_id: 12 })), true);
});

test("covering providers stay unlinked", () => {
  const covering = normalizeProvider({
    id: 1,
    user_id: null,
    name: "Dr. Covering",
    availability_status: AVAILABILITY_AVAILABLE,
  });
  assert.equal(covering.userId, null);
  assert.equal(isOfficialProvider(covering), false);
  assert.equal(normalizeProvider({ id: 2, name: "Dr. Locum" }).userId, null);
});

test("normalizeProvider keeps effective status separate from the stored flag", () => {
  const provider = normalizeProvider({
    id: 8,
    user_id: 4,
    name: "Dr. Official",
    availability_status: AVAILABILITY_AVAILABLE,
    effective_availability_status: AVAILABILITY_UNAVAILABLE,
  });
  assert.equal(provider.availabilityStatus, AVAILABILITY_AVAILABLE);
  assert.equal(provider.effectiveAvailabilityStatus, AVAILABILITY_UNAVAILABLE);
});

test("normalizeUnavailability maps all-day and timed windows", () => {
  const allDay = normalizeUnavailability({
    id: 9,
    rhu_provider_id: 8,
    local_date: "2026-10-23",
    all_day: true,
    start_time: null,
    end_time: null,
  });
  assert.equal(allDay.localDate, "2026-10-23");
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.startTime, null);

  const timed = normalizeUnavailability({
    id: 10,
    providerId: "8",
    localDate: "2026-10-24",
    allDay: false,
    startTime: "09:00",
    endTime: "12:00",
  });
  assert.equal(timed.allDay, false);
  assert.equal(timed.startTime, "09:00");
  assert.equal(timed.endTime, "12:00");
});

test("normalizeProvider keeps internal notes off the BHC coordination helpers", () => {
  const provider = normalizeProvider({
    id: 8,
    user_id: 4,
    name: "Dr. Official",
    availability_status: AVAILABILITY_UNAVAILABLE,
    remarks: "AM clinic only",
    internal_notes: "Locum covering OR",
    expected_available_at: "2026-10-23T14:00:00+08:00",
    awaiting_rhu_update: false,
  });
  assert.equal(provider.internalNotes, "Locum covering OR");
  assert.equal(provider.remarks, "AM clinic only");
  assert.equal(bhcCoordinationText(provider).includes("Locum covering OR"), false);
  assert.match(bhcCoordinationText(provider), /AM clinic only/);
  assert.match(bhcCoordinationText(provider), /Expected return:/);
});

test("overdue expected return becomes Awaiting RHU Update for BHC", () => {
  const provider = {
    availabilityStatus: AVAILABILITY_UNAVAILABLE,
    remarks: "Clinic closed",
    expectedAvailableAt: "2026-10-21T10:00:00+08:00",
  };
  const now = new Date("2026-10-22T08:00:00+08:00");
  assert.equal(isExpectedReturnOverdue(provider, now), true);
  assert.equal(bhcExpectedReturnLabel(provider, now), AWAITING_RHU_UPDATE);
  assert.equal(bhcCoordinationText(provider, now), "Clinic closed · Awaiting RHU Update");

  const flagged = normalizeProvider({
    availability_status: AVAILABILITY_UNAVAILABLE,
    awaiting_rhu_update: true,
    remarks: "Clinic closed",
  });
  assert.equal(bhcExpectedReturnLabel(flagged, now), AWAITING_RHU_UPDATE);
});

test("Manila expected-return helpers round-trip date and time", () => {
  const combined = combineExpectedReturn("2026-10-23", "14:00");
  assert.equal(combined, "2026-10-23T14:00:00+08:00");
  assert.deepEqual(splitExpectedReturn(combined), { date: "2026-10-23", time: "14:00" });
  assert.equal(combineExpectedReturn("", "14:00"), null);
});

test("availability aggregate still comes from the server payload", () => {
  const summary = normalizeAvailability({
    rural_health_unit_id: 3,
    available_count: 1,
    total_count: 2,
    status: AVAILABILITY_UNAVAILABLE,
    can_submit_referral: true,
    providers: [{ id: 8, user_id: 4, name: "Dr. Official", availability_status: AVAILABILITY_AVAILABLE }],
  });
  assert.equal(summary.availableCount, 1);
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.canSubmitReferral, true);
  assert.equal(summary.providers[0].userId, "4");
});
