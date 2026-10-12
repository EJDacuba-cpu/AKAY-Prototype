export const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

const DEFAULT_PERIOD = "month";

export function parsePeriod(value) {
  return PERIOD_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_PERIOD;
}

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const plural = (n, singular, pluralForm) => (n === 1 ? singular : pluralForm);

export function buildAttentionItems(attention) {
  const source = attention || {};
  const facilities = Array.isArray(source.facilities_without_staff) ? source.facilities_without_staff : [];

  const items = [
    {
      key: "resets",
      count: count(source.reset_requests),
      noun: ["password reset request", "password reset requests"],
      href: "/admin/password-reset-requests",
    },
    {
      key: "invites",
      count: count(source.invites),
      noun: ["pending invite", "pending invites"],
      href: "/admin/password-reset-requests?tab=invites",
    },
    {
      key: "facilities",
      count: facilities.length,
      noun: ["facility without staff", "facilities without staff"],
      href: "/admin/staff-assignments",
      names: facilities.map((facility) => facility.name),
    },
    {
      key: "stale",
      count: count(source.stale_priority_referrals),
      noun: ["priority referral pending over 2 days", "priority referrals pending over 2 days"],
      href: "/admin/reports",
    },
  ];

  return items
    .filter((item) => item.count > 0)
    .map(({ noun, ...item }) => ({ ...item, label: `${item.count} ${plural(item.count, noun[0], noun[1])}` }));
}

export function barangaySignals(row) {
  const source = row || {};
  const pending = count(source.pending) > 0;
  const noShow = count(source.no_show) > 0;
  const overdue = count(source.overdue_follow_ups) > 0;
  const lowStock = count(source.low_stock) > 0;

  return {
    pending,
    noShow,
    overdue,
    lowStock,
    noStaff: source.has_staff === false,
    flagged: [pending, noShow, overdue, lowStock].filter(Boolean).length,
  };
}

const byName = (a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" });

const sortValue = (row, key) => (key === "has_staff" ? Number(Boolean(row.has_staff)) : count(row[key]));

export function sortBarangays(rows, sort = { key: "default", direction: "asc" }) {
  const list = [...(rows || [])];
  const { key = "default", direction = "asc" } = sort || {};

  if (key === "default") {
    return list.sort((a, b) => {
      const left = barangaySignals(a);
      const right = barangaySignals(b);
      return (
        Number(right.noStaff) - Number(left.noStaff) ||
        right.flagged - left.flagged ||
        byName(a, b)
      );
    });
  }

  const factor = direction === "desc" ? -1 : 1;

  if (key === "name") return list.sort((a, b) => factor * byName(a, b));

  return list.sort((a, b) => factor * (sortValue(a, key) - sortValue(b, key)) || byName(a, b));
}

export function referralTrend(total, previousTotal) {
  const difference = count(total) - count(previousTotal);

  if (difference > 0) return { direction: "up", difference, label: `▲ ${difference} vs last period` };
  if (difference < 0) {
    return { direction: "down", difference: -difference, label: `▼ ${-difference} vs last period` };
  }
  return { direction: "same", difference: 0, label: "Same as last period" };
}
