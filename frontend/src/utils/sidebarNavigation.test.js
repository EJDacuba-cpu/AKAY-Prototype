import { test } from "node:test";
import assert from "node:assert/strict";
import { menuByRole } from "../components/layout/sidebar/sidebarData.js";
import {
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
