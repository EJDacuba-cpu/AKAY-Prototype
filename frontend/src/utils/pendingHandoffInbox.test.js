import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KIND_MONITORING_HANDOFF,
  KIND_TB_ENDORSEMENT,
  clearTbReviewSearchParams,
  mergeMonitoringInbox,
  monitoringInboxShowsTbReview,
  monitoringInboxStatusTone,
} from "./pendingHandoffInbox.js";

test("mergeMonitoringInbox combines handoffs and TB endorsements with type labels", () => {
  const rows = mergeMonitoringInbox({
    handoffs: [
      {
        id: 2,
        status: "pending_review",
        created_at: "2026-11-12T01:00:00.000Z",
        source_patient: { first_name: "Ada", last_name: "Lovelace" },
        condition: { name: "Hypertension" },
        sending_rhu: { name: "Central RHU" },
      },
    ],
    endorsements: [
      {
        id: 9,
        status: "linkage_needed",
        endorsed_at: "2026-11-13T02:00:00.000Z",
        case_number: "TB-001",
        case_id: 4,
        source_patient: { first_name: "Alan", last_name: "Turing" },
        sending_rhu: { name: "Central RHU" },
      },
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, KIND_TB_ENDORSEMENT);
  assert.equal(rows[0].typeLabel, "TB endorsement");
  assert.equal(rows[0].conditionLabel, "TB · TB-001");
  assert.equal(rows[0].statusLabel, "Needs Verification");
  assert.equal(rows[1].kind, KIND_MONITORING_HANDOFF);
  assert.equal(rows[1].typeLabel, "Monitoring handoff");
  assert.equal(rows[1].conditionLabel, "Hypertension");
});

test("service handoffs show health service label in the unified inbox", () => {
  const rows = mergeMonitoringInbox({
    handoffs: [{
      id: 3,
      handoff_kind: "service",
      status: "pending_review",
      created_at: "2026-11-14T01:00:00.000Z",
      service: { key: "Maternal", label: "Maternal Care" },
      service_key: "Maternal",
      condition: null,
      source_patient: { first_name: "Maya", last_name: "Cruz" },
      sending_rhu: { name: "Central RHU" },
    }],
    includeTb: false,
  });
  assert.equal(rows[0].conditionLabel, "Maternal Care");
  assert.equal(rows[0].typeLabel, "Service monitoring handoff");
});

test("mergeMonitoringInbox omits TB rows when includeTb is false", () => {
  const rows = mergeMonitoringInbox({
    handoffs: [{ id: 1, status: "declined", created_at: "2026-11-01T00:00:00.000Z" }],
    endorsements: [{ id: 2, status: "accepted", endorsed_at: "2026-11-02T00:00:00.000Z", case_number: "TB-9" }],
    includeTb: false,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, KIND_MONITORING_HANDOFF);
});

test("monitoringInboxShowsTbReview only for TB deep-link params when permitted", () => {
  assert.equal(
    monitoringInboxShowsTbReview(new URLSearchParams("view=monitoring-requests"), {
      canTbEndorsements: true,
    }),
    false,
  );
  assert.equal(
    monitoringInboxShowsTbReview(
      new URLSearchParams("view=monitoring-requests&tab=tb-endorsements"),
      { canTbEndorsements: true },
    ),
    true,
  );
  assert.equal(
    monitoringInboxShowsTbReview(
      new URLSearchParams("view=monitoring-requests&endorsement=12"),
      { canTbEndorsements: true },
    ),
    true,
  );
  assert.equal(
    monitoringInboxShowsTbReview(
      new URLSearchParams("view=monitoring-requests&case=3"),
      { canTbEndorsements: false },
    ),
    false,
  );
});

test("clearTbReviewSearchParams keeps view and drops TB review keys", () => {
  const next = clearTbReviewSearchParams(
    new URLSearchParams(
      "view=monitoring-requests&tab=tb-endorsements&case=4&page=2&endorsement=9",
    ),
  );
  assert.equal(next.get("view"), "monitoring-requests");
  assert.equal(next.get("tab"), null);
  assert.equal(next.get("case"), null);
  assert.equal(next.get("page"), null);
  assert.equal(next.get("endorsement"), null);
});

test("monitoringInboxStatusTone maps accepted DOTS and handoff accept states", () => {
  assert.equal(monitoringInboxStatusTone("accepted"), "success");
  assert.equal(monitoringInboxStatusTone("accepted_awaiting_first_visit"), "success");
  assert.equal(monitoringInboxStatusTone("linkage_needed"), "warning");
  assert.equal(monitoringInboxStatusTone("revoked"), "danger");
});
