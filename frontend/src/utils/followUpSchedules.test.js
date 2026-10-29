import test from "node:test";
import assert from "node:assert/strict";
import {
  attachPredecessors,
  entryPurposeKey,
  extraPurposeKey,
  extraScheduleRows,
  followUpScheduleErrors,
  followUpScheduleReviewRows,
  followUpSchedulesPayload,
  managedReturnRows,
  restoreFollowUpSchedules,
  VISIT_PURPOSE_KEY,
} from "./followUpSchedules.js";

test("managed returns start unscheduled so local care can complete without a date", () => {
  const rows = managedReturnRows([
    { id: "c1", name: "Wound", clinicalOutcome: "managed_at_bhc" },
    { id: "c2", name: "Hypertension", clinicalOutcome: "refer_to_rhu" },
  ]);
  assert.deepEqual(rows, [{
    purposeKey: "entry:c1",
    purpose: "Wound",
    date: "",
    time: "",
    predecessorTaskId: null,
    sourceEntryId: "c1",
    needed: false,
    name: "Wound",
  }]);
  assert.equal(rows[0].needed, false);
  assert.deepEqual(followUpSchedulesPayload({ managedReturns: rows }), []);
});

test("an unfinished follow-up row is not sent until it has a date and reason", () => {
  assert.deepEqual(followUpSchedulesPayload({
    managedReturns: [{ needed: true, purposeKey: "entry:c1", purpose: "Wound", date: "", sourceEntryId: "c1" }],
  }), []);
});

test("one consultation can schedule two independent returns", () => {
  const payload = followUpSchedulesPayload({
    managedReturns: [{ needed: true, purposeKey: "entry:c1", purpose: "Wound reassessment", date: "2026-10-29", sourceEntryId: "c1" }],
    extraSchedules: [{ purposeKey: "service:maternal", purpose: "Prenatal follow-up", date: "2026-11-06" }],
  });
  assert.equal(payload.length, 2);
  assert.equal(payload[0].purposeKey, "entry:c1");
  assert.equal(payload[1].date, "2026-11-06");
  assert.equal(payload[1].time, null);
});

test("a successor is linked only when the purpose matches a selected follow-up", () => {
  const continued = [
    { id: 11, purposeKey: "entry:wound", purpose: "Wound reassessment" },
    { id: 12, purposeKey: "service:maternal", purpose: "Prenatal follow-up" },
  ];
  const payload = followUpSchedulesPayload({
    managedReturns: [{ needed: true, purposeKey: "entry:wound", purpose: "Wound reassessment", date: "2026-10-29" }],
    continuedFollowUps: continued,
  });
  assert.equal(payload[0].predecessorTaskId, 11);
  assert.deepEqual(
    attachPredecessors([{ purposeKey: "entry:other", purpose: "New concern", date: "2026-11-01" }], continued)[0].predecessorTaskId,
    null,
  );
});

test("a service return links the original scheduled follow-up without a second concern successor", () => {
  const continued = [{ id: 26, purposeKey: "service:maternal", purpose: "Prenatal follow-up" }];
  const scheduled = followUpSchedulesPayload({
    extraSchedules: [{ purposeKey: "service:maternal", purpose: "Prenatal follow-up", date: "2026-11-06" }],
    continuedFollowUps: continued,
  });
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].purposeKey, "service:maternal");
  assert.equal(scheduled[0].predecessorTaskId, 26);
  assert.deepEqual(
    followUpSchedulesPayload({ extraSchedules: [], continuedFollowUps: continued }),
    [],
  );
  assert.equal(
    attachPredecessors(
      [{ purposeKey: "service:maternal", purpose: "Different wording", date: "2026-11-06" }],
      [{ id: 26, purposeKey: "visit", purpose: "Return visit", sourceSelectedPrograms: ["Maternal"] }],
    )[0].predecessorTaskId,
    26,
  );
  assert.equal(
    attachPredecessors(
      [{ purposeKey: "service:maternal", purpose: "Prenatal follow-up", date: "2026-11-06" }],
      [{ id: 12, purposeKey: "entry:wound", purpose: "Prenatal follow-up" }],
    )[0].predecessorTaskId,
    null,
  );
});

