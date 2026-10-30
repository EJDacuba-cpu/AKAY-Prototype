import test from "node:test";
import assert from "node:assert/strict";
import { getBreadcrumbs } from "./breadcrumbs.js";

test("top-level routes show only the current page", () => {
  assert.deepEqual(getBreadcrumbs("/rhu/patients", "Patients"), [
    { label: "Patients" },
  ]);
});

test("detail routes get their parent list", () => {
  assert.deepEqual(getBreadcrumbs("/rhu/patients/42", "Patient Details"), [
    { label: "Patients", path: "/rhu/patients" },
    { label: "Patient Details" },
  ]);
});

test('medicine details in both facilities link back to Health Commodities', () => {
  for (const [role, path] of [['bhc', 'medicine-availability'], ['rhu', 'medicine-management']]) {
    assert.deepEqual(getBreadcrumbs(`/${role}/${path}/7`, 'Medicine Details'), [
      { label: 'Health Commodities', path: `/${role}/${path}` }, { label: 'Medicine Details' },
    ]);
  }
});

test("static /add route resolves to its own parent", () => {
  assert.deepEqual(getBreadcrumbs("/bhc/patients/add", "Add Patient"), [
    { label: "Patients", path: "/bhc/patients" },
    { label: "Add Patient" },
  ]);
});

test("referral details map to the incoming referrals inbox", () => {
  assert.deepEqual(getBreadcrumbs("/rhu/referrals/REF-1", "Referral Details"), [
    { label: "Incoming Referrals", path: "/rhu/incoming-referrals" },
    { label: "Referral Details" },
  ]);
});

test("the BHC slip viewer stays under the RHU patient profile, not Incoming Referrals", () => {
  assert.deepEqual(getBreadcrumbs("/rhu/patients/9/referrals/5", "Referral Slip"), [
    { label: "Patients", path: "/rhu/patients" },
    { label: "Referral Slip" },
  ]);
});

test("a consultation for a patient sits under that patient's profile", () => {
  assert.deepEqual(
    getBreadcrumbs(
      "/bhc/health-records/add",
      "New Consultation",
      "?patientId=17&mode=new",
    ),
    [
      { label: "Patients", path: "/bhc/patients" },
      { label: "Patient Profile", path: "/bhc/patients/17" },
      { label: "New Consultation" },
    ],
  );
  assert.deepEqual(
    getBreadcrumbs("/rhu/health-records/add", "New Consultation", "?patientId=5"),
    [
      { label: "Patients", path: "/rhu/patients" },
      { label: "Patient Profile", path: "/rhu/patients/5" },
      { label: "New Consultation" },
    ],
  );
});

test("a BHC consultation without a patient returns to Patients", () => {
  assert.deepEqual(
    getBreadcrumbs("/bhc/health-records/add", "New Consultation", ""),
    [
      { label: "Patients", path: "/bhc/patients" },
      { label: "New Consultation" },
    ],
  );
});

test("a RHU consultation without a patient returns to Patients", () => {
  assert.deepEqual(
    getBreadcrumbs("/rhu/health-records/add", "New Consultation", ""),
    [
      { label: "Patients", path: "/rhu/patients" },
      { label: "New Consultation" },
    ],
  );
});

test("RHU health record details sit under Patients", () => {
  assert.deepEqual(
    getBreadcrumbs("/rhu/health-records/15", "Health Record Details"),
    [
      { label: "Patients", path: "/rhu/patients" },
      { label: "Health Record Details" },
    ],
  );
});

test("RHU follow-up details sit under Follow-ups", () => {
  assert.deepEqual(
    getBreadcrumbs("/rhu/follow-ups/12", "Follow-up Details"),
    [
      { label: "Follow-ups", path: "/rhu/follow-ups" },
      { label: "Follow-up Details" },
    ],
  );
});

test("retired BHC follow-up details URLs do not form a details trail", () => {
  assert.deepEqual(getBreadcrumbs("/bhc/follow-ups/12", "Follow-ups"), [
    { label: "Follow-ups" },
  ]);
});

test("unknown routes fall back to the current page", () => {
  assert.deepEqual(getBreadcrumbs("/somewhere/else", "Notifications"), [
    { label: "Notifications" },
  ]);
});
