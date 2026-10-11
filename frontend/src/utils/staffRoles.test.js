import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFacilityChange,
  availableDuties,
  isValidContactNumber,
  licensedGrants,
  needsReplaceConfirm,
  normalizeContactNumber,
  roleDefaults,
  roleFor,
  rolesForTier,
} from "./staffRoles.js";
import { rolesData } from "./staffRoles.fixture.js";

const [{ defaults: midwife }, , { defaults: encoder }] = rolesData.roles;

test("roles are grouped by facility tier", () => {
  assert.deepEqual(rolesForTier(rolesData, "bhw").map(r => r.key), ["midwife", "bhw", "encoder"]);
  assert.deepEqual(rolesForTier(rolesData, "rhu_staff").map(r => r.key), ["nurse", "doctor"]);
  assert.deepEqual(rolesForTier(rolesData, "admin"), []);
  assert.equal(roleFor(rolesData, "encoder").label, "Encoder");
  assert.equal(roleFor(rolesData, ""), undefined);
});

test("defaults and available duties come from the API data", () => {
  assert.deepEqual(roleDefaults(rolesData, "encoder"), encoder);
  assert.deepEqual(roleDefaults(rolesData, ""), []);
  assert.equal(availableDuties(rolesData, "bhw").length, 11);
  assert.ok(!availableDuties(rolesData, "bhw").includes("rhu.manage"));
  assert.deepEqual(availableDuties(rolesData, "admin"), []);
});

test("licensed duties are flagged only for non-licensed roles", () => {
  assert.deepEqual(licensedGrants(rolesData, "encoder", ["consultations.finalize", "patients.register"]), ["consultations.finalize"]);
  assert.deepEqual(licensedGrants(rolesData, "midwife", ["consultations.finalize"]), []);
});

test("switching role asks first only when the checklist was changed", () => {
  assert.equal(needsReplaceConfirm(rolesData, "encoder", [...encoder].reverse()), false);
  assert.equal(needsReplaceConfirm(rolesData, "encoder", [...encoder, "inventory.manage"]), true);
  assert.equal(needsReplaceConfirm(rolesData, "encoder", encoder.slice(1)), true);
  assert.equal(needsReplaceConfirm(rolesData, "", []), false);
});

test("contact numbers accept spaces and dashes but only PH mobile format", () => {
  assert.equal(normalizeContactNumber("0917 123-4567"), "09171234567");
  assert.equal(isValidContactNumber("0917 123 4567"), true);
  assert.equal(isValidContactNumber("0917-123-4567"), true);
  assert.equal(isValidContactNumber("+639171234567"), false);
  assert.equal(isValidContactNumber("0817123456"), false);
  assert.equal(isValidContactNumber(""), false);
});

test("same-tier facility change keeps role and access; tier change clears them", () => {
  const form = { role: "bhw", staff_role: "midwife", permissions: ["patients.register"], barangay_health_center_id: 1, rural_health_unit_id: null };

  assert.deepEqual(applyFacilityChange(form, "bhw", 2), { ...form, barangay_health_center_id: 2 });
  assert.deepEqual(applyFacilityChange(form, "rhu_staff", 5), { ...form, role: "rhu_staff", staff_role: "", permissions: [], barangay_health_center_id: null, rural_health_unit_id: 5 });
  assert.deepEqual(applyFacilityChange(form, "admin", null), { ...form, role: "admin", staff_role: "", permissions: [], barangay_health_center_id: null, rural_health_unit_id: null });
});
