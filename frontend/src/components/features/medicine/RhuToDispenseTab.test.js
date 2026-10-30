import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "MedicineInventoryPage.jsx"), "utf8");
const tab = readFileSync(join(here, "RhuToDispenseTab.jsx"), "utf8");
const review = readFileSync(join(here, "RhuPrescriptionReviewModal.jsx"), "utf8");
const slip = readFileSync(join(here, "RhuPrescriptionPrintSlip.jsx"), "utf8");

test("RHU Health Commodities keeps Inventory and To dispense as separate tables", () => {
  assert.match(page, /To dispense/);
  assert.match(page, /RhuToDispenseTab/);
  assert.match(page, /role === ["']rhu["']/);
  assert.doesNotMatch(page, /\/rhu\/patients\//);
});

test("To dispense review shows prescription then print and dispense", () => {
  assert.match(tab, /Review prescription/);
  assert.match(tab, /Pending/);
  assert.match(tab, /Given/);
  assert.match(review, /Print/);
  assert.match(review, /Dispense/);
  assert.match(review, /prescriptionText/);
  assert.match(slip, /prescriptionText/);
  assert.doesNotMatch(slip, /batch/);
  assert.doesNotMatch(slip, /quantity/);
  assert.doesNotMatch(tab, /\/rhu\/patients\//);
});
