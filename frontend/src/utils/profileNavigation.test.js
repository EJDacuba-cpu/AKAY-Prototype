import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConsultationProfileState,
  buildProfileReturnState,
  getConsultationBackground,
  getProfileReturnPath,
} from "./profileNavigation.js";

const consultation = {
  pathname: "/bhc/health-records/add",
  search: "?patientId=7&draftId=42",
  hash: "",
};

test("Back falls back to Patients when the profile has no origin", () => {
  assert.equal(getProfileReturnPath({ state: null }, "/bhc/patients"), "/bhc/patients");
});

test("Back returns to the exact originating page, query included", () => {
  const location = { state: buildProfileReturnState({ pathname: "/bhc/health-records/15", search: "?tab=vitals", hash: "" }) };
  assert.equal(getProfileReturnPath(location, "/bhc/patients"), "/bhc/health-records/15?tab=vitals");
});

test("Back never follows an external or protocol-relative returnTo", () => {
  for (const returnTo of ["https://evil.example", "//evil.example", "javascript:alert(1)", 42]) {
    assert.equal(getProfileReturnPath({ state: { returnTo } }, "/bhc/patients"), "/bhc/patients");
  }
});

test("View Full Profile keeps the full consultation URL as the Back target", () => {
  const state = buildConsultationProfileState(consultation, 380);
  assert.equal(state.returnTo, "/bhc/health-records/add?patientId=7&draftId=42");
  assert.equal(state.scrollTop, 380);
});

test("the consultation stays in the background only on the BHC profile route", () => {
  const state = buildConsultationProfileState(consultation);
  const background = getConsultationBackground({ pathname: "/bhc/patients/7", state });
  assert.equal(background.pathname, "/bhc/health-records/add");
  assert.equal(background.search, "?patientId=7&draftId=42");

  assert.equal(getConsultationBackground({ pathname: "/bhc/referrals", state }), null);
});

test("a plain profile visit never hides a background page", () => {
  const state = buildProfileReturnState({ pathname: "/bhc/health-records/15", search: "", hash: "" });
  assert.equal(getConsultationBackground({ pathname: "/bhc/patients/7", state }), null);
  assert.equal(getConsultationBackground({ pathname: "/bhc/patients/7", state: null }), null);
});
