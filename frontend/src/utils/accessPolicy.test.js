import test from "node:test";
import assert from "node:assert/strict";
import { reviewPermissions, setPermission, withRequirements } from "./accessPolicy.js";

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
