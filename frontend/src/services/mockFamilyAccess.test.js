import { test } from "node:test";
import assert from "node:assert/strict";
import { backendPermissions, readFamilyAccess, saveFamilyAccess, withFamilyAccess, withFamilyRoleSuggestions } from "./mockFamilyAccess.js";
import { setPermission } from "../utils/accessPolicy.js";
import { navigationAllowed } from "../utils/dashboardAccess.js";
import { canAccessModule } from "../config/accessModules.js";

const user = { id: 3, role: "rhu", staff_role: "nurse", rural_health_unit_id: 2 };
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

test("BHC account payloads preserve server grants while RHU mock grants stay local", () => {
  const permissions = ["patients.register", "families.view", "families.manage"];
  assert.deepEqual(backendPermissions(permissions, "bhc"), permissions);
  assert.deepEqual(backendPermissions(permissions, "rhu"), ["patients.register"]);
});

test("BHC auth never reads browser Families grants, including old saved grants", () => {
  const storage = memoryStorage();
  const bhc = { id: 3, role: "bhc", barangay_health_center_id: 2, permissions: ["patients.register", "families.view"] };
  storage.setItem("akay.mock-family-access.v1", JSON.stringify({ "3|bhc:2": ["families.view", "families.manage"] }));
  assert.deepEqual(readFamilyAccess(bhc, storage), []);
  assert.deepEqual(withFamilyAccess(bhc, storage).permissions, bhc.permissions);
  saveFamilyAccess(bhc, ["families.manage"], storage);
  assert.deepEqual(withFamilyAccess({ ...bhc, permissions: [] }, storage).permissions, []);
  assert.deepEqual(readFamilyAccess({ ...user, working_facility_key: "bhc:2" }, storage), []);
});

test("RHU prototype adapter remains scoped to its own facility", () => {
  const storage = memoryStorage();
  saveFamilyAccess(user, ["families.manage"], storage);
  assert.deepEqual(withFamilyAccess({ ...user, permissions: ["clinical.history"] }, storage).permissions, ["clinical.history", "families.view", "families.manage"]);
});

test("BHC role metadata stays server owned without implicit Families defaults", () => {
  const data = { roles: [{ key: "bhw", tier: "bhc", defaults: ["patients.register"] }, { key: "doctor", tier: "rhu", defaults: ["clinical.history"] }], available: { bhc: ["patients.register", "families.view", "families.manage"] } };
  const before = structuredClone(data), decorated = withFamilyRoleSuggestions(data);
  assert.deepEqual(data, before);
  assert.deepEqual(decorated.available.bhc, data.available.bhc);
  assert.deepEqual(decorated.roles[0].defaults, data.roles[0].defaults);
  assert.ok(!decorated.roles[1].defaults.includes("families.manage"));
});
