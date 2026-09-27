import test from "node:test";
import assert from "node:assert/strict";
import { loadAuthorizedDashboardCollections, navigationAllowed } from "./dashboardAccess.js";

test("encoder dashboard never requests forbidden historical records or referrals", async () => {
  const result = await loadAuthorizedDashboardCollections({ permissions: ["patients.register", "consultations.encode", "inventory.view"] }, {
    patients: async () => [{ id: 1 }],
    healthRecords: () => { throw new Error("Forbidden history request"); },
    referrals: () => { throw new Error("Forbidden referral request"); },
  });
  assert.equal(result.patients.length, 1);
  assert.equal(result.access.clinical, false);
  assert.deepEqual(result.healthRecords, []);
});

test("inventory dashboard does not request patient or clinical data", async () => {
  const forbidden = () => { throw new Error("Unauthorized collection requested"); };
  const result = await loadAuthorizedDashboardCollections({ permissions: ["inventory.view"] }, { patients: forbidden, healthRecords: forbidden, referrals: forbidden });
  assert.deepEqual(result.patients, []);
  assert.equal(result.access.inventory, true);
});

test("clinical collection failures still surface instead of being silently swallowed", async () => {
  await assert.rejects(loadAuthorizedDashboardCollections({ permissions: ["clinical.history"] }, {
    healthRecords: async () => { throw new Error("Database unavailable"); },
    referrals: async () => [],
  }), /Database unavailable/);
});

test("sidebar hides restricted modules but keeps assigned modules and admin navigation", () => {
  const encoder = { permissions: ["patients.register", "inventory.view"] };
  assert.equal(navigationAllowed(encoder, "/bhc/patients"), true);
  assert.equal(navigationAllowed(encoder, "/bhc/medicine-availability"), true);
  for (const path of ["health-records", "referrals", "follow-ups", "reports", "programs"]) {
    assert.equal(navigationAllowed(encoder, `/bhc/${path}`), false);
  }
  assert.equal(navigationAllowed({ role: "admin" }, "/admin/reports"), true);
});
