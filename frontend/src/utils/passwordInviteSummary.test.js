import test from "node:test";
import assert from "node:assert/strict";

import { normalizePasswordInviteSummary } from "./passwordInviteSummary.js";
import { buildAdminAccountReport, parseAccountAnalytics } from "./adminAccountReporting.js";

function validAnalytics() {
  return {
    roles: ["admin", "bhc", "rhu"],
    statuses: ["active", "inactive"],
    matrix: {
      admin: { active: 1, inactive: 0 },
      bhc: { active: 2, inactive: 1 },
      rhu: { active: 3, inactive: 0 },
    },
    totals: {
      accounts: 7,
      canonical_accounts: 7,
      active: 6,
      inactive: 1,
      by_role: { admin: 1, bhc: 3, rhu: 3 },
    },
    other_accounts: 0,
  };
}

test("normalize keeps legitimate zero and positive counts", () => {
  assert.deepEqual(normalizePasswordInviteSummary({ invites: 0, reset_requests: 0 }), {
    invites: 0,
    resetRequests: 0,
  });
  assert.deepEqual(normalizePasswordInviteSummary({ invites: 4, reset_requests: 2 }), {
    invites: 4,
    resetRequests: 2,
  });
  assert.deepEqual(normalizePasswordInviteSummary({ invites: 1, resetRequests: 0 }), {
    invites: 1,
    resetRequests: 0,
  });
});

test("normalize rejects missing, null, and malformed fields instead of inventing zeros", () => {
  for (const payload of [
    undefined,
    null,
    {},
    { invites: 3 },
    { reset_requests: 2 },
    { invites: null, reset_requests: 0 },
    { invites: 0, reset_requests: null },
    { invites: "0", reset_requests: 1 },
    { invites: 1.5, reset_requests: 0 },
    { invites: -1, reset_requests: 0 },
    { invites: 0, reset_requests: -2 },
  ]) {
    assert.throws(
      () => normalizePasswordInviteSummary(payload),
      (error) => error instanceof Error && error.message === "Access summary unavailable",
    );
  }
});

test("Admin Reports treats a failed summary as Unavailable and keeps account totals", () => {
  const analytics = parseAccountAnalytics(validAnalytics()).analytics;

  const report = buildAdminAccountReport({
    analytics,
    accessSummaryError: new Error("Network down"),
  });

  assert.equal(report.ok, true);
  assert.equal(report.filteredRegisteredTotal, 7);
  assert.deepEqual(report.accessRequests, {
    available: false,
    reason: "Network down",
  });
  assert.equal("pendingInvitations" in report.accessRequests, false);
});

test("normalized service output including zeros reaches the report view-model", () => {
  const analytics = parseAccountAnalytics(validAnalytics()).analytics;
  const summary = normalizePasswordInviteSummary({ invites: 0, reset_requests: 5 });
  const report = buildAdminAccountReport({ analytics, accessSummary: summary });

  assert.deepEqual(report.accessRequests, {
    available: true,
    pendingInvitations: 0,
    pendingPasswordResets: 5,
    scopeLabel: "System-wide (unfiltered)",
  });
});

test("empty API data that previously became {0,0} via ?? is rejected before the page", () => {
  // Regression for getPasswordInviteSummary's former `data.reset_requests ?? 0` / `data.invites ?? 0`.
  assert.throws(() => normalizePasswordInviteSummary({}));
  assert.throws(() => normalizePasswordInviteSummary(undefined));
});
