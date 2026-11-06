import { test } from "node:test";
import assert from "node:assert/strict";
import { menuByRole } from "../components/layout/sidebar/sidebarData.js";
import { navigationAllowed } from "./dashboardAccess.js";
import {
  ADMIN_ACCOUNT_MANAGEMENT_PARENT_PATH,
  applySidebarAccess,
  hasSidebarOpenIntent,
  isSidebarPathActive,
  normalizeRhuPatientView,
  RHU_PATIENT_VIEW_ALL,
  RHU_PATIENT_VIEW_QUEUE,
} from "./sidebarNavigation.js";

test("normalizeRhuPatientView defaults to queue and only treats view=all as directory", () => {
  assert.equal(normalizeRhuPatientView(""), RHU_PATIENT_VIEW_QUEUE);
  assert.equal(normalizeRhuPatientView("view=queue"), RHU_PATIENT_VIEW_QUEUE);
  assert.equal(normalizeRhuPatientView("view=all"), RHU_PATIENT_VIEW_ALL);
  assert.equal(normalizeRhuPatientView(new URLSearchParams()), RHU_PATIENT_VIEW_QUEUE);
});

test("RHU Patients sidebar nests Today's Queue and All Patients like BHC", () => {
  const patients = menuByRole.rhu
    .flatMap((section) => section.items)
    .find((item) => item.path === "/rhu/patients");

  assert.ok(patients?.children?.length);
  assert.equal(patients.defaultPath, "/rhu/patients");
  assert.deepEqual(
    patients.children.map((child) => child.label),
    ["Today's Queue", "All Patients"],
  );
  assert.deepEqual(
    patients.children.map((child) => child.path),
    ["/rhu/patients?view=queue", "/rhu/patients?view=all"],
  );
});

test("RHU reports sidebar type matching highlights the normalized category", () => {
  const patientVisitsLocation = {
    pathname: "/rhu/reports",
    search: "?type=patient-visits",
  };
  assert.equal(
    isSidebarPathActive("/rhu/reports?type=patient-visits", patientVisitsLocation, "rhu"),
    true,
  );
  assert.equal(
    isSidebarPathActive("/rhu/reports?type=overview", patientVisitsLocation, "rhu"),
    false,
  );
});

test("RHU reports sidebar treats missing type as overview", () => {
  const bareReports = { pathname: "/rhu/reports", search: "" };
  assert.equal(
    isSidebarPathActive("/rhu/reports?type=overview", bareReports, "rhu"),
    true,
  );
  assert.equal(
    isSidebarPathActive("/rhu/reports?type=patient-visits", bareReports, "rhu"),
    false,
  );
});

test("RHU reports refresh with an unknown type highlights overview", () => {
  const refreshed = { pathname: "/rhu/reports", search: "?type=nope" };
  assert.equal(
    isSidebarPathActive("/rhu/reports?type=overview", refreshed, "rhu"),
    true,
  );
  assert.equal(
    isSidebarPathActive("/rhu/reports?type=patient-visits", refreshed, "rhu"),
    false,
  );
  assert.equal(isSidebarPathActive("/rhu/reports", refreshed, "rhu"), true);
});

test("RHU reports refresh with a category alias highlights the canonical child", () => {
  const refreshed = { pathname: "/rhu/reports", search: "?type=referral-reports" };
  assert.equal(
    isSidebarPathActive("/rhu/reports?type=referrals", refreshed, "rhu"),
    true,
  );
  assert.equal(
    isSidebarPathActive("/rhu/reports?type=overview", refreshed, "rhu"),
    false,
  );
});

