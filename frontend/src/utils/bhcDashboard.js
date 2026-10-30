export const ACTIVITY_PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
];

export function sliceActivitySeries(series, days = 7) {
  const rows = Array.isArray(series) ? series : [];
  const size = Number(days) === 30 ? 30 : 7;
  return rows.slice(-size);
}

export function formatKpiValue(value) {
  if (value == null) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "—";
}

export function isLockedMetric(value) {
  return value == null;
}

export function chartHasValues(series) {
  return Array.isArray(series) && series.some((item) => Number(item?.count) > 0);
}

export function formatChartTick(date) {
  const parsed = parseIsoDate(date);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatChartTooltipDate(date) {
  const parsed = parseIsoDate(date);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildAttentionItems(attention = {}, access = {}) {
  const items = [];
  if (access.clinical !== false) {
    pushCountItem(items, {
      key: "overdue",
      label: "Overdue follow-ups",
      count: attention.overdue_follow_ups,
      href: "/bhc/follow-ups",
    });
    pushCountItem(items, {
      key: "feedback",
      label: "Pending RHU feedback",
      count: attention.pending_rhu_feedback,
      href: "/bhc/referrals",
    });
  }
  if (access.inventory !== false) {
    const inventoryCount = Number(attention.inventory_alerts) || 0;
    if (inventoryCount > 0) {
      const names = Array.isArray(attention.inventory_items)
        ? attention.inventory_items
            .map((item) => item?.name)
            .filter(Boolean)
            .slice(0, 3)
            .join(", ")
        : "";
      items.push({
        key: "inventory",
        label: "Inventory alerts",
        count: inventoryCount,
        href: "/bhc/medicine-availability",
        detail: names,
      });
    }
  }
  return items;
}

function pushCountItem(items, { key, label, count, href }) {
  if (count == null) return;
  const value = Number(count) || 0;
  if (value <= 0) return;
  items.push({ key, label, count: value, href });
}

function parseIsoDate(value) {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
