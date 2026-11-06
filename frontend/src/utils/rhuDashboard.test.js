import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMedicineAlertItems,
  buildRecentVisitActivity,
  buildRhuAttentionItems,
  buildRhuKpis,
  buildVisitActivitySeries,
  countActiveQueue,
  countConsultationsToday,
  countFollowUpsDueToday,
  countOverdueFollowUps,
  countPendingReferrals,
  countQueueAwaitingAction,
  formatKpiValue,
  isLockedMetric,
  mergeVisitRecords,
  resolveVisitPatientIdentity,
  sliceActivitySeries,
  visitCompletionDate,
} from "./rhuDashboard.js";

const TODAY = "2026-11-05";

test("queue and referral counts use verified statuses only", () => {
  assert.equal(
    countActiveQueue([
      { id: 1, status: "waiting" },
      { id: 2, status: "in_consultation" },
      { id: 3, status: "waiting", close_reason: "checked_in_by_mistake" },
    ]),
    2,
  );
  assert.equal(countActiveQueue(null), 0);
  assert.equal(
    countPendingReferrals([
      { status: "Pending" },
      { status: "pending" },
      { status: "Received" },
    ]),
    2,
  );
  assert.equal(
    countQueueAwaitingAction([
      { status: "waiting" },
      { status: "in_consultation" },
      { status: "closed", close_reason: "consultation_completed" },
    ]),
    2,
  );
});

test("consultations today use closed_at completion day, not check-in day alone", () => {
  assert.equal(
    countConsultationsToday(
      [
        {
          checked_in_at: "2026-11-04T22:00:00+08:00",
          closed_at: "2026-11-05T09:00:00+08:00",
          close_reason: "consultation_completed",
        },
        {
          checked_in_at: "2026-11-05T02:00:00+08:00",
          closed_at: "2026-11-05T03:00:00+08:00",
          close_reason: "left_before_consultation",
        },
        {
          checked_in_at: "2026-11-05T08:00:00+08:00",
          closed_at: "2026-11-05T10:00:00+08:00",
          close_reason: "consultation_completed",
        },
        {
          checked_in_at: "2026-11-05T11:00:00+08:00",
          close_reason: "checked_in_by_mistake",
        },
        {
          checked_in_at: "2026-11-04T08:00:00+08:00",
          closed_at: "2026-11-04T09:00:00+08:00",
          close_reason: "consultation_completed",
        },
      ],
      TODAY,
    ),
    2,
  );
  assert.equal(
    visitCompletionDate({
      checked_in_at: "2026-11-04T22:00:00+08:00",
      closed_at: "2026-11-05T09:00:00+08:00",
    }),
    TODAY,
  );
});

test("follow-up due and overdue stay distinct", () => {
  const tasks = [
    { id: 1, state: "pending", dueDate: TODAY },
    { id: 2, state: "pending", dueDate: "2026-11-04" },
    { id: 3, state: "pending", dueDate: "2026-11-06" },
    { id: 4, state: "fulfilled", dueDate: TODAY },
    { id: 5, state: "no_show", dueDate: "2026-11-01" },
  ];
  assert.equal(countFollowUpsDueToday(tasks, TODAY), 1);
  assert.equal(countOverdueFollowUps(tasks, TODAY), 2);
});

test("visit activity series fills empty days, keeps ISO boundaries, excludes mistakes", () => {
  const series = buildVisitActivitySeries(
    [
      { id: 1, checked_in_at: "2026-11-05T00:00:00.000000Z" },
      { id: 2, checked_in_at: "2026-11-05T09:00:00+08:00" },
      { id: 3, checked_in_at: "2026-11-03T09:00:00+08:00" },
      {
        id: 4,
        checked_in_at: "2026-11-05T10:00:00+08:00",
        close_reason: "checked_in_by_mistake",
      },
      { id: 5, checked_in_at: "2026-10-01T09:00:00+08:00" },
    ],
    { days: 7, today: TODAY },
  );
  assert.equal(series.length, 7);
  assert.equal(series.at(-1).date, TODAY);
  assert.equal(series.at(-1).count, 2);
  assert.equal(series.find((row) => row.date === "2026-11-03")?.count, 1);
  assert.equal(sliceActivitySeries(series, 7).length, 7);
  assert.equal(buildVisitActivitySeries([], { days: 7, today: TODAY }).every((row) => row.count === 0), true);
});

