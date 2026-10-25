import test from "node:test";
import assert from "node:assert/strict";
import { loadAuthorizedDashboardCollections, navigationAllowed } from "./dashboardAccess.js";
import { canAccessModule } from "../config/accessModules.js";

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

test("sidebar locks restricted modules but keeps assigned modules and admin navigation", () => {
  const encoder = { permissions: ["patients.register", "inventory.view"] };
  assert.equal(navigationAllowed(encoder, "/bhc/patients"), true);
  assert.equal(navigationAllowed(encoder, "/bhc/medicine-availability"), true);
  for (const path of ["health-records", "referrals", "follow-ups", "reports", "programs"]) {
    assert.equal(navigationAllowed(encoder, `/bhc/${path}`), false);
  }
  assert.equal(navigationAllowed({ role: "admin" }, "/admin/reports"), true);
});

test("RHU doctor availability is not locked behind inventory", () => {
  const rhu = { role: "rhu", permissions: ["clinical.history"] };
  assert.equal(navigationAllowed(rhu, "/rhu/doctor-availability"), true);
  assert.equal(navigationAllowed(rhu, "/rhu/medicine-management"), false);
  assert.equal(navigationAllowed(rhu, "/rhu/follow-ups"), false);
  assert.equal(navigationAllowed({ role: "rhu", permissions: ["followups.manage"] }, "/rhu/follow-ups"), true);
});

test("BHC clinical history can read the directory without gaining patient registration or RHU access", () => {
  const history = { role: "bhc", permissions: ["clinical.history"] };
  assert.equal(navigationAllowed(history, "/bhc/patients"), true);
  assert.equal(navigationAllowed(history, "/bhc/patients/add"), false);
  assert.equal(navigationAllowed(history, "/rhu/patients"), false);
  assert.equal(canAccessModule(history, "patientDirectory"), true);
  assert.equal(canAccessModule(history, "patients"), false);
  assert.equal(canAccessModule({ ...history, role: "rhu" }, "patientDirectory"), true);
  assert.equal(canAccessModule({ role: "bhc", permissions: ["inventory.view"] }, "patientDirectory"), false);
});

test("RHU registration can open the patient directory and add page", () => {
  const rhu = { role: "rhu", permissions: ["patients.register", "clinical.history"] };
  assert.equal(navigationAllowed(rhu, "/rhu/patients"), true);
  assert.equal(navigationAllowed(rhu, "/rhu/patients/add"), true);
  assert.equal(canAccessModule(rhu, "patients"), true);
});

test("RHU history without register can open the patient directory but cannot add", () => {
  const rhu = { role: "rhu", permissions: ["clinical.history"] };
  assert.equal(navigationAllowed(rhu, "/rhu/patients"), true);
  assert.equal(navigationAllowed(rhu, "/rhu/patients/42"), true);
  assert.equal(navigationAllowed(rhu, "/rhu/patients/add"), false);
  assert.equal(canAccessModule(rhu, "patients"), false);
  assert.equal(canAccessModule(rhu, "patientDirectory"), true);
});

test("RHU intake nav locks without rhu.intake or rhu.manage", () => {
  const historyOnly = { role: "rhu", permissions: ["clinical.history"] };
  const desk = { role: "rhu", permissions: ["clinical.history", "rhu.manage"] };
  const intake = { role: "rhu", permissions: ["rhu.intake"] };
  assert.equal(navigationAllowed(historyOnly, "/rhu/incoming-referrals"), false);
  assert.equal(navigationAllowed(historyOnly, "/rhu/qr-scanner"), false);
  assert.equal(canAccessModule(historyOnly, "rhuIntake"), false);
  assert.equal(navigationAllowed(desk, "/rhu/incoming-referrals"), true);
  assert.equal(navigationAllowed(desk, "/rhu/qr-scanner"), true);
  assert.equal(canAccessModule(desk, "rhuIntake"), true);
  assert.equal(navigationAllowed(intake, "/rhu/incoming-referrals"), true);
  assert.equal(canAccessModule(intake, "rhuIntake"), true);
  assert.equal(navigationAllowed({ role: "bhc", permissions: ["clinical.history"] }, "/bhc/referrals"), true);
});
