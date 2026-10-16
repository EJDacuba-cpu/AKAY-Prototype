import { test } from "node:test";
import assert from "node:assert/strict";
import { menuByRole } from "../components/layout/sidebar/sidebarData.js";
import { canAccessModule } from "../config/accessModules.js";
import { navigationAllowed } from "./dashboardAccess.js";
import { setPermission } from "./accessPolicy.js";

const items = role => menuByRole[role].flatMap(section => section.items);

test("Families is not an Admin/MHO module", () => {
  assert.ok(!items("admin").some(item => /famil/i.test(item.label) || /famil/i.test(item.path)));
});

test("BHC lists Families directly below Patients, and RHU keeps its placement", () => {
  const bhc = items("bhc").map(item => item.label);
  assert.equal(bhc[bhc.indexOf("Patients") + 1], "Families");
  assert.ok(items("rhu").some(item => item.path === "/rhu/families"));
});

test("view and manage gates are separate and manage depends on view", () => {
  const viewer = { role: "bhc", permissions: ["families.view"] };
  assert.ok(canAccessModule(viewer, "families"));
  assert.ok(!canAccessModule(viewer, "familiesManage"));
  assert.ok(navigationAllowed(viewer, "/bhc/families"));
  assert.ok(!navigationAllowed({ role: "bhc", permissions: [] }, "/bhc/families"));
  assert.ok(!navigationAllowed({ role: "rhu", permissions: ["clinical.history"] }, "/rhu/families"));
  assert.deepEqual(setPermission([], "families.manage", true), ["families.view", "families.manage"]);
  assert.deepEqual(setPermission(["families.view", "families.manage"], "families.view", false), []);
});
