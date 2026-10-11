import test from "node:test";
import assert from "node:assert/strict";
import {
  facilityNote,
  initialPresetSelection,
  overrideTier,
  reviewPermissions,
  setPermission,
  togglePreset,
} from "./accessPolicy.js";
import { accessSummary } from "./accountSetup.js";
import { PERMISSION_PRESETS } from "./actionPermissions.js";

const empty = { permissions: [], presets: [] };
const sorted = list => [...list].sort();

test("presets stack and turning one off keeps duties another selected preset covers", () => {
  const both = togglePreset(togglePreset(empty, "encoder"), "inventory");
  assert.deepEqual(sorted(both.permissions), sorted(["patients.register", "consultations.encode", "inventory.view", "inventory.manage"]));
  assert.deepEqual(both.presets, ["encoder", "inventory"]);

  const encoderOnly = togglePreset(both, "inventory");
  assert.deepEqual(sorted(encoderOnly.permissions), sorted(PERMISSION_PRESETS.encoder.permissions));
  assert.deepEqual(encoderOnly.presets, ["encoder"]);
});

test("turning a preset off leaves individually ticked extras and nothing it implied", () => {
  const withHistory = setPermission(togglePreset(empty, "encoder"), "clinical.history", true);
  assert.deepEqual(togglePreset(withHistory, "encoder").permissions, ["clinical.history"]);
  assert.deepEqual(togglePreset(togglePreset(empty, "clinical"), "clinical"), empty);
});

test("requirements cascade both ways and unticking a preset duty unselects the preset", () => {
  const manage = setPermission(empty, "inventory.manage", true);
  assert.deepEqual(sorted(manage.permissions), ["inventory.manage", "inventory.view"]);
  assert.deepEqual(setPermission(manage, "inventory.view", false).permissions, []);

  const clinical = togglePreset(empty, "clinical");
  const noHistory = setPermission(clinical, "clinical.history", false);
  for (const dependent of ["clinical.history", "consultations.finalize", "records.correct", "followups.manage", "referrals.submit"]) {
    assert.ok(!noHistory.permissions.includes(dependent), dependent);
  }
  assert.deepEqual(noHistory.presets, []);
});

test("override tiers follow the designation and home facility", () => {
  assert.equal(overrideTier("inventory.view", "Encoder", "bhw"), null);
  assert.equal(overrideTier("inventory.manage", "Encoder", "bhw"), "sensitive");
  assert.equal(overrideTier("clinical.history", "Encoder", "bhw"), "sensitive");
  assert.equal(overrideTier("consultations.finalize", "Encoder", "bhw"), "critical");
  assert.equal(overrideTier("patients.register", "Logistics", "bhw"), "override");
  assert.equal(overrideTier("conditions.confirm", "Midwife", "bhw"), "sensitive");
  assert.equal(overrideTier("conditions.confirm", "Doctor", "rhu_staff"), null);
  assert.equal(facilityNote("rhu.manage", "bhw"), "Only used on RHU screens; this account's home is a BHC.");
  assert.equal(facilityNote("rhu.manage", "rhu_staff"), null);
});

test("review separates defaults, hand-added duties and overrides, with an edit diff", () => {
  const review = reviewPermissions({
    designation: "Encoder",
    role: "bhw",
    presets: ["encoder"],
    permissions: ["patients.register", "inventory.view", "clinical.history", "consultations.finalize"],
    previous: ["patients.register", "consultations.encode", "inventory.view"],
  });
  assert.deepEqual(review.rows.map(row => [row.key, row.source]), [
    ["patients.register", "default"], ["inventory.view", "default"], ["clinical.history", "override"], ["consultations.finalize", "override"],
  ]);
  assert.deepEqual(review.critical.map(row => row.key), ["consultations.finalize"]);
  assert.deepEqual(review.sensitive.map(row => row.key), ["clinical.history"]);
  assert.deepEqual(review.added, ["clinical.history", "consultations.finalize"]);
  assert.deepEqual(review.removed, ["consultations.encode"]);
  assert.ok(review.hasCritical && review.requiresAcknowledgement);
  assert.ok(!reviewPermissions({ designation: "Midwife", role: "bhw", presets: ["clinical"], permissions: PERMISSION_PRESETS.clinical.permissions }).requiresAcknowledgement);
});

test("existing accounts reselect only the outermost preset they hold", () => {
  assert.deepEqual(initialPresetSelection(PERMISSION_PRESETS.clinical.permissions), ["clinical"]);
  assert.deepEqual(initialPresetSelection([...PERMISSION_PRESETS.encoder.permissions, "inventory.manage"]), ["encoder", "inventory"]);
});

test("directory label counts overrides and flags critical ones", () => {
  const encoder = { role: "bhw", professional_designation: "Encoder", permissions: [...PERMISSION_PRESETS.encoder.permissions, "inventory.manage", "clinical.history"] };
  assert.deepEqual(accessSummary(encoder), { label: "Encoder · +2 overrides", overrides: 2, critical: false });
  assert.equal(accessSummary({ ...encoder, permissions: [...encoder.permissions, "consultations.finalize"] }).critical, true);
  assert.equal(accessSummary({ role: "bhw", professional_designation: "Midwife", permissions: PERMISSION_PRESETS.clinical.permissions }).label, "Clinical Staff");
});

test("directory accounts with frontend roles are judged against their backend role", () => {
  const rhuNurse = { role: "rhu", backendRole: "rhu_staff", professional_designation: "Nurse", permissions: PERMISSION_PRESETS.rhu.permissions };
  assert.deepEqual(accessSummary(rhuNurse), { label: "RHU Staff", overrides: 0, critical: false });
  assert.deepEqual(accessSummary({ ...rhuNurse, backendRole: undefined }), { label: "RHU Staff", overrides: 0, critical: false });
});
