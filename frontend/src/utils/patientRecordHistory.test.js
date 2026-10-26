import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RECORD_FILTERS, filterPatientRecords, patientRecordRows } from "./patientRecordHistory.js";

const filter = (rows, patch) => filterPatientRecords(rows, { ...DEFAULT_RECORD_FILTERS, ...patch });

test("mixed consultation matches either action without duplicating the record", () => {
  const rows = patientRecordRows([{ id: "10", outcome: "Referred", needsReferral: "yes", followUpDate: "2026-10-20" }],
    [{ healthRecordId: "10", status: "Pending" }], [{ healthRecordId: "10", state: "rescheduled", dueDate: "2026-11-01" }]);
  assert.equal(rows[0].outcomeText, "Follow-up Scheduled, RHU Referral (Pending)");
  assert.equal(filter(rows, { outcome: "follow_up" }).length, 1);
  assert.equal(filter(rows, { outcome: "referral" }).length, 1);
  assert.equal(filter(rows, {}).length, 1);
});

test("fulfilled follow-up is preserved but is not a current next action", () => {
  const rows = patientRecordRows([{ id: 10, outcome: "Routine" }, { id: 11, outcome: "Routine" }], [], [{ healthRecordId: "10", state: "fulfilled", fulfilledByHealthRecordId: "11" }]);
  assert.deepEqual(filter(rows, { outcome: "follow_up" }), []);
  assert.equal(rows.find(row => row.id === "10").outcomeText, "No Further Action");
  assert.equal(rows.find(row => row.id === "11").hasBhcFollowUp, false);
});

test("completed referrals and historical hold/tracking IDs never create active referrals", () => {
  const rows = patientRecordRows([
    { id: 10, outcome: "Routine" },
    { id: 11, needsReferral: "no", monitoring_data: { referralHoldId: 20 } },
    { id: 12, visitType: "follow_up_visit", linkedTrackingId: "parent-referral" },
    { id: 13, needsReferral: "false" },
  ], [{ health_record_id: 10, status: "Completed" }]);
  assert.deepEqual(filter(rows, { outcome: "referral" }), []);
  assert.equal(rows.find(row => row.id === "11").outcomeText, "—");
  assert.equal(rows.find(row => row.id === "13").outcomeText, "—");
});

test("saved schedule remains historical after cancellation/completion and an incoming follow-up is a separate visit type", () => {
  const rows = patientRecordRows([{ id: 1, outcome: "Routine", monitoring_data: { followUpDate: "2025-01-10" } }, { id: 2, parentHealthRecordId: 1, outcome: "Routine" }]);
  assert.equal(filter(rows, { outcome: "follow_up" }).length, 0);
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

test("terminal task/referral states override historical flags and remain unchanged", () => {
  const record = { id: 10, outcome: "Referred", outcomeText: "BHC Follow-up, RHU Referral", needsReferral: true,
    followUpStatus: "Follow-up Required", followUpDate: "2020-01-01", diagnoses: [{ name: "Saved concern", clinicalOutcome: "managed_at_bhc" }] };
  const referrals = [{ health_record_id: 10, status: "Completed" }];
  const tasks = [{ health_record_id: 10, state: "fulfilled" }, { health_record_id: 10, state: "cancelled" }];
  const before = JSON.stringify({ record, referrals, tasks });
  const [row] = patientRecordRows([record], referrals, tasks);
  assert.equal(row.outcomeText, "No Further Action");
  assert.deepEqual(filter([row], { outcome: "routine" }), [row]);
  assert.equal(JSON.stringify({ record, referrals, tasks }), before);
  assert.equal(row.diagnoses[0].clinicalOutcome, "managed_at_bhc");
});

test("missing data, unknown states and referral intent alone do not confirm an action or no further action", () => {
  for (const record of [
    { id: 10 }, { id: 10, outcome: "Referred" }, { id: 10, needs_referral: true },
    { id: 10, followUpDate: "2026-11-01", followUpStatus: "Follow-up Required" },
    { id: 10, diagnoses: [{ clinicalOutcome: "refer_to_rhu" }] },
  ]) assert.equal(patientRecordRows([record])[0].outcomeText, "—");
  assert.equal(patientRecordRows([{ id: 10, outcome: "Routine" }], [{ healthRecordId: 10 }], [])[0].outcomeText, "—");
  assert.equal(patientRecordRows([{ id: 10, outcome: "Routine" }], [], [{ healthRecordId: 10, state: "unknown" }])[0].outcomeText, "—");
  assert.equal(patientRecordRows([{ id: 10 }], [], [])[0].outcomeText, "No Further Action");
});

test("active task states and live referral statuses are independent and record-scoped", () => {
  for (const state of ["pending", "rescheduled", "no_show"]) {
    for (const status of ["Pending", "Received", "No-Show", "For Monitoring"]) {
      const [row] = patientRecordRows([{ id: 10 }], [{ healthRecordId: 10, status }], [{ healthRecordId: 10, state }]);
      assert.match(row.outcomeText, /^Follow-up Scheduled, RHU Referral/);
      assert.equal(row.hasRhuReferral, true);
      assert.equal(row.hasBhcFollowUp, true);
    }
  }
  const [row] = patientRecordRows([{ id: 10, outcome: "Routine" }], [{ healthRecordId: 11, status: "Pending" }], [{ healthRecordId: 11, state: "pending" }]);
  assert.equal(row.outcomeText, "No Further Action");
});

test("superseded reschedules and cancelled referrals require no current action", () => {
  const [row] = patientRecordRows([{ id: 10 }], [{ healthRecordId: 10, status: "Cancelled" }],
    [{ healthRecordId: 10, state: "rescheduled", rescheduledToId: 22 }]);
  assert.equal(row.outcomeText, "No Further Action");
});

test("embedded current tasks/referrals are usable when separate collections are unavailable", () => {
  const [row] = patientRecordRows([{ id: 10, referrals: [{ status: "Received" }],
    followUpEpisode: { tasks: [{ healthRecordId: 10, state: "pending" }] } }]);
  assert.equal(row.outcomeText, "Follow-up Scheduled, RHU Referral (Received)");
});

test("current server hold status requires attention but a historical hold ID alone does not", () => {
  const [row] = patientRecordRows([{ id: 10, outcome: "Referred", outcomeSubLabel: "Awaiting Provider" }], [], []);
  assert.equal(row.outcomeText, "RHU Referral (Awaiting Provider)");
});
