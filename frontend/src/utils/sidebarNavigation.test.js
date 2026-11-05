import { test } from "node:test";
import assert from "node:assert/strict";
import { menuByRole } from "../components/layout/sidebar/sidebarData.js";
import {
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
