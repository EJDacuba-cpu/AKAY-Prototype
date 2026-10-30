import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTaskActions,
  getBhcFollowUpLegacyDestination,
  getCompletedFollowUpRecordId,
  getTaskNavigationTarget,
} from "./followUpActions.js";

const pending = {
  id: "7",
  effectiveState: "upcoming",
  state: "pending",
  healthRecordId: "10",
  latestHealthRecordId: "10",
};

const completed = {
  id: "8",
  effectiveState: "fulfilled",
  state: "fulfilled",
  healthRecordId: "10",
  latestHealthRecordId: "11",
  fulfilledByHealthRecordId: "11",
};

const completedWithoutVisit = {
  id: "9",
  effectiveState: "fulfilled",
  state: "fulfilled",
  healthRecordId: "10",
  latestHealthRecordId: "10",
};

const cancelled = {
  id: "12",
  effectiveState: "cancelled",
  state: "cancelled",
  healthRecordId: "10",
};

const handlers = {
  onRecordVisit() {},
  onReschedule() {},
  onCancel() {},
  onViewRecord() {},
};

test("BHC active follow-ups offer record, reschedule and cancel only", () => {
  const labels = buildTaskActions(pending, { ...handlers, basePath: "/bhc" }).map(
    (action) => action.label,
  );
  assert.deepEqual(labels, ["Record Visit", "Reschedule", "Cancel Follow-up"]);
});

test("BHC completed follow-ups offer View Health Record when a visit was recorded", () => {
  const labels = buildTaskActions(completed, {
    ...handlers,
    basePath: "/bhc",
  }).map((action) => action.label);
  assert.deepEqual(labels, ["View Health Record"]);
});

test("cancelled and superseded BHC follow-ups offer no actions", () => {
  assert.deepEqual(
    buildTaskActions(cancelled, { ...handlers, basePath: "/bhc" }),
    [],
  );
  assert.deepEqual(
    buildTaskActions(
      { id: "13", effectiveState: "superseded", rescheduledToId: "14" },
      { ...handlers, basePath: "/bhc" },
    ),
    [],
  );
});

test("RHU keeps View Follow-up Details for backward compatibility", () => {
  const labels = buildTaskActions(pending, { ...handlers, basePath: "/rhu" }).map(
    (action) => action.label,
  );
  assert.deepEqual(labels, [
    "Record Visit",
    "Reschedule",
    "Cancel Follow-up",
    "View Follow-up Details",
  ]);
});

test("completed follow-up record id is the recorded consultation, not the source record", () => {
  assert.equal(getCompletedFollowUpRecordId(completed), "11");
  assert.equal(getCompletedFollowUpRecordId(pending), "");
  assert.equal(getCompletedFollowUpRecordId(completedWithoutVisit), "");
});

test("BHC calendar clicks only open a completed follow-up's health record", () => {
  assert.equal(getTaskNavigationTarget(pending, "/bhc"), "");
  assert.equal(getTaskNavigationTarget(cancelled, "/bhc"), "");
  assert.equal(
    getTaskNavigationTarget(completed, "/bhc"),
    "/bhc/health-records/11",
  );
  assert.equal(getTaskNavigationTarget(completedWithoutVisit, "/bhc"), "");
});

test("RHU calendar clicks still open Follow-up Details", () => {
  assert.equal(getTaskNavigationTarget(pending, "/rhu"), "/rhu/follow-ups/7");
  assert.equal(getTaskNavigationTarget(completed, "/rhu"), "/rhu/follow-ups/8");
});

test("legacy BHC details URLs never send pending tasks to a source record", () => {
  assert.equal(getBhcFollowUpLegacyDestination(pending), "/bhc/follow-ups");
  assert.equal(getBhcFollowUpLegacyDestination(cancelled), "/bhc/follow-ups");
  assert.equal(getBhcFollowUpLegacyDestination(null), "/bhc/follow-ups");
  assert.equal(
    getBhcFollowUpLegacyDestination(completed),
    "/bhc/health-records/11",
  );
  assert.equal(
    getBhcFollowUpLegacyDestination(completedWithoutVisit),
    "/bhc/follow-ups",
  );
});
