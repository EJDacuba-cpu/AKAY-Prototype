import test from "node:test";
import assert from "node:assert/strict";
import { reviewPermissions, setPermission, withRequirements } from "./accessPolicy.js";
import { ALL_PERMISSIONS, NURSE_ASSIGNMENT_DUTIES, PERMISSION_CATALOG, suggestedNurseDuties } from "./actionPermissions.js";
import { rolesData } from "./staffRoles.fixture.js";

const encoder = ["patients.register", "consultations.encode", "inventory.view"];

test("ticking a duty also ticks what it requires", () => {
  assert.ok(setPermission([], "consultations.finalize", true).includes("clinical.history"));
  assert.deepEqual(withRequirements(["inventory.manage"]), ["inventory.view", "inventory.manage"]);
});

test("unticking a requirement drops the duties that depend on it", () => {
  const next = setPermission(["clinical.history", "consultations.finalize", "patients.register"], "clinical.history", false);
  assert.deepEqual(next, ["patients.register"]);
});

test("review marks added and licensed duties against the role defaults", () => {
  const permissions = [...encoder.slice(1), "inventory.manage", "clinical.history", "consultations.finalize"];
  const review = reviewPermissions({ permissions, defaults: encoder, licensedRole: false });
  const row = key => review.rows.find(r => r.key === key);

  assert.equal(row("inventory.manage").added, true);
  assert.equal(row("inventory.manage").licensed, false);
  assert.equal(row("consultations.finalize").added, true);
  assert.equal(row("consultations.finalize").licensed, true);
  assert.equal(row("consultations.encode").added, false);
  assert.equal(row("consultations.encode").label, "Encode consultations");
  assert.equal(row("consultations.encode").group, "consultations");
  assert.deepEqual(review.removed, ["patients.register"]);
});

test("licensed roles never get the licensed chip", () => {
  const review = reviewPermissions({ permissions: ["clinical.history", "consultations.finalize"], defaults: [], licensedRole: true });
  assert.ok(review.rows.every(r => !r.licensed));
});

test("Patient Background editing is an explicit duty that needs history reading", () => {
  assert.ok(ALL_PERMISSIONS.includes("clinical.background.update"));
  assert.deepEqual(PERMISSION_CATALOG["clinical.background.update"].requires, ["clinical.history"]);
  assert.deepEqual(withRequirements(["clinical.background.update"]), ["clinical.history", "clinical.background.update"]);
  assert.deepEqual(setPermission(["clinical.history", "clinical.background.update"], "clinical.history", false), []);
  assert.ok(NURSE_ASSIGNMENT_DUTIES.includes("clinical.background.update"));
});

test("no role or suggestion grants Patient Background editing implicitly", () => {
  assert.equal(suggestedNurseDuties().includes("clinical.background.update"), false);
  assert.ok(suggestedNurseDuties().includes("clinical.history"));
  rolesData.roles.forEach(role => assert.equal(role.defaults.includes("clinical.background.update"), false, role.key));
  assert.ok(rolesData.available.bhc.includes("clinical.background.update"));
  assert.equal(rolesData.available.rhu.includes("clinical.background.update"), false);
});