test("RHU Patients sidebar children stay query-aware on refresh and bare /rhu/patients", () => {
  const queueLocation = { pathname: "/rhu/patients", search: "" };
  const queueExplicit = { pathname: "/rhu/patients", search: "?view=queue" };
  const allLocation = { pathname: "/rhu/patients", search: "?view=all" };

  assert.equal(
    isSidebarPathActive("/rhu/patients?view=queue", queueLocation, "rhu"),
    true,
  );
  assert.equal(
    isSidebarPathActive("/rhu/patients?view=queue", queueExplicit, "rhu"),
    true,
  );
  assert.equal(
    isSidebarPathActive("/rhu/patients?view=all", queueLocation, "rhu"),
    false,
  );
  assert.equal(
    isSidebarPathActive("/rhu/patients?view=all", allLocation, "rhu"),
    true,
  );
  assert.equal(
    isSidebarPathActive("/rhu/patients?view=queue", allLocation, "rhu"),
    false,
  );
  assert.equal(isSidebarPathActive("/rhu/patients", queueLocation, "rhu"), true);
  assert.equal(isSidebarPathActive("/rhu/patients", allLocation, "rhu"), true);
});

test("RHU Patient Intake sidebar nests Incoming Referrals and Walk-in Check-in", () => {
  const intake = menuByRole.rhu
    .flatMap((section) => section.items)
    .find((item) => item.path === "/rhu/patient-intake");
  assert.ok(intake?.children?.length);
  assert.equal(intake.label, "Patient Intake");
  assert.equal(intake.defaultPath, "/rhu/incoming-referrals");
  assert.deepEqual(
    intake.children.map((c) => c.label),
    ["Incoming Referrals", "Walk-in Check-in"],
  );
  assert.deepEqual(
    intake.children.map((c) => c.path),
    ["/rhu/incoming-referrals", "/rhu/walk-in-check-in"],
  );
  const flatLabels = menuByRole.rhu.flatMap((s) => s.items).map((i) => i.label);
  assert.equal(flatLabels.includes("QR Scanner"), false);
});

test("Patient Intake open intent stays true on child routes after defaultPath navigation", () => {
  const openGroup = "/rhu/patient-intake";
  assert.equal(
    hasSidebarOpenIntent({
      pathname: "/rhu/incoming-referrals",
      state: { openSidebarGroup: openGroup },
    }),
    true,
  );
  assert.equal(
    hasSidebarOpenIntent({
      pathname: "/rhu/patients",
      state: { openSidebarGroup: openGroup },
    }),
    false,
  );
});

test("RHU Medicine and Supply sidebar nests Inventory and To Dispense", () => {
  const medicine = menuByRole.rhu
    .flatMap((section) => section.items)
    .find((item) => item.path === "/rhu/medicine-and-supply");
  assert.ok(medicine?.children?.length);
  assert.equal(medicine.label, "Medicine and Supply");
  assert.equal(medicine.defaultPath, "/rhu/medicine-management");
  assert.deepEqual(
    medicine.children.map((c) => c.label),
    ["Inventory", "To Dispense"],
  );
  assert.deepEqual(
    medicine.children.map((c) => c.path),
    ["/rhu/medicine-management", "/rhu/to-dispense"],
  );
  assert.equal(medicine.children[0].hideWhenDenied, true);
  assert.equal(medicine.children[1].hideWhenDenied, true);
  const bhc = menuByRole.bhc
    .flatMap((section) => section.items)
    .find((item) => item.label === "Medicine and Supply");
  assert.equal(bhc.path, "/bhc/medicine-availability");
  assert.equal(bhc.children, undefined);
});

test("Medicine parent stays active on inventory, details, and to-dispense", () => {
  const parent = "/rhu/medicine-and-supply";
  for (const pathname of [
    "/rhu/medicine-management",
    "/rhu/medicine-management/med-1",
    "/rhu/to-dispense",
  ]) {
    assert.equal(isSidebarPathActive(parent, { pathname, search: "" }, "rhu"), true);
  }
  assert.equal(
    isSidebarPathActive(parent, { pathname: "/rhu/patients", search: "" }, "rhu"),
    false,
  );
  assert.equal(
    isSidebarPathActive("/rhu/to-dispense", { pathname: "/rhu/to-dispense", search: "" }, "rhu"),
    true,
  );
});

