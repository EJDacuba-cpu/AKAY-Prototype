import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "MedicineInventoryPage.jsx"), "utf8");
const tab = readFileSync(join(here, "RhuToDispenseTab.jsx"), "utf8");
const review = readFileSync(join(here, "RhuPrescriptionReviewModal.jsx"), "utf8");
const usageReview = readFileSync(join(here, "RhuServiceUsageReviewModal.jsx"), "utf8");
const slip = readFileSync(join(here, "RhuPrescriptionPrintSlip.jsx"), "utf8");
const dispensePagePath = join(here, "..", "..", "..", "pages", "rhu", "RhuToDispense.jsx");
const app = readFileSync(join(here, "..", "..", "..", "App.jsx"), "utf8");

test("RHU inventory page has no dispense desk and To Dispense is its own route", () => {
  assert.doesNotMatch(page, /RhuToDispenseTab/);
  assert.doesNotMatch(page, /setDesk|showDispenseDesk|canDispense|To dispense/);
  assert.match(page, /role === ["']rhu["'] \? ["']Inventory["']/);
  assert.match(page, /RHU medicine and supply inventory\./);
  assert.match(page, /Medicine and Supply/);
  assert.doesNotMatch(page, /\/rhu\/patients\//);
  assert.equal(existsSync(dispensePagePath), true);
  const dispensePage = readFileSync(dispensePagePath, "utf8");
  assert.match(dispensePage, /DashboardLayout role="rhu" title="Medicine and Supply"/);
  assert.match(tab, /To Dispense/);
  assert.match(tab, /Review prescriptions and reconcile actual service items used\./);
  assert.match(dispensePage, /<RhuToDispenseTab\s*\/>/);
  assert.match(app, /path=["']\/rhu\/to-dispense["']/);
  assert.match(app, /module=["']dispensing["']/);
  assert.match(app, /<RhuToDispense\s*\/>/);
});

test("To dispense review shows prescription then print and dispense", () => {
  assert.match(tab, /Review prescription/);
  assert.match(tab, /Review usage/);
  assert.match(tab, /Service Usage/);
  assert.match(tab, /Pending/);
  assert.match(tab, /Given/);
  assert.match(usageReview, /Confirm stock usage/);
  assert.match(review, /Print/);
  assert.match(review, /Dispense/);
  assert.match(review, /prescriptionText/);
  assert.match(slip, /prescriptionText/);
  assert.doesNotMatch(slip, /batch/);
  assert.doesNotMatch(slip, /quantity/);
  assert.doesNotMatch(tab, /\/rhu\/patients\//);
});
