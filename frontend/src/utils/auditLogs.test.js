import test from "node:test";
import assert from "node:assert/strict";
import { auditRow, formatAuditDateTime } from "./auditLogs.js";

test("audit timestamps use Manila once, independent of browser timezone", () => {
  assert.equal(formatAuditDateTime("2026-11-17T06:30:00.000000Z"), "Nov 17, 2026 • 2:30 PM");
  assert.equal(formatAuditDateTime("2026-11-17T14:30:00+08:00"), "Nov 17, 2026 • 2:30 PM");
  assert.equal(formatAuditDateTime("2026-11-17T20:30:00Z"), "Nov 18, 2026 • 4:30 AM");
  assert.equal(formatAuditDateTime(null), "");
  assert.equal(formatAuditDateTime("invalid"), "");
});

test("rows use API labels and retain the technical action without exposing technical details", () => {
  const row = auditRow({ id: 42, action: "draft_updated", module: "health_record_drafts",
    action_label: "Consultation Draft Updated", module_label: "Consultations",
    actor_name: "Ana", role_label: "RHU · Doctor", user: { role: "rhu" },
    summary: "Updated a patient's consultation draft.", category: "Consultations",
    description: "draft_public_id=private-uuid; owner_user_id=4" });
  assert.equal(row.id, "LOG-042");
  assert.equal(row.rawAction, "draft_updated");
  assert.equal(row.role, "RHU · Doctor");
  assert.equal(row.tier, "RHU");
  assert.equal(row.level, "Consultations");
  assert.equal(row.details, "Updated a patient's consultation draft.");
  assert.ok(!JSON.stringify(row).includes("private-uuid"));
});

test("unknown history is never assigned to System or Admin", () => {
  const row = auditRow({ id: 1, action: "custom_action", module: "custom_module" });
  assert.equal(row.performedBy, "Not recorded");
  assert.equal(row.role, "Not recorded");
  assert.equal(row.action, "Custom Action");
});
