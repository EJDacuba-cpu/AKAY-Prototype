import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTaskActions,
  getBhcFollowUpLegacyDestination,
  getCompletedFollowUpRecordId,
  getFollowUpLegacyDestination,
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

test("active follow-ups offer record, reschedule and cancel only", () => {
  for (const basePath of ["/bhc", "/rhu"]) {
    const labels = buildTaskActions(pending, { ...handlers, basePath }).map(
      (action) => action.label,
    );
    assert.deepEqual(labels, ["Record Visit", "Reschedule", "Cancel Follow-up"]);
    assert.ok(!labels.includes("View Follow-up Details"));
  }
});

test("completed follow-ups offer View Health Record when a visit was recorded", () => {
  for (const basePath of ["/bhc", "/rhu"]) {
    const labels = buildTaskActions(completed, {
      ...handlers,
      basePath,
    }).map((action) => action.label);
    assert.deepEqual(labels, ["View Health Record"]);
  }
});

test("cancelled and superseded follow-ups offer no actions", () => {
  assert.deepEqual(
    buildTaskActions(cancelled, { ...handlers, basePath: "/rhu" }),
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

test("completed follow-up record id is the recorded consultation, not the source record", () => {
  assert.equal(getCompletedFollowUpRecordId(completed), "11");
  assert.equal(getCompletedFollowUpRecordId(pending), "");
  assert.equal(getCompletedFollowUpRecordId(completedWithoutVisit), "");
});

test("calendar clicks only open a completed follow-up's health record", () => {
  for (const basePath of ["/bhc", "/rhu"]) {
    assert.equal(getTaskNavigationTarget(pending, basePath), "");
    assert.equal(getTaskNavigationTarget(cancelled, basePath), "");
    assert.equal(
      getTaskNavigationTarget(completed, basePath),
      `${basePath}/health-records/11`,
    );
    assert.equal(getTaskNavigationTarget(completedWithoutVisit, basePath), "");
  }
});

test("legacy details URLs never send pending tasks to a source record", () => {
  assert.equal(getBhcFollowUpLegacyDestination(pending), "/bhc/follow-ups");
  assert.equal(getFollowUpLegacyDestination(pending, "/rhu"), "/rhu/follow-ups");
  assert.equal(getFollowUpLegacyDestination(cancelled, "/rhu"), "/rhu/follow-ups");
  assert.equal(getFollowUpLegacyDestination(null, "/rhu"), "/rhu/follow-ups");
  assert.equal(
    getFollowUpLegacyDestination(completed, "/rhu"),
    "/rhu/health-records/11",
  );
  assert.equal(
    getFollowUpLegacyDestination(completedWithoutVisit, "/bhc"),
    "/bhc/follow-ups",
  );
});
