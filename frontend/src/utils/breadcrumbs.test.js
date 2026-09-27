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

test("a consultation without a patient keeps the Health Records trail", () => {
  assert.deepEqual(
    getBreadcrumbs("/bhc/health-records/add", "New Consultation", ""),
    [
      { label: "Health Records", path: "/bhc/health-records" },
      { label: "New Consultation" },
    ],
  );
});

test("unknown routes fall back to the current page", () => {
  assert.deepEqual(getBreadcrumbs("/somewhere/else", "Notifications"), [
    { label: "Notifications" },
  ]);
});
