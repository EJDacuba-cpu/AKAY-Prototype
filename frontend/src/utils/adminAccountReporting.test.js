import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ACCOUNT_FILTERS,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  buildAdminAccountReport,
  parseAccountAnalytics,
} from "./adminAccountReporting.js";

function validAnalytics({ otherAccounts = 2 } = {}) {
  return {
    roles: ["admin", "bhc", "rhu"],
    statuses: ["active", "inactive"],
    matrix: {
      admin: { active: 2, inactive: 1 },
      bhc: { active: 4, inactive: 0 },
      rhu: { active: 3, inactive: 2 },
    },
    totals: {
      accounts: 12 + otherAccounts,
      canonical_accounts: 12,
      active: 9,
      inactive: 3,
      by_role: { admin: 3, bhc: 4, rhu: 5 },
    },
    other_accounts: otherAccounts,
  };
}

function emptyAnalytics({ otherAccounts = 0 } = {}) {
  return {
    roles: ["admin", "bhc", "rhu"],
    statuses: ["active", "inactive"],
    matrix: {
      admin: { active: 0, inactive: 0 },
      bhc: { active: 0, inactive: 0 },
      rhu: { active: 0, inactive: 0 },
    },
    totals: {
      accounts: otherAccounts,
      canonical_accounts: 0,
      active: 0,
      inactive: 0,
      by_role: { admin: 0, bhc: 0, rhu: 0 },
    },
    other_accounts: otherAccounts,
  };
}

function reportFrom(raw, extras = {}) {
  const parsed = parseAccountAnalytics(raw);
  assert.equal(parsed.ok, true, parsed.error);
  return buildAdminAccountReport({ analytics: parsed.analytics, ...extras });
}

function assertSliceConsistent(report) {
  const distributed = report.roleDistribution.reduce((sum, row) => sum + row.total, 0);
  assert.equal(distributed, report.filteredRegisteredTotal);
  assert.equal(report.summaryTotals.total, report.filteredRegisteredTotal);
  assert.equal(report.summaryTotals.active + report.summaryTotals.inactive, report.filteredRegisteredTotal);
  assert.deepEqual(report.statusTotals, {
    active: report.summaryTotals.active,
    inactive: report.summaryTotals.inactive,
  });
  assert.equal(report.roleDistribution.some((row) => row.role === "other"), false);
  assert.deepEqual(
    report.roleDistribution.map((row) => row.role),
    report.statusByRole.map((row) => row.role),
  );
  assert.deepEqual(
    report.roleDistribution.map((row) => row.role),
    report.summaryRows.map((row) => row.role),
  );
  for (const row of report.summaryRows) {
    assert.equal(row.total, row.active + row.inactive);
    assert.equal(report.roleDistribution.find((item) => item.role === row.role).total, row.total);
    const status = report.statusByRole.find((item) => item.role === row.role);
    assert.equal(status.active, row.active);
    assert.equal(status.inactive, row.inactive);
    assert.equal(status.label, row.label);
  }
}

