import test from "node:test";
import assert from "node:assert/strict";
import { sidebarAccountRoleLabel, sidebarAccountSubtitle, sidebarHomeFacilityName } from "./sidebarAccountRole.js";

test("admin accounts show Admin only", () => {
  assert.equal(sidebarAccountRoleLabel({ role: "admin", backendRole: "admin" }), "Admin");
  assert.equal(sidebarAccountSubtitle({ role: "admin", backendRole: "admin", facility: "Municipal Health Office" }), "Admin");
});

test("staff accounts use their staff_role label", () => {
  assert.equal(sidebarAccountRoleLabel({ backendRole: "bhc", role: "bhc", staff_role: "midwife" }), "Midwife");
  assert.equal(sidebarAccountRoleLabel({ backendRole: "bhc", role: "bhc", staff_role: "encoder" }), "Encoder");
  assert.equal(sidebarAccountRoleLabel({ backendRole: "rhu", role: "rhu", staff_role: "doctor" }), "Doctor");
  assert.equal(sidebarAccountRoleLabel({ backendRole: "rhu", role: "rhu", staff_role: "intake_staff" }), "RHU Staff");
});

test("subtitle includes the registered BHC or RHU", () => {
  assert.equal(
    sidebarAccountSubtitle({
      backendRole: "bhc",
      role: "bhc",
      staff_role: "midwife",
      assignedBarangayHealthCenter: "Pitpitan",
    }),
    "Midwife · Pitpitan",
  );
  assert.equal(
    sidebarAccountSubtitle({
      backendRole: "bhc",
      role: "bhc",
      staff_role: "encoder",
      assignedBarangayHealthCenter: "Bambang",
    }),
    "Encoder · Bambang",
  );
  assert.equal(
    sidebarAccountSubtitle({
      backendRole: "rhu",
      role: "rhu",
      staff_role: "doctor",
      assignedRuralHealthUnit: "RHU 2",
    }),
    "Doctor · RHU 2",
  );
});

test("keeps home RHU on the card after a nurse switches into a BHC", () => {
  const nurse = {
    backendRole: "rhu",
    role: "bhc",
    staff_role: "nurse",
    facility: "Pitpitan BHC",
    assignedRuralHealthUnit: "Bulakan RHU",
  };
  assert.equal(sidebarHomeFacilityName(nurse), "Bulakan RHU");
  assert.equal(sidebarAccountSubtitle(nurse), "Nurse · Bulakan RHU");
});

test("falls back to BHC Staff or RHU Staff when staff_role is missing", () => {
  assert.equal(sidebarAccountRoleLabel({ backendRole: "bhc", role: "bhc" }), "BHC Staff");
  assert.equal(sidebarAccountSubtitle({ backendRole: "rhu", role: "rhu", facility: "Main RHU" }), "RHU Staff · Main RHU");
});
