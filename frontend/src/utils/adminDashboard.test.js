import test from "node:test";
import assert from "node:assert/strict";
import {
  PERIOD_OPTIONS,
  barangaySignals,
  buildAttentionItems,
  parsePeriod,
  referralTrend,
  sortBarangays,
} from "./adminDashboard.js";

const names = (rows) => rows.map((r) => r.name);

test("PERIOD_OPTIONS lists the four periods with their labels", () => {
  assert.deepEqual(PERIOD_OPTIONS, [
    { value: "today", label: "Today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
    { value: "year", label: "This year" },
  ]);
});

test("parsePeriod accepts the four keys and falls back to month", () => {
  for (const key of ["today", "week", "month", "year"]) assert.equal(parsePeriod(key), key);
  for (const bad of [undefined, null, "", "MONTH", "<script>", "decade"]) assert.equal(parsePeriod(bad), "month");
});

test("buildAttentionItems keeps a fixed order and skips zeros", () => {
  const items = buildAttentionItems({
    reset_requests: 0,
    invites: 1,
    stale_priority_referrals: 2,
    facilities_without_staff: [{ type: "bhc", id: 1, name: "Bravo" }],
  });
  assert.deepEqual(items.map((i) => i.key), ["invites", "facilities", "stale"]);
  assert.equal(items[0].label, "1 pending invite");
  assert.equal(items[0].href, "/admin/password-reset-requests?tab=invites");
  assert.equal(items[1].label, "1 facility without staff");
  assert.equal(items[1].href, "/admin/staff-assignments");
  assert.deepEqual(items[1].names, ["Bravo"]);
  assert.equal(items[2].label, "2 priority referrals pending over 2 days");
  assert.equal(items[2].href, "/admin/reports");
});

test("buildAttentionItems pluralises every label", () => {
  const items = buildAttentionItems({
    reset_requests: 3,
    invites: 2,
    stale_priority_referrals: 1,
    facilities_without_staff: [
      { type: "bhc", id: 1, name: "Bravo" },
      { type: "rhu", id: 2, name: "Alpha" },
    ],
  });
  assert.deepEqual(items.map((i) => i.key), ["resets", "invites", "facilities", "stale"]);
  assert.deepEqual(items.map((i) => i.label), [
    "3 password reset requests",
    "2 pending invites",
    "2 facilities without staff",
    "1 priority referral pending over 2 days",
  ]);
  assert.equal(items[0].href, "/admin/password-reset-requests");
  assert.deepEqual(items[2].names, ["Bravo", "Alpha"]);
  assert.deepEqual(items.map((i) => i.count), [3, 2, 2, 1]);
  assert.equal(buildAttentionItems({ reset_requests: 1 })[0].label, "1 password reset request");
});

test("buildAttentionItems returns [] when everything is zero or missing", () => {
  assert.deepEqual(
    buildAttentionItems({ reset_requests: 0, invites: 0, stale_priority_referrals: 0, facilities_without_staff: [] }),
    [],
  );
  assert.deepEqual(buildAttentionItems(undefined), []);
  assert.deepEqual(buildAttentionItems({}), []);
});

test("barangaySignals flags each amber signal and counts them separately from no staff", () => {
  assert.deepEqual(
    barangaySignals({ pending: 2, no_show: 0, overdue_follow_ups: 1, low_stock: 0, has_staff: true }),
    { pending: true, noShow: false, overdue: true, lowStock: false, noStaff: false, flagged: 2 },
  );
  assert.deepEqual(
    barangaySignals({ pending: 0, no_show: 1, overdue_follow_ups: 0, low_stock: 3, has_staff: false }),
    { pending: false, noShow: true, overdue: false, lowStock: true, noStaff: true, flagged: 2 },
  );
  const calm = barangaySignals({ has_staff: false });
  assert.equal(calm.flagged, 0);
  assert.equal(calm.noStaff, true);
  assert.equal(barangaySignals({}).noStaff, false);
});

test("sortBarangays default puts no-staff first, then most flags, then name", () => {
  const rows = [
    { name: "Alpha", pending: 0, no_show: 0, overdue_follow_ups: 0, low_stock: 0, has_staff: true },
    { name: "Bravo", pending: 1, no_show: 1, overdue_follow_ups: 0, low_stock: 0, has_staff: true },
    { name: "Charlie", pending: 0, no_show: 0, overdue_follow_ups: 0, low_stock: 0, has_staff: false },
    { name: "Aaron", pending: 1, no_show: 0, overdue_follow_ups: 1, low_stock: 0, has_staff: true },
  ];
  assert.deepEqual(names(sortBarangays(rows)), ["Charlie", "Aaron", "Bravo", "Alpha"]);
  assert.equal(rows[0].name, "Alpha"); // input untouched
});

test("sortBarangays by a column sorts numerically in both directions", () => {
  const rows = [
    { name: "C", referrals: 3 },
    { name: "A", referrals: 10 },
    { name: "B", referrals: 3 },
  ];
  assert.deepEqual(names(sortBarangays(rows, { key: "referrals", direction: "asc" })), ["B", "C", "A"]);
  assert.deepEqual(names(sortBarangays(rows, { key: "referrals", direction: "desc" })), ["A", "B", "C"]);
  assert.deepEqual(names(rows), ["C", "A", "B"]); // input untouched
});

test("sortBarangays sorts by name case-insensitively and by has_staff as 0/1", () => {
  const rows = [
    { name: "bravo", has_staff: true },
    { name: "Alpha", has_staff: false },
    { name: "Charlie", has_staff: true },
    { name: "Delta", has_staff: false },
  ];
  assert.deepEqual(names(sortBarangays(rows, { key: "name", direction: "asc" })), ["Alpha", "bravo", "Charlie", "Delta"]);
  assert.deepEqual(names(sortBarangays(rows, { key: "name", direction: "desc" })), ["Delta", "Charlie", "bravo", "Alpha"]);
  assert.deepEqual(names(sortBarangays(rows, { key: "has_staff", direction: "asc" })), ["Alpha", "Delta", "bravo", "Charlie"]);
  assert.deepEqual(names(sortBarangays(rows, { key: "has_staff", direction: "desc" })), ["bravo", "Charlie", "Alpha", "Delta"]);
});

test("sortBarangays treats missing numbers as 0 and handles an empty list", () => {
  const rows = [{ name: "B", low_stock: 2 }, { name: "A" }];
  assert.deepEqual(names(sortBarangays(rows, { key: "low_stock", direction: "asc" })), ["A", "B"]);
  assert.deepEqual(sortBarangays([]), []);
});

test("referralTrend labels", () => {
  assert.equal(referralTrend(48, 36).label, "▲ 12 vs last period");
  assert.equal(referralTrend(5, 9).label, "▼ 4 vs last period");
  assert.equal(referralTrend(0, 0).label, "Same as last period");
  assert.deepEqual(referralTrend(48, 36), { direction: "up", difference: 12, label: "▲ 12 vs last period" });
  assert.deepEqual(referralTrend(5, 9), { direction: "down", difference: 4, label: "▼ 4 vs last period" });
  assert.deepEqual(referralTrend(3, 3), { direction: "same", difference: 0, label: "Same as last period" });
});
