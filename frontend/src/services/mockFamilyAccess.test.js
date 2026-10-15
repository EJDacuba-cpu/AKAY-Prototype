import { test } from "node:test";
import assert from "node:assert/strict";
import { backendPermissions, readFamilyAccess, saveFamilyAccess, withFamilyRoleSuggestions } from "./mockFamilyAccess.js";
import { setPermission } from "../utils/accessPolicy.js";
import { navigationAllowed } from "../utils/dashboardAccess.js";
import { canAccessModule } from "../config/accessModules.js";

const user = { id: 3, role: "bhc", staff_role: "bhw", barangay_health_center_id: 2 };
function memoryStorage() { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; }

test("suggested role access grants nothing until admin saves, scoped to account and facility", () => {
  const storage = memoryStorage();
  assert.deepEqual(readFamilyAccess(user, storage), []);
  saveFamilyAccess(user, ["families.manage"], storage);
  assert.deepEqual(readFamilyAccess(user, storage), ["families.view", "families.manage"]);
  assert.deepEqual(readFamilyAccess({ ...user, id: 4 }, storage), []);
  assert.deepEqual(readFamilyAccess({ ...user, working_facility_key: "bhc:8" }, storage), []);
  saveFamilyAccess(user, [], storage);
  assert.deepEqual(readFamilyAccess(user, storage), []);
});

test("view and manage gates are separate and manage depends on view", () => {
  const viewer = { ...user, permissions: ["families.view"] };
  assert.ok(canAccessModule(viewer, "families"));
  assert.ok(!canAccessModule(viewer, "familiesManage"));
  assert.ok(navigationAllowed(viewer, "/bhc/families"));
  assert.ok(!navigationAllowed({ ...user, permissions: [] }, "/bhc/families"));
  assert.deepEqual(setPermission([], "families.manage", true), ["families.view", "families.manage"]);
  assert.deepEqual(setPermission(["families.view", "families.manage"], "families.view", false), []);
});

test("mock permissions are stripped from API payloads, role suggestions do not mutate API metadata", () => {
  assert.deepEqual(backendPermissions(["patients.register", "families.view", "families.manage"]), ["patients.register"]);
  const data = { roles: [{ key: "bhw", defaults: ["patients.register"] }, { key: "doctor", defaults: ["clinical.history"] }], available: { bhc: ["patients.register"] } };
  const before = structuredClone(data), decorated = withFamilyRoleSuggestions(data);
  assert.deepEqual(data, before);
  assert.ok(decorated.roles[0].defaults.includes("families.manage"));
  assert.ok(!decorated.roles[1].defaults.includes("families.manage"));
});