test("recent activity maps PatientIdentity full_name and masks missing identity", () => {
  const rows = buildRecentVisitActivity(
    [
      {
        id: 1,
        patient: { id: 10, full_name: "Ana Reyes" },
        checked_in_at: "2026-11-05T08:00:00+08:00",
        status: "waiting",
      },
      {
        id: 2,
        patient: { id: 11, first_name: "Ben", last_name: "Cruz" },
        checked_in_at: "2026-11-05T10:00:00+08:00",
        source: "referral",
        status: "in_consultation",
        referral: { id: 99 },
      },
      {
        id: 3,
        patient: { id: 12 },
        checked_in_at: "2026-11-05T11:30:00+08:00",
        status: "waiting",
      },
      {
        id: 4,
        patientName: "Skip",
        checked_in_at: "2026-11-05T11:00:00+08:00",
        close_reason: "checked_in_by_mistake",
      },
    ],
    { limit: 5 },
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].patientName, "Identity unavailable");
  assert.equal(rows[0].identityMasked, true);
  assert.equal(rows[0].href, "/rhu/patients?view=queue");
  assert.equal(rows[1].patientName, "Ben Cruz");
  assert.equal(rows[1].source, "Referred");
  assert.equal(rows[1].href, "/rhu/patients/11");
  assert.equal(rows[2].patientName, "Ana Reyes");
  assert.equal(rows[2].href, "/rhu/patients/10");

  assert.deepEqual(resolveVisitPatientIdentity({ patient: { id: 7, full_name: "Lia Santos" } }), {
    patientId: "7",
    patientName: "Lia Santos",
    identityMasked: false,
  });
});

test("mergeVisitRecords dedupes active and include_closed payloads", () => {
  assert.deepEqual(
    mergeVisitRecords(
      [{ id: 1, status: "closed" }, { id: 2, status: "waiting" }],
      [{ id: 2, status: "in_consultation" }, { id: 3, status: "waiting" }],
    ).map((visit) => ({ id: visit.id, status: visit.status })),
    [
      { id: 1, status: "closed" },
      { id: 2, status: "in_consultation" },
      { id: 3, status: "waiting" },
    ],
  );
  assert.deepEqual(mergeVisitRecords(null, undefined, []), []);
});

test("KPI builder locks metrics when access is denied and never invents values", () => {
  assert.deepEqual(
    buildRhuKpis({
      activeVisits: [{ status: "waiting" }],
      allVisits: [
        {
          checked_in_at: "2026-11-05T01:00:00+08:00",
          closed_at: "2026-11-05T02:00:00+08:00",
          close_reason: "consultation_completed",
        },
      ],
      referrals: [{ status: "Pending" }],
      followUpTasks: [{ state: "pending", dueDate: TODAY }],
      today: TODAY,
    }),
    {
      todays_queue: 1,
      pending_referrals: 1,
      consultations_today: 1,
      follow_ups_due_today: 1,
    },
  );

  assert.deepEqual(
    buildRhuKpis({
      activeVisits: [{ status: "waiting" }],
      allVisits: [],
      referrals: [{ status: "Pending" }],
      followUpTasks: [{ state: "pending", dueDate: TODAY }],
      access: { queue: false, referrals: true, followups: false },
      today: TODAY,
    }),
    {
      todays_queue: null,
      pending_referrals: 1,
      consultations_today: null,
      follow_ups_due_today: null,
    },
  );

  assert.equal(formatKpiValue(null), "—");
  assert.equal(isLockedMetric(null), true);
  assert.equal(formatKpiValue(0), "0");
});

test("attention items separate due today from overdue and honor access locks", () => {
  assert.deepEqual(
    buildRhuAttentionItems({
      pendingReferrals: 2,
      queueAwaitingAction: 0,
      followUpsDueToday: 1,
      overdueFollowUps: 3,
      medicineAlerts: [{ name: "Amoxicillin", status: "Low Stock" }],
    }),
    [
      {
        key: "pending-referrals",
        label: "Pending referral arrivals",
        count: 2,
        href: "/rhu/incoming-referrals",
      },
      {
        key: "follow-ups-due",
        label: "Follow-ups due today",
        count: 1,
        href: "/rhu/follow-ups",
      },
      {
        key: "follow-ups-overdue",
        label: "Overdue follow-ups",
        count: 3,
        href: "/rhu/follow-ups",
      },
      {
        key: "medicine",
        label: "Medicine alerts",
        count: 1,
        href: "/rhu/medicine-management",
        detail: "Amoxicillin",
      },
    ],
  );

  assert.deepEqual(
    buildRhuAttentionItems({
      pendingReferrals: 2,
      queueAwaitingAction: 3,
      followUpsDueToday: 1,
      overdueFollowUps: 2,
      medicineAlerts: [{ name: "Paracetamol" }],
      access: { referrals: false, queue: true, followups: false, inventory: false },
    }),
    [
      {
        key: "queue-action",
        label: "Consultations awaiting action",
        count: 3,
        href: "/rhu/patients?view=queue",
      },
    ],
  );

  assert.deepEqual(buildMedicineAlertItems([{ status: "In Stock" }, { name: "X", status: "Expired" }]), [
    { name: "X", status: "Expired" },
  ]);
});