test("ROLE_OPTIONS, STATUS_OPTIONS, and default filters match the report controls", () => {
  assert.deepEqual(DEFAULT_ACCOUNT_FILTERS, { role: "all", status: "all" });
  assert.deepEqual(ROLE_OPTIONS, [
    { value: "all", label: "All Roles" },
    { value: "admin", label: "Admin" },
    { value: "bhc", label: "BHC" },
    { value: "rhu", label: "RHU" },
  ]);
  assert.deepEqual(STATUS_OPTIONS, [
    { value: "all", label: "All Statuses" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ]);
});

test("a reconciled matrix parses and the unfiltered report matches every total", () => {
  const raw = validAnalytics();
  const snapshot = structuredClone(raw);
  const parsed = parseAccountAnalytics(raw);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.analytics, raw);
  assert.deepEqual(raw, snapshot);

  const report = buildAdminAccountReport({
    analytics: parsed.analytics,
    accessSummary: { invites: 4, resetRequests: 1 },
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.filters, { role: "all", status: "all" });
  assert.equal(report.filterLabel, "All Roles · All Statuses");
  assert.equal(report.roleChartTitle, "Accounts by Recognized Roles");
  assert.equal(report.databaseTotal, 14);
  assert.equal(report.recognizedTotal, 12);
  assert.equal(report.otherAccounts, 2);
  assert.equal(report.showOtherWarning, true);
  assert.equal(report.filteredRegisteredTotal, 12);
  assert.equal(report.emptyKind, "none");
  assert.deepEqual(report.roleDistribution, [
    { role: "admin", label: "Admin", total: 3 },
    { role: "bhc", label: "BHC", total: 4 },
    { role: "rhu", label: "RHU", total: 5 },
  ]);
  assert.deepEqual(report.statusByRole, [
    { role: "admin", label: "Admin", active: 2, inactive: 1 },
    { role: "bhc", label: "BHC", active: 4, inactive: 0 },
    { role: "rhu", label: "RHU", active: 3, inactive: 2 },
  ]);
  assert.deepEqual(report.statusTotals, { active: 9, inactive: 3 });
  assert.deepEqual(report.summaryRows, [
    { role: "admin", label: "Admin", total: 3, active: 2, inactive: 1 },
    { role: "bhc", label: "BHC", total: 4, active: 4, inactive: 0 },
    { role: "rhu", label: "RHU", total: 5, active: 3, inactive: 2 },
  ]);
  assert.deepEqual(report.summaryTotals, { total: 12, active: 9, inactive: 3 });
  assertSliceConsistent(report);
});

test("missing cells, bad counts, and broken invariants are rejected without repair", () => {
  const missingCell = validAnalytics();
  delete missingCell.matrix.rhu.inactive;
  const missing = parseAccountAnalytics(missingCell);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /incomplete|missing/i);
  assert.equal(missing.analytics, undefined);

  const negative = validAnalytics();
  negative.matrix.admin.active = -1;
  const negativeResult = parseAccountAnalytics(negative);
  assert.equal(negativeResult.ok, false);
  assert.match(negativeResult.error, /negative|non-integer/i);

  for (const bad of [1.5, "2", null, Number.NaN]) {
    const fractional = validAnalytics();
    fractional.matrix.bhc.active = bad;
    const result = parseAccountAnalytics(fractional);
    assert.equal(result.ok, false, `expected rejection for ${String(bad)}`);
    assert.match(result.error, /negative|non-integer/i);
  }

  const roleDrift = validAnalytics();
  roleDrift.totals.by_role.admin = 4;
  const roleResult = parseAccountAnalytics(roleDrift);
  assert.equal(roleResult.ok, false);
  assert.match(roleResult.error, /reconcil/i);

  const columnDrift = validAnalytics();
  columnDrift.totals.active = 10;
  columnDrift.totals.inactive = 2;
  const columnResult = parseAccountAnalytics(columnDrift);
  assert.equal(columnResult.ok, false);
  assert.match(columnResult.error, /reconcil/i);

  const accountDrift = validAnalytics();
  accountDrift.totals.accounts = 13;
  const accountResult = parseAccountAnalytics(accountDrift);
  assert.equal(accountResult.ok, false);
  assert.match(accountResult.error, /reconcil/i);

  for (const raw of [undefined, null, [], {}]) {
    const result = parseAccountAnalytics(raw);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
  }

  const built = buildAdminAccountReport({ analytics: missingCell });
  assert.equal(built.ok, false);
  assert.match(built.error, /incomplete|missing/i);
  assert.equal(built.databaseTotal, undefined);
  assert.equal(built.filteredRegisteredTotal, undefined);
  assert.equal(built.roleDistribution, undefined);
  assert.equal(built.accessRequests, undefined);
});