test("Patient Intake parent stays active on intake routes including QR Scanner", () => {
  const parent = "/rhu/patient-intake";
  for (const pathname of [
    "/rhu/incoming-referrals",
    "/rhu/walk-in-check-in",
    "/rhu/qr-scanner",
    "/rhu/referrals/TRK-1",
  ]) {
    assert.equal(isSidebarPathActive(parent, { pathname, search: "" }, "rhu"), true);
  }
  assert.equal(isSidebarPathActive(parent, { pathname: "/rhu/patients", search: "" }, "rhu"), false);
  assert.equal(
    isSidebarPathActive("/rhu/walk-in-check-in", { pathname: "/rhu/walk-in-check-in", search: "?patient_id=9" }, "rhu"),
    true,
  );
});

test("Admin Account Management sidebar nests Directory, Reset Requests, and Invites", () => {
  const accountManagement = menuByRole.admin
    .flatMap((section) => section.items)
    .find((item) => item.path === ADMIN_ACCOUNT_MANAGEMENT_PARENT_PATH);

  assert.ok(accountManagement?.children?.length);
  assert.equal(accountManagement.label, "Accounts");
  assert.equal(accountManagement.defaultPath, "/admin/users");
  assert.deepEqual(
    accountManagement.children.map((child) => child.label),
    ["Account Directory", "Reset Requests", "Invites"],
  );
  assert.deepEqual(
    accountManagement.children.map((child) => child.path),
    ["/admin/users", "/admin/password-reset-requests", "/admin/account-invites"],
  );

  const accountability = menuByRole.admin.find((section) => section.section === "Accountability");
  assert.deepEqual(
    accountability.items.map((item) => item.label),
    ["Reports", "Audit Logs"],
  );
});

test("Account Management parent stays active on child and account-setup routes", () => {
  const parent = ADMIN_ACCOUNT_MANAGEMENT_PARENT_PATH;
  for (const pathname of [
    "/admin/users",
    "/admin/users/add",
    "/admin/doctors/add",
    "/admin/password-reset-requests",
    "/admin/account-invites",
  ]) {
    assert.equal(isSidebarPathActive(parent, { pathname, search: "" }, "admin"), true);
  }
  assert.equal(
    isSidebarPathActive(parent, { pathname: "/admin/facilities", search: "" }, "admin"),
    false,
  );
  assert.equal(
    isSidebarPathActive("/admin/users", { pathname: "/admin/users/add", search: "" }, "admin"),
    true,
  );
  assert.equal(
    isSidebarPathActive("/admin/users", { pathname: "/admin/account-invites", search: "" }, "admin"),
    false,
  );
  assert.equal(
    isSidebarPathActive(
      "/admin/password-reset-requests",
      { pathname: "/admin/password-reset-requests", search: "" },
      "admin",
    ),
    true,
  );
  assert.equal(
    isSidebarPathActive(
      "/admin/account-invites",
      { pathname: "/admin/account-invites", search: "" },
      "admin",
    ),
    true,
  );
});

test("Account Management open intent stays true on child routes after defaultPath navigation", () => {
  const openGroup = ADMIN_ACCOUNT_MANAGEMENT_PARENT_PATH;
  assert.equal(
    hasSidebarOpenIntent({
      pathname: "/admin/users",
      state: { openSidebarGroup: openGroup },
    }),
    true,
  );
  assert.equal(
    hasSidebarOpenIntent({
      pathname: "/admin/account-invites",
      state: { openSidebarGroup: openGroup },
    }),
    true,
  );
  assert.equal(
    hasSidebarOpenIntent({
      pathname: "/admin/facilities",
      state: { openSidebarGroup: openGroup },
    }),
    false,
  );
});

