import assert from "node:assert/strict";
import { test } from "node:test";
import { isDraftDefault, pickFilterValues } from "./listFilterPopoverUtils.js";

const fields = [
  {
    key: "status",
    label: "Status",
    resetValue: "All Active",
    options: ["All Active", "Pending"],
  },
  {
    key: "dateRange",
    label: "Date",
    type: "datePresets",
    resetValue: "all",
    presets: [
      { value: "all", label: "All dates" },
      { value: "custom", label: "Custom" },
    ],
  },
];

test("pickFilterValues seeds selects and custom date keys", () => {
  const values = pickFilterValues(
    {
      status: "Pending",
      dateRange: "custom",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    },
    fields,
  );
  assert.equal(values.status, "Pending");
  assert.equal(values.dateRange, "custom");
  assert.equal(values.dateFrom, "2026-01-01");
  assert.equal(values.dateTo, "2026-01-31");
});

test("isDraftDefault is true only for reset values", () => {
  assert.equal(
    isDraftDefault(
      { status: "All Active", dateRange: "all", dateFrom: "", dateTo: "" },
      fields,
    ),
    true,
  );
  assert.equal(
    isDraftDefault(
      { status: "Pending", dateRange: "all", dateFrom: "", dateTo: "" },
      fields,
    ),
    false,
  );
});
