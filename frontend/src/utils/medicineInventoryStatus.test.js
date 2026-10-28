import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPIRY_STATUS,
  STOCK_STATUS,
  formatFacilityDate,
  getMedicineExpiryStatus,
  getMedicineInventoryView,
  getMedicineStockStatus,
  isExpiredMedicine,
  toFacilityCalendarDate,
} from "./medicineInventoryStatus.js";

const TODAY = new Date("2026-10-22T08:00:00+08:00");

function item(overrides = {}) {
  return {
    quantity: 24,
    lowStockThreshold: 10,
    expiryDate: "2026-12-31",
    ...overrides,
  };
}

test("missing expiry is unverified, not Valid or Expired", () => {
  assert.equal(getMedicineExpiryStatus(item({ expiryDate: "" }), TODAY), EXPIRY_STATUS.NOT_RECORDED);
  assert.equal(getMedicineExpiryStatus(item({ expiryDate: null }), TODAY), EXPIRY_STATUS.NOT_RECORDED);
  assert.equal(getMedicineExpiryStatus({}, TODAY), EXPIRY_STATUS.NOT_RECORDED);
  assert.equal(isExpiredMedicine(item({ expiryDate: "" }), TODAY), false);
});

test("expiry equal to the Manila calendar date is Expires Today, not Available/Valid", () => {
  assert.equal(
    getMedicineExpiryStatus(item({ expiryDate: "2026-10-22" }), TODAY),
    EXPIRY_STATUS.EXPIRES_TODAY,
  );
  assert.equal(isExpiredMedicine(item({ expiryDate: "2026-10-22" }), TODAY), false);
});

test("past expiry is Expired and future expiry keeps the 30-day window", () => {
  assert.equal(
    getMedicineExpiryStatus(item({ expiryDate: "2026-10-21" }), TODAY),
    EXPIRY_STATUS.EXPIRED,
  );
  assert.equal(
    getMedicineExpiryStatus(item({ expiryDate: "2026-11-21" }), TODAY),
    EXPIRY_STATUS.EXPIRING_SOON,
  );
  assert.equal(
    getMedicineExpiryStatus(item({ expiryDate: "2026-11-22" }), TODAY),
    EXPIRY_STATUS.VALID,
  );
});

test("date-only strings are not shifted by UTC parsing", () => {
  const lateUtc = new Date("2026-10-22T16:30:00Z");
  assert.equal(toFacilityCalendarDate("2026-10-22"), "2026-10-22");
  assert.equal(
    getMedicineExpiryStatus(item({ expiryDate: "2026-10-22" }), lateUtc),
    EXPIRY_STATUS.EXPIRED,
  );
  assert.equal(formatFacilityDate("2026-10-22"), "Oct 22, 2026");
});

test("zero stock is Out of Stock even when expiry is missing, today, or valid", () => {
  for (const expiryDate of ["", "2026-10-22", "2026-12-31", "2026-01-01"]) {
    assert.equal(
      getMedicineStockStatus(item({ quantity: 0, expiryDate })),
      STOCK_STATUS.OUT_OF_STOCK,
    );
  }
});

test("positive stock is independent of expiry and still reports Low Stock", () => {
  const expired = getMedicineInventoryView(
    item({ quantity: 24, expiryDate: "2026-10-01" }),
    TODAY,
  );
  assert.equal(expired.stockStatus, STOCK_STATUS.IN_STOCK);
  assert.equal(expired.expiryStatus, EXPIRY_STATUS.EXPIRED);
  assert.equal(expired.quantity, 24);

  const low = getMedicineInventoryView(
    item({ quantity: 4, expiryDate: "" }),
    TODAY,
  );
  assert.equal(low.stockStatus, STOCK_STATUS.LOW_STOCK);
  assert.equal(low.expiryStatus, EXPIRY_STATUS.NOT_RECORDED);
  assert.equal(low.reconciliationRequired, false);
});

test("expiry status follows verified group dates, not the item-level fallback", () => {
  const grouped = item({
    expiryDate: "",
    expiry_groups: [{ id: 11, expiration_date: "2027-03-01", available_quantity: 95 }],
  });
  assert.equal(getMedicineExpiryStatus(grouped, TODAY), EXPIRY_STATUS.VALID);
  assert.equal(
    getMedicineExpiryStatus({
      expiry_groups: { 11: { id: 11, expirationDate: "2027-03-01T00:00:00.000000Z", availableQuantity: 95 } },
    }, TODAY),
    EXPIRY_STATUS.VALID,
  );
  assert.equal(
    getMedicineExpiryStatus({
      stockSummary: { available: 95 },
      expiry_groups: [{ id: 11, expiration_date: null, available_quantity: 95 }],
    }, TODAY),
    EXPIRY_STATUS.NOT_RECORDED,
  );
});

test("reconciliation required stays visible beside stock and expiry", () => {
  const view = getMedicineInventoryView(
    item({ quantity: 12, reconciliationRequired: true, expiryDate: "2026-10-22" }),
    TODAY,
  );
  assert.equal(view.stockStatus, STOCK_STATUS.IN_STOCK);
  assert.equal(view.expiryStatus, EXPIRY_STATUS.EXPIRES_TODAY);
  assert.equal(view.reconciliationRequired, true);
});
