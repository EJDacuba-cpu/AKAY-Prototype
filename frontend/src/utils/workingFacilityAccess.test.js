import test from "node:test";
import assert from "node:assert/strict";
import { canShowWorkingFacilitySelector } from "./workingFacilityAccess.js";

const home = { key: "home", name: "Home RHU", type: "rhu", is_home: true };
const bhc = { key: "12", name: "Pitpitan BHC", type: "bhc", is_home: false };

test("hides selector for a nurse with only the home facility", () => {
  assert.equal(
    canShowWorkingFacilitySelector({
      role: "rhu",
      backendRole: "rhu",
      staff_role: "nurse",
      authorized_facilities: [home],
    }),
    false,
  );
});

test("shows selector for an RHU nurse with home plus an active BHC assignment", () => {
  assert.equal(
    canShowWorkingFacilitySelector({
      role: "rhu",
      backendRole: "rhu",
      staff_role: "nurse",
      authorized_facilities: [home, bhc],
    }),
    true,
  );
});

test("still shows after the nurse has switched into a BHC (role becomes bhc)", () => {
  assert.equal(
    canShowWorkingFacilitySelector({
      role: "bhc",
      backendRole: "rhu",
      staff_role: "nurse",
      working_facility_key: "12",
      authorized_facilities: [home, bhc, { key: "13", name: "Other BHC", type: "bhc", is_home: false }],
    }),
    true,
  );
});

test("hides for doctors, encoders, BHC workers, intake staff, and admin", () => {
  const multi = [home, bhc];
  assert.equal(canShowWorkingFacilitySelector({ role: "rhu", backendRole: "rhu", staff_role: "doctor", authorized_facilities: multi }), false);
  assert.equal(canShowWorkingFacilitySelector({ role: "bhc", backendRole: "bhc", staff_role: "encoder", authorized_facilities: [home] }), false);
  assert.equal(canShowWorkingFacilitySelector({ role: "bhc", backendRole: "bhc", staff_role: "midwife", authorized_facilities: [home] }), false);
  assert.equal(canShowWorkingFacilitySelector({ role: "rhu", backendRole: "rhu", staff_role: "intake_staff", authorized_facilities: multi }), false);
  assert.equal(canShowWorkingFacilitySelector({ role: "admin", backendRole: "admin", authorized_facilities: multi }), false);
});

test("does not treat role === rhu alone as enough to show the selector", () => {
  assert.equal(
    canShowWorkingFacilitySelector({
      role: "rhu",
      backendRole: "rhu",
      staff_role: "doctor",
      authorized_facilities: [home, bhc],
    }),
    false,
  );
});
