import test from "node:test";
import assert from "node:assert/strict";
import { buildCarePath } from "./carePath.js";

const groups = (extra = {}) => ({ confirmed: [], underEvaluation: [], past: [], ...extra });
const referral = (status, date = "2026-10-01") => ({ status, dateOfReferral: date });
const byKey = (steps) => Object.fromEntries(steps.map((step) => [step.key, step]));

test("a patient never referred has three empty stops", () => {
  const { steps, reached } = buildCarePath({ referrals: [], groups: groups() });
  assert.deepEqual(steps.map((s) => s.state), ["none", "none", "none"]);
  assert.equal(reached, 0);
  assert.equal(byKey(steps).referred.detail, "Not referred");
});

test("an open referral is the active stop, awaiting RHU", () => {
  const { steps } = buildCarePath({ referrals: [referral("Pending")], groups: groups() });
  const { referred, confirmed } = byKey(steps);
  assert.equal(referred.state, "active");
  assert.match(referred.detail, /^Awaiting RHU/);
  assert.equal(confirmed.state, "none");
});

test("cancelled and declined referrals do not count", () => {
  const { steps } = buildCarePath({
    referrals: [referral("Cancelled"), referral("declined")],
    groups: groups(),
  });
  assert.equal(byKey(steps).referred.state, "none");
});

test("the latest live referral decides the first stop", () => {
  const { steps } = buildCarePath({
    referrals: [referral("Completed", "2026-10-05"), referral("Pending", "2026-09-01")],
    groups: groups(),
  });
  assert.equal(byKey(steps).referred.state, "done");
});

test("an RHU-confirmed condition completes the second stop with its name", () => {
  const { steps, reached } = buildCarePath({
    referrals: [referral("Completed")],
    groups: groups({
      confirmed: [
        { kind: "rhu", conditionName: "Hypertension", status: "active" },
        { kind: "rhu", conditionName: "Asthma", status: "controlled" },
      ],
    }),
  });
  const { confirmed } = byKey(steps);
  assert.equal(confirmed.state, "done");
  assert.equal(confirmed.detail, "Hypertension +1");
  assert.equal(reached, 2);
});

test("under evaluation is the active second stop", () => {
  const { steps } = buildCarePath({
    referrals: [referral("Received")],
    groups: groups({ underEvaluation: [{ kind: "rhu", conditionName: "TB", status: "under_evaluation" }] }),
  });
  assert.equal(byKey(steps).confirmed.state, "active");
  assert.equal(byKey(steps).confirmed.detail, "Under evaluation");
});

test("a Received referral is no longer awaiting RHU", () => {
  const { steps } = buildCarePath({ referrals: [referral("Received")], groups: groups() });
  const { referred } = byKey(steps);
  assert.equal(referred.state, "done");
  assert.match(referred.detail, /Received/i);
  assert.doesNotMatch(referred.detail, /Awaiting RHU/i);
});

test("only resolved or ruled-out conditions read as no active condition", () => {
  const { steps } = buildCarePath({
    referrals: [referral("Completed")],
    groups: groups({ past: [{ kind: "rhu", conditionName: "UTI", status: "resolved" }] }),
  });
  assert.equal(byKey(steps).confirmed.state, "none");
  assert.equal(byKey(steps).confirmed.detail, "No active condition");
});

test("started monitoring completes the third stop; a recommendation is active", () => {
  const monitored = buildCarePath({
    referrals: [referral("Completed")],
    groups: groups({
      confirmed: [{ kind: "rhu", conditionName: "Hypertension", status: "active", monitoring: { id: 1, startedAt: "2026-10-08" } }],
    }),
  });
  assert.equal(byKey(monitored.steps).monitoring.state, "done");
  assert.match(byKey(monitored.steps).monitoring.detail, /^Hypertension/);
  assert.equal(monitored.reached, 3);

  const recommended = buildCarePath({
    referrals: [referral("Completed")],
    groups: groups({
      confirmed: [{ kind: "rhu", conditionName: "Hypertension", status: "active", bhcMonitoringRecommendedAt: "2026-10-08" }],
    }),
  });
  assert.equal(byKey(recommended.steps).monitoring.state, "active");
  assert.equal(byKey(recommended.steps).monitoring.detail, "Recommended by RHU");
});

test("legacy monitorings are never shown as RHU-confirmed monitoring", () => {
  const { steps } = buildCarePath({
    referrals: [],
    groups: groups({ legacyPending: [{ kind: "legacy-monitoring", conditionName: "Diabetes" }] }),
  });
  assert.equal(byKey(steps).confirmed.state, "none");
  assert.equal(byKey(steps).monitoring.state, "none");
});

test("the summary names every stop for screen readers", () => {
  const { summary } = buildCarePath({ referrals: [referral("Pending")], groups: groups() });
  assert.match(summary, /^Care path: BHC referral, awaiting RHU/i);
  assert.match(summary, /RHU confirmation, not confirmed/i);
});
