import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RECORD_FILTERS, filterPatientRecords, patientRecordRows } from "./patientRecordHistory.js";

const filter = (rows, patch) => filterPatientRecords(rows, { ...DEFAULT_RECORD_FILTERS, ...patch });

test("mixed consultation matches either action without duplicating the record", () => {
  const rows = patientRecordRows([{ id: "10", outcome: "Referred", needsReferral: "yes", followUpDate: "2026-10-20" }]);
  assert.equal(rows[0].outcomeText, "BHC Follow-up, RHU Referral");
  assert.equal(filter(rows, { outcome: "follow_up" }).length, 1);
  assert.equal(filter(rows, { outcome: "referral" }).length, 1);
  assert.equal(filter(rows, {}).length, 1);
});

test("fulfilled follow-up remains in history even when the current server label is Routine", () => {
  const rows = patientRecordRows([{ id: 10, outcome: "Routine" }, { id: 11, outcome: "Routine" }], [], [{ healthRecordId: "10", state: "fulfilled", fulfilledByHealthRecordId: "11" }]);
  assert.deepEqual(filter(rows, { outcome: "follow_up" }).map(row => row.id), ["10"]);
  assert.equal(rows.find(row => row.id === "11").hasBhcFollowUp, false);
});

test("linked referrals and held referrals count; inherited parent tracking does not refer a follow-up visit", () => {
  const rows = patientRecordRows([
    { id: 10, outcome: "Routine" },
    { id: 11, needsReferral: "no", monitoring_data: { referralHoldId: 20 } },
    { id: 12, visitType: "follow_up_visit", linkedTrackingId: "parent-referral" },
    { id: 13, needsReferral: "false" },
  ], [{ health_record_id: 10, status: "Completed" }]);
  assert.deepEqual(filter(rows, { outcome: "referral" }).map(row => row.id), ["10", "11"]);
  assert.equal(rows.find(row => row.id === "13").outcomeText, "—");
});

test("saved schedule remains historical after cancellation/completion and an incoming follow-up is a separate visit type", () => {
  const rows = patientRecordRows([{ id: 1, outcome: "Routine", monitoring_data: { followUpDate: "2025-01-10" } }, { id: 2, parentHealthRecordId: 1, outcome: "Routine" }]);
  assert.equal(filter(rows, { outcome: "follow_up" }).length, 1);
  assert.deepEqual(filter(rows, { visitType: "follow_up_visit" }).map(row => row.id), ["2"]);
});

test("filters combine date boundaries, visit type and complaint/record search, newest first", () => {
  const rows = patientRecordRows([
    { id: 10, dateOfVisit: "2026-10-01", chiefComplaint: "Cough", outcome: "Routine" },
    { id: 12, dateOfVisit: "2026-10-03", chiefComplaint: "COUGH recheck", parentHealthRecordId: 10, followUpDate: "2026-10-15" },
    { id: 11, dateOfVisit: "2026-10-02", chiefComplaint: "Headache", outcome: "Referred" },
  ]);
  assert.deepEqual(rows.map(row => row.id), ["12", "11", "10"]);
  assert.deepEqual(filter(rows, { dateFrom: "2026-10-02", dateTo: "2026-10-03", visitType: "follow_up_visit", search: " cough " }).map(row => row.id), ["12"]);
  assert.deepEqual(filter(rows, { search: "#11" }).map(row => row.id), ["11"]);
  assert.deepEqual(filter(rows, { outcome: "routine" }).map(row => row.id), ["10"]);
  assert.deepEqual(filter(rows, { dateFrom: "2026-10-04", dateTo: "2026-10-01" }), []);
});

test("missing historical data is not invented as routine or follow-up", () => {
  const rows = patientRecordRows([{ id: 10 }, { id: 11, diagnoses: [{ clinicalOutcome: "managed_at_bhc" }] }]);
  assert.equal(rows[0].outcomeText, "—");
  assert.equal(filter(rows, { outcome: "routine" }).length, 0);
  assert.equal(filter(rows, { outcome: "follow_up" }).length, 0);
});
