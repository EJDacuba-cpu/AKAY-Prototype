import test from "node:test";
import assert from "node:assert/strict";
import { isPendingSetup, roleLabel, setupStatusLabel } from "./accountSetup.js";
import { rolesData } from "./staffRoles.fixture.js";

const midwife = rolesData.roles[0].defaults;

test("admin accounts read as Municipal Health Officer", () => {
  assert.equal(roleLabel({ role: "Admin", backendRole: "admin" }, rolesData), "Municipal Health Officer");
});

test("staff with role defaults show the role label", () => {
  assert.equal(roleLabel({ backendRole: "bhc", staff_role: "midwife", permissions: midwife }, rolesData), "Midwife");
});

test("changed access still shows only the role label", () => {
  const permissions = [...midwife.filter(p => p !== "reports.view"), "inventory.manage"];
  assert.equal(roleLabel({ backendRole: "bhc", staff_role: "midwife", permissions }, rolesData), "Midwife");
});

test("accounts without a role say so", () => {
  assert.equal(roleLabel({ backendRole: "bhc", staff_role: null, permissions: ["patients.register"] }, rolesData), "Role not set");
});

test("licensed duties on a non-licensed role still show only the role label", () => {
  const permissions = ["patients.register", "consultations.encode", "inventory.view", "clinical.history", "consultations.finalize"];
  assert.equal(roleLabel({ backendRole: "bhc", staff_role: "encoder", permissions }, rolesData), "Encoder");
});

test("missing permissions still show the role label", () => {
  assert.equal(roleLabel({ backendRole: "bhc", staff_role: "encoder", permissions: null }, rolesData), "Encoder");
});

test("without role data the raw role is shown", () => {
  assert.equal(roleLabel({ backendRole: "bhc", staff_role: "encoder", permissions: [] }, null), "encoder");
});

test("pending setup is separate from active or inactive status", () => {
  assert.equal(isPendingSetup({ status: "Active" }), true);
  assert.equal(isPendingSetup({ status: "Active", email_verified_at: "2026-10-30T00:00:00.000000Z" }), false);
  assert.equal(setupStatusLabel({ status: "Inactive" }), "Pending Setup");
  assert.equal(setupStatusLabel({ status: "Active", email_verified_at: "2026-10-30T00:00:00.000000Z" }), "Setup complete");
});