test("role and status filters slice the chart, status bars, and summary table together", () => {
  const accessSummary = { invites: 6, reset_requests: 2 };

  const byRole = reportFrom(validAnalytics(), { filters: { role: "bhc", status: "all" }, accessSummary });
  assert.equal(byRole.ok, true);
  assert.deepEqual(byRole.filters, { role: "bhc", status: "all" });
  assert.equal(byRole.filterLabel, "BHC · All Statuses");
  assert.equal(byRole.databaseTotal, 14);
  assert.equal(byRole.recognizedTotal, 12);
  assert.equal(byRole.otherAccounts, 2);
  assert.equal(byRole.filteredRegisteredTotal, 4);
  assert.deepEqual(byRole.roleDistribution, [{ role: "bhc", label: "BHC", total: 4 }]);
  assert.deepEqual(byRole.statusByRole, [{ role: "bhc", label: "BHC", active: 4, inactive: 0 }]);
  assert.deepEqual(byRole.summaryRows, [{ role: "bhc", label: "BHC", total: 4, active: 4, inactive: 0 }]);
  assert.deepEqual(byRole.summaryTotals, { total: 4, active: 4, inactive: 0 });
  assert.equal(byRole.emptyKind, "none");
  assertSliceConsistent(byRole);

  const byStatus = reportFrom(validAnalytics(), { filters: { role: "all", status: "active" }, accessSummary });
  assert.equal(byStatus.filterLabel, "All Roles · Active");
  assert.equal(byStatus.filteredRegisteredTotal, 9);
  assert.deepEqual(byStatus.roleDistribution, [
    { role: "admin", label: "Admin", total: 2 },
    { role: "bhc", label: "BHC", total: 4 },
    { role: "rhu", label: "RHU", total: 3 },
  ]);
  assert.deepEqual(byStatus.statusByRole, [
    { role: "admin", label: "Admin", active: 2, inactive: 0 },
    { role: "bhc", label: "BHC", active: 4, inactive: 0 },
    { role: "rhu", label: "RHU", active: 3, inactive: 0 },
  ]);
  assert.deepEqual(byStatus.summaryTotals, { total: 9, active: 9, inactive: 0 });
  assert.equal(byStatus.recognizedTotal, 12);
  assertSliceConsistent(byStatus);

  const both = reportFrom(validAnalytics(), { filters: { role: "rhu", status: "inactive" }, accessSummary });
  assert.equal(both.filterLabel, "RHU · Inactive");
  assert.equal(both.filteredRegisteredTotal, 2);
  assert.deepEqual(both.summaryRows, [{ role: "rhu", label: "RHU", total: 2, active: 0, inactive: 2 }]);
  assert.deepEqual(both.statusTotals, { active: 0, inactive: 2 });
  assert.equal(both.databaseTotal, 14);
  assertSliceConsistent(both);

  assert.deepEqual(byRole.accessRequests, both.accessRequests);
  assert.deepEqual(byStatus.accessRequests, {
    available: true,
    pendingInvitations: 6,
    pendingPasswordResets: 2,
    scopeLabel: "System-wide (unfiltered)",
  });
});

test("chart titles stay canonical when unfiltered and name the applied slice when filtered", () => {
  assert.equal(reportFrom(validAnalytics({ otherAccounts: 0 })).roleChartTitle, "Accounts by Recognized Roles");
  assert.equal(
    reportFrom(validAnalytics(), { filters: { role: "bhc", status: "all" } }).roleChartTitle,
    "BHC Accounts",
  );
  assert.equal(
    reportFrom(validAnalytics(), { filters: { role: "all", status: "active" } }).roleChartTitle,
    "Active Accounts by Recognized Roles",
  );
  assert.equal(
    reportFrom(validAnalytics(), { filters: { role: "bhc", status: "active" } }).roleChartTitle,
    "Active BHC Accounts",
  );
  assert.equal(
    reportFrom(validAnalytics(), { filters: { role: "rhu", status: "inactive" } }).roleChartTitle,
    "Inactive RHU Accounts",
  );
  assert.equal(
    reportFrom(validAnalytics(), { filters: { role: "admin", status: "all" } }).filterLabel,
    "Admin · All Statuses",
  );
});

test("other_accounts warns without becoming a chart series", () => {
  const warned = reportFrom(validAnalytics({ otherAccounts: 3 }));
  assert.equal(warned.otherAccounts, 3);
  assert.equal(warned.databaseTotal, 15);
  assert.equal(warned.recognizedTotal, 12);
  assert.equal(warned.showOtherWarning, true);
  assert.equal(warned.filteredRegisteredTotal, 12);
  assert.deepEqual(
    warned.roleDistribution.map((row) => row.role),
    ["admin", "bhc", "rhu"],
  );

  const clean = reportFrom(validAnalytics({ otherAccounts: 0 }));
  assert.equal(clean.otherAccounts, 0);
  assert.equal(clean.databaseTotal, 12);
  assert.equal(clean.showOtherWarning, false);
});

