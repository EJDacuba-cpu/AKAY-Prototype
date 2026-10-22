import test from "node:test";
import assert from "node:assert/strict";

import { canModifyRhuPatient, sameAssignedId } from "./rhuPatientAccess.js";

test("same assigned id requires both sides to match a non-empty value", () => {
  assert.equal(sameAssignedId(4, "4"), true);
  assert.equal(sameAssignedId("", ""), false);
  assert.equal(sameAssignedId(null, 4), false);
  assert.equal(sameAssignedId(4, 9), false);
});

test("RHU staff can edit only owned patients they may register", () => {
  const user = { ruralHealthUnitId: 12, permissions: ["patients.register", "clinical.history"] };
  assert.equal(canModifyRhuPatient(user, { ruralHealthUnitId: 12 }), true);
  assert.equal(canModifyRhuPatient(user, { rural_health_unit_id: "12" }), true);
});

test("referred BHC patients stay view-only until the RHU owns them", () => {
  const user = { ruralHealthUnitId: 12, permissions: ["patients.register", "clinical.history"] };
  assert.equal(canModifyRhuPatient(user, { ruralHealthUnitId: null, barangayHealthCenterId: 3 }), false);
  assert.equal(canModifyRhuPatient(user, { ruralHealthUnitId: 99 }), false);
});

test("history without register cannot rewrite RHU patient identity", () => {
  const user = { ruralHealthUnitId: 12, permissions: ["clinical.history"] };
  assert.equal(canModifyRhuPatient(user, { ruralHealthUnitId: 12 }), false);
});