test("applySidebarAccess leaves query-style defaultPath unchanged when no matching child was removed", () => {
  const allowAll = () => true;
  const queryParents = ["bhc", "rhu"].flatMap((role) =>
    menuByRole[role]
      .flatMap((section) => section.items)
      .filter(
        (item) =>
          item.children?.length &&
          !item.children.some((child) => child.path === item.defaultPath),
      ),
  );
  assert.ok(queryParents.some((item) => item.path === "/bhc/patients"));
  assert.ok(queryParents.some((item) => item.path === "/bhc/referrals"));
  assert.ok(queryParents.some((item) => item.path === "/bhc/reports"));
  assert.ok(queryParents.some((item) => item.path === "/rhu/patients"));

  for (const item of queryParents) {
    const mapped = applySidebarAccess(item, { role: "rhu", permissions: [] }, allowAll);
    assert.equal(mapped.defaultPath, item.defaultPath, item.path);
    assert.equal(mapped.children.length, item.children.length, item.path);
  }

  const patients = menuByRole.rhu
    .flatMap((section) => section.items)
    .find((item) => item.path === "/rhu/patients");
  const filteredQueue = {
    ...patients,
    children: patients.children.map((child, index) =>
      index === 1 ? { ...child, hideWhenDenied: true } : child,
    ),
  };
  const stillBare = applySidebarAccess(filteredQueue, {}, () => false);
  assert.equal(stillBare.defaultPath, "/rhu/patients");
  assert.deepEqual(
    stillBare.children.map((child) => child.path),
    ["/rhu/patients?view=queue"],
  );
});

test("applySidebarAccess retargets defaultPath only after the matching child is denied", () => {
  const medicine = menuByRole.rhu
    .flatMap((section) => section.items)
    .find((item) => item.path === "/rhu/medicine-and-supply");
  const dispenseOnly = { role: "rhu", permissions: ["items.dispense"] };
  const inventoryOnly = { role: "rhu", permissions: ["inventory.view"] };
  const both = { role: "rhu", permissions: ["inventory.view", "items.dispense"] };

  const dispenseMenu = applySidebarAccess(medicine, dispenseOnly, navigationAllowed);
  assert.deepEqual(dispenseMenu.children.map((child) => child.path), ["/rhu/to-dispense"]);
  assert.equal(dispenseMenu.defaultPath, "/rhu/to-dispense");
  assert.equal(dispenseMenu.locked, false);

  const inventoryMenu = applySidebarAccess(medicine, inventoryOnly, navigationAllowed);
  assert.deepEqual(inventoryMenu.children.map((child) => child.path), ["/rhu/medicine-management"]);
  assert.equal(inventoryMenu.defaultPath, "/rhu/medicine-management");

  const bothMenu = applySidebarAccess(medicine, both, navigationAllowed);
  assert.equal(bothMenu.defaultPath, "/rhu/medicine-management");
  assert.equal(bothMenu.children.length, 2);

  const neither = applySidebarAccess(medicine, { role: "rhu", permissions: [] }, navigationAllowed);
  assert.deepEqual(neither.children, []);
  assert.equal(neither.defaultPath, "/rhu/medicine-management");
  assert.equal(neither.locked, true);

  const reports = applySidebarAccess(
    { label: "Reports", path: "/rhu/reports" },
    { role: "rhu", permissions: [] },
    navigationAllowed,
  );
  assert.equal(reports.children, undefined);
  assert.equal(reports.defaultPath, undefined);
  assert.equal(reports.locked, true);
});

test("locked RHU Reports item keeps category children behind the parent lock", () => {
  const reports = menuByRole.rhu
    .flatMap((section) => section.items)
    .find((item) => item.path === "/rhu/reports");
  assert.ok(reports?.children?.length > 1);

  const denied = { role: "rhu", permissions: ["patients.register"] };
  const locked = applySidebarAccess(reports, denied, navigationAllowed);
  assert.equal(locked.locked, true);
  assert.equal(locked.defaultPath, "/rhu/reports?type=overview");
  assert.equal(locked.children.length, reports.children.length);
  for (const child of locked.children) {
    assert.equal(navigationAllowed(denied, child.path), false, child.path);
  }

  const allowed = applySidebarAccess(
    reports,
    { role: "rhu", permissions: ["reports.view"] },
    navigationAllowed,
  );
  assert.equal(allowed.locked, false);
  assert.equal(allowed.children.length, reports.children.length);
});