test("emptyKind distinguishes no recognized accounts from a filter with no matches", () => {
  const none = reportFrom(emptyAnalytics());
  assert.equal(none.emptyKind, "no-accounts");
  assert.equal(none.recognizedTotal, 0);
  assert.equal(none.filteredRegisteredTotal, 0);
  assert.equal(none.databaseTotal, 0);
  assert.equal(none.showOtherWarning, false);
  assert.equal(none.roleChartTitle, "Accounts by Recognized Roles");

  const unclassifiedOnly = reportFrom(emptyAnalytics({ otherAccounts: 5 }));
  assert.equal(unclassifiedOnly.emptyKind, "no-accounts");
  assert.equal(unclassifiedOnly.databaseTotal, 5);
  assert.equal(unclassifiedOnly.recognizedTotal, 0);
  assert.equal(unclassifiedOnly.otherAccounts, 5);
  assert.equal(unclassifiedOnly.showOtherWarning, true);
  assert.equal(unclassifiedOnly.filteredRegisteredTotal, 0);

  const noMatch = reportFrom(validAnalytics(), { filters: { role: "bhc", status: "inactive" } });
  assert.equal(noMatch.emptyKind, "no-matches");
  assert.equal(noMatch.recognizedTotal, 12);
  assert.equal(noMatch.filteredRegisteredTotal, 0);
  assert.equal(noMatch.databaseTotal, 14);
  assert.deepEqual(noMatch.summaryRows, [{ role: "bhc", label: "BHC", total: 0, active: 0, inactive: 0 }]);
  assert.equal(noMatch.showOtherWarning, true);

  assert.equal(reportFrom(validAnalytics({ otherAccounts: 0 })).emptyKind, "none");
});

test("a missing or failed access summary stays unavailable instead of turning into zeros", () => {
  const analytics = parseAccountAnalytics(validAnalytics()).analytics;

  for (const accessSummary of [undefined, null, {}, { invites: 4 }, { resetRequests: 2 }]) {
    const report = buildAdminAccountReport({ analytics, accessSummary });
    assert.equal(report.ok, true);
    assert.deepEqual(report.accessRequests, {
      available: false,
      reason: "Access summary unavailable",
    });
    assert.equal(report.filteredRegisteredTotal, 12);
  }

  const failed = buildAdminAccountReport({
    analytics,
    accessSummary: { invites: 9, resetRequests: 8 },
    accessSummaryError: new Error("Summary request failed"),
  });
  assert.equal(failed.ok, true);
  assert.deepEqual(failed.accessRequests, {
    available: false,
    reason: "Summary request failed",
  });

  const malformed = buildAdminAccountReport({
    analytics,
    accessSummary: { invites: -1, resetRequests: 1 },
  });
  assert.deepEqual(malformed.accessRequests, {
    available: false,
    reason: "Access summary unavailable",
  });
  assert.equal("pendingInvitations" in malformed.accessRequests, false);
  assert.equal("pendingPasswordResets" in malformed.accessRequests, false);
});

test("a present access summary keeps system-wide counts, including real zeros", () => {
  const analytics = parseAccountAnalytics(validAnalytics()).analytics;

  const fromService = buildAdminAccountReport({
    analytics,
    filters: { role: "admin", status: "inactive" },
    accessSummary: { invites: 0, resetRequests: 3 },
  });
  assert.deepEqual(fromService.accessRequests, {
    available: true,
    pendingInvitations: 0,
    pendingPasswordResets: 3,
    scopeLabel: "System-wide (unfiltered)",
  });
  assert.equal(fromService.filteredRegisteredTotal, 1);

  const fromApi = buildAdminAccountReport({
    analytics,
    accessSummary: { invites: 5, reset_requests: 0 },
  });
  assert.deepEqual(fromApi.accessRequests, {
    available: true,
    pendingInvitations: 5,
    pendingPasswordResets: 0,
    scopeLabel: "System-wide (unfiltered)",
  });
});
