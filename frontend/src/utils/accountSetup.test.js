import test from "node:test";
import assert from "node:assert/strict";
import { accessSummary } from "./accountSetup.js";
import { rolesData } from "./staffRoles.fixture.js";

const midwife = rolesData.roles[0].defaults;

test("admin accounts read as Municipal Health Officer", () => {
  assert.equal(accessSummary({ role: "Admin", backendRole: "admin" }, rolesData).label, "Municipal Health Officer");
});

test("staff with role defaults show the role label", () => {
  assert.deepEqual(accessSummary({ backendRole: "bhc", staff_role: "midwife", permissions: midwife }, rolesData), { label: "Midwife", custom: false, licensed: false });
});

test("changed access shows how far it moved from the defaults", () => {
  const permissions = [...midwife.filter(p => p !== "reports.view"), "inventory.manage"];
  assert.deepEqual(accessSummary({ backendRole: "bhc", staff_role: "midwife", permissions }, rolesData), { label: "Midwife · Custom (+1, −1)", custom: true, licensed: false });
});

test("accounts without a role say so", () => {
  assert.equal(accessSummary({ backendRole: "bhc", staff_role: null, permissions: ["patients.register"] }, rolesData).label, "Role not set");
});

test("licensed duties on a non-licensed role are flagged", () => {
  const summary = accessSummary({ backendRole: "bhc", staff_role: "encoder", permissions: ["patients.register", "consultations.encode", "inventory.view", "clinical.history", "consultations.finalize"] }, rolesData);
  assert.equal(summary.licensed, true);
  assert.equal(summary.label, "Encoder · Custom (+2, −0)");
});

test("missing permissions fall back to the role defaults", () => {
  assert.equal(accessSummary({ backendRole: "bhc", staff_role: "encoder", permissions: null }, rolesData).label, "Encoder");
});

test("without role data the raw role is shown", () => {
  assert.equal(accessSummary({ backendRole: "bhc", staff_role: "encoder", permissions: [] }, null).label, "encoder");
});
