import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_PERIODS,
  buildAttentionItems,
  chartHasValues,
  formatChartTick,
  formatChartTooltipDate,
  formatKpiValue,
  isLockedMetric,
  sliceActivitySeries,
} from "./bhcDashboard.js";

const series = [
  { date: "2026-10-16", count: 1 },
  { date: "2026-10-17", count: 0 },
  { date: "2026-10-18", count: 2 },
  { date: "2026-10-19", count: 0 },
  { date: "2026-10-20", count: 4 },
  { date: "2026-10-21", count: 0 },
  { date: "2026-10-22", count: 3 },
];

test("sliceActivitySeries keeps the last seven or thirty days", () => {
  assert.equal(ACTIVITY_PERIODS.length, 2);
  assert.deepEqual(sliceActivitySeries(series, 7).map((row) => row.date), series.map((row) => row.date));
  const thirty = Array.from({ length: 30 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, "0")}`, count: index }));
  assert.equal(sliceActivitySeries(thirty, 7).length, 7);
  assert.equal(sliceActivitySeries(thirty, "30").length, 30);
  assert.deepEqual(sliceActivitySeries(null, 7), []);
});

test("KPI display treats null as locked and zero as a real count", () => {
  assert.equal(formatKpiValue(null), "—");
  assert.equal(formatKpiValue(undefined), "—");
  assert.equal(formatKpiValue(0), "0");
  assert.equal(formatKpiValue(12), "12");
  assert.equal(isLockedMetric(null), true);
  assert.equal(isLockedMetric(0), false);
});

test("chartHasValues ignores an all-zero series", () => {
  assert.equal(chartHasValues(series), true);
  assert.equal(chartHasValues(series.map((row) => ({ ...row, count: 0 }))), false);
  assert.equal(chartHasValues([]), false);
});

test("chart labels use the stored calendar date", () => {
  assert.equal(formatChartTick("2026-10-22"), "Oct 22");
  assert.match(formatChartTooltipDate("2026-10-22"), /Thursday, October 22, 2026/);
});

test("attention items omit zeros, locked modules, and never invent destinations", () => {
  assert.deepEqual(
    buildAttentionItems({
      overdue_follow_ups: 2,
      pending_rhu_feedback: 0,
      inventory_alerts: 3,
      inventory_items: [{ name: "Paracetamol", status: "Low Stock" }],
    }),
    [
      { key: "overdue", label: "Overdue follow-ups", count: 2, href: "/bhc/follow-ups" },
      {
        key: "inventory",
        label: "Inventory alerts",
        count: 3,
        href: "/bhc/medicine-availability",
        detail: "Paracetamol",
      },
    ],
  );

  assert.deepEqual(
    buildAttentionItems(
      { overdue_follow_ups: 4, pending_rhu_feedback: 1, inventory_alerts: 2 },
      { clinical: false, inventory: true },
    ),
    [{ key: "inventory", label: "Inventory alerts", count: 2, href: "/bhc/medicine-availability", detail: "" }],
  );

  assert.deepEqual(
    buildAttentionItems(
      { overdue_follow_ups: null, pending_rhu_feedback: null, inventory_alerts: 0 },
      { clinical: true, inventory: true },
    ),
    [],
  );
});
