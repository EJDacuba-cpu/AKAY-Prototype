import test from "node:test";
import assert from "node:assert/strict";
import { compatiblePermissions } from "./accountSetup.js";
import { PERMISSION_PRESETS } from "./actionPermissions.js";

test("conditions.confirm is offered only to RHU staff", () => {
  assert.ok(compatiblePermissions("doctor", "rhu_staff").includes("conditions.confirm"));
  assert.ok(!compatiblePermissions("nurse", "bhw").includes("conditions.confirm"));
  assert.ok(!compatiblePermissions("encoder", "rhu_staff").includes("conditions.confirm"));
});

test("only the RHU preset carries conditions.confirm", () => {
  assert.ok(PERMISSION_PRESETS.rhu.permissions.includes("conditions.confirm"));
  for (const key of ["clinical", "encoder", "inventory"]) assert.ok(!PERMISSION_PRESETS[key].permissions.includes("conditions.confirm"));
});