test("schedule validation does not require a date when no return is needed", () => {
  assert.deepEqual(followUpScheduleErrors({
    managedReturns: [{ needed: false, purposeKey: "entry:c1", purpose: "Wound", date: "" }],
  }), {});
  assert.equal(
    followUpScheduleErrors({ managedReturns: [{ needed: true, purposeKey: "entry:c1", purpose: "Wound", date: "" }] })["followUpSchedule.entry:c1.date"],
    "Set the follow-up date.",
  );
  const extraErrors = followUpScheduleErrors({
    extraSchedules: [{ purposeKey: "extra:1", purpose: "", date: "" }],
  });
  assert.equal(extraErrors["extraFollowUp.0.date"], "Set the follow-up date.");
  assert.equal(extraErrors["extraFollowUp.0.purpose"], "Describe the reason for return.");
  const serviceErrors = followUpScheduleErrors({
    extraSchedules: [{ purposeKey: "service:maternal", purpose: "Prenatal follow-up", date: "" }],
  });
  assert.equal(serviceErrors["followUpSchedule.service:maternal.date"], "Set the follow-up date.");
  assert.equal("extraFollowUp.0.date" in serviceErrors, false);
});

test("review rows list each scheduled purpose separately", () => {
  assert.deepEqual(
    followUpScheduleReviewRows([
      { purpose: "Wound reassessment", date: "2026-10-29", time: "09:00" },
      { purpose: "Prenatal follow-up", date: "2026-11-06" },
    ]),
    [
      { label: "Wound reassessment", value: "2026-10-29 · 09:00" },
      { label: "Prenatal follow-up", value: "2026-11-06" },
    ],
  );
});

test("restore keeps stored independent schedules", () => {
  assert.deepEqual(
    restoreFollowUpSchedules([{ purposeKey: "entry:c1", purpose: "Wound", date: "2026-10-29", sourceEntryId: "c1" }]),
    [{ purposeKey: "entry:c1", purpose: "Wound", date: "2026-10-29", time: "", predecessorTaskId: null, sourceEntryId: "c1" }],
  );
  assert.deepEqual(restoreFollowUpSchedules(null), []);
});

test("restore turns a legacy visit follow-up into a scheduled return", () => {
  assert.deepEqual(
    restoreFollowUpSchedules([], { bhcFollowUp: true, date: "2026-11-04", time: "09:00", purpose: "Wound check" }),
    [{ purposeKey: VISIT_PURPOSE_KEY, purpose: "Wound check", date: "2026-11-04", time: "09:00", predecessorTaskId: null, sourceEntryId: null }],
  );
  assert.deepEqual(restoreFollowUpSchedules([], { bhcFollowUp: true, date: "" }), []);
  assert.deepEqual(
    extraScheduleRows([{ purposeKey: VISIT_PURPOSE_KEY, purpose: "BHC follow-up", date: "2026-11-04" }]),
    [{ purposeKey: VISIT_PURPOSE_KEY, purpose: "BHC follow-up", date: "2026-11-04" }],
  );
});

test("purpose key helpers stay stable", () => {
  assert.equal(entryPurposeKey("c1"), "entry:c1");
  assert.equal(extraPurposeKey(4), "extra:4");
  assert.equal(VISIT_PURPOSE_KEY, "visit");
});

test("restore keeps an in-progress concern follow-up even before a date is entered", () => {
  assert.deepEqual(
    restoreFollowUpSchedules([{ purposeKey: "entry:c1", purpose: "Wound", date: "", sourceEntryId: "c1" }]),
    [{ purposeKey: "entry:c1", purpose: "Wound", date: "", time: "", predecessorTaskId: null, sourceEntryId: "c1" }],
  );
});
