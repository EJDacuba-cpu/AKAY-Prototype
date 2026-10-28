const FACILITY_TIMEZONE = "Asia/Manila";
const EXPIRY_SOON_DAYS = 30;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: FACILITY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const STOCK_STATUS = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

export const EXPIRY_STATUS = {
  VALID: "Valid",
  EXPIRING_SOON: "Expiring Soon",
  EXPIRES_TODAY: "Expires Today",
  EXPIRED: "Expired",
  NOT_RECORDED: "Expiry Not Recorded",
};

export const BHC_STOCK_FILTER_OPTIONS = [
  "All Status",
  STOCK_STATUS.IN_STOCK,
  STOCK_STATUS.LOW_STOCK,
  STOCK_STATUS.OUT_OF_STOCK,
];

export const BHC_EXPIRY_FILTER_OPTIONS = [
  "All Expiry",
  EXPIRY_STATUS.VALID,
  EXPIRY_STATUS.EXPIRING_SOON,
  EXPIRY_STATUS.EXPIRES_TODAY,
  EXPIRY_STATUS.EXPIRED,
  EXPIRY_STATUS.NOT_RECORDED,
];

function parseQuantity(value) {
  const parsed = parseInt(String(value ?? "0").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function addCalendarDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function getFacilityCalendarDate(now = new Date()) {
  return dayFormatter.format(now);
}

export function toFacilityCalendarDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : dayFormatter.format(value);
  }
  if (typeof value === "object") {
    return toFacilityCalendarDate(value.date ?? value.expiration_date ?? value.expiryDate ?? null);
  }

  const raw = String(value).trim();
  if (!raw || raw === "[object Object]") return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return dayFormatter.format(date);
}

export function formatFacilityDate(value) {
  const calendar = toFacilityCalendarDate(value);
  if (!calendar) return "\u2014";

  const [year, month, day] = calendar.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function getMedicineStockStatus(item = {}) {
  const quantity = parseQuantity(item.stockSummary?.available ?? item.stock_summary?.available ?? item.quantity);
  if (quantity <= 0) return STOCK_STATUS.OUT_OF_STOCK;

  const threshold = parseQuantity(
    item.lowStockThreshold ?? item.low_stock_threshold ?? 10,
  );
  return quantity <= threshold ? STOCK_STATUS.LOW_STOCK : STOCK_STATUS.IN_STOCK;
}

function inventoryGroups(item = {}) {
  const raw = item.expiry_groups ?? item.expiryGroups;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const rows = Object.values(raw);
    return rows.length ? rows : null;
  }
  return null;
}

export function getMedicineExpiryStatus(item = {}, now = new Date()) {
  const groups = inventoryGroups(item);
  if (groups) {
    const today = getFacilityCalendarDate(now);
    const withStock = groups.filter((group) => (
      Number(group.available_quantity ?? group.availableQuantity ?? 0)
      + Number(group.quarantined_quantity ?? group.quarantinedQuantity ?? 0)
    ) > 0);
    const dated = withStock
      .map((group) => ({
        ...group,
        calendar: toFacilityCalendarDate(group.expiration_date ?? group.expirationDate ?? group.expiryDate),
      }))
      .filter((group) => group.calendar)
      .sort((a, b) => a.calendar.localeCompare(b.calendar) || Number(a.id) - Number(b.id));
    const eligible = dated.filter((group) => group.calendar >= today);
    if (eligible.length) return getMedicineExpiryStatus({ expiration_date: eligible[0].calendar }, now);
    if (withStock.some((group) => group.expiry_not_applicable || group.expiryNotApplicable)) {
      return EXPIRY_STATUS.VALID;
    }
    return dated.length ? EXPIRY_STATUS.EXPIRED : EXPIRY_STATUS.NOT_RECORDED;
  }
  const expiry = toFacilityCalendarDate(item.expiryDate ?? item.expiration_date);
  if (!expiry) return EXPIRY_STATUS.NOT_RECORDED;

  const today = getFacilityCalendarDate(now);
  if (expiry < today) return EXPIRY_STATUS.EXPIRED;
  if (expiry === today) return EXPIRY_STATUS.EXPIRES_TODAY;
  if (expiry <= addCalendarDays(today, EXPIRY_SOON_DAYS)) {
    return EXPIRY_STATUS.EXPIRING_SOON;
  }
  return EXPIRY_STATUS.VALID;
}

export function getMedicineInventoryView(item = {}, now = new Date()) {
  return {
    quantity: parseQuantity(item.quantity),
    stockStatus: getMedicineStockStatus(item),
    expiryStatus: getMedicineExpiryStatus(item, now),
    expiryDateLabel: Array.isArray(item.expiryGroups || item.expiry_groups) ? `${(item.expiryGroups || item.expiry_groups).length} expiry groups` : formatFacilityDate(item.expiryDate ?? item.expiration_date),
    reconciliationRequired: Boolean(item.reconciliationRequired),
  };
}

export function isExpiredMedicine(item = {}, now = new Date()) {
  return getMedicineExpiryStatus(item, now) === EXPIRY_STATUS.EXPIRED;
}

export function stockStatusTone(status) {
  if (status === STOCK_STATUS.OUT_OF_STOCK) return "danger";
  if (status === STOCK_STATUS.LOW_STOCK) return "warning";
  return "info";
}

export function expiryStatusTone(status) {
  if (status === EXPIRY_STATUS.EXPIRED) return "danger";
  if (
    status === EXPIRY_STATUS.EXPIRES_TODAY ||
    status === EXPIRY_STATUS.EXPIRING_SOON
  ) {
    return "warning";
  }
  if (status === EXPIRY_STATUS.NOT_RECORDED) return "neutral";
  return "info";
}
