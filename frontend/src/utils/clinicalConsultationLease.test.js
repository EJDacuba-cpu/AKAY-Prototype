import assert from "node:assert/strict";
import test from "node:test";
import {
  consultationEditorLease,
  ownershipFromDraft,
  ownershipFromProblem,
  isEditorLeaseConflict,
  assertConsultationEditable,
} from "./clinicalConsultationLease.js";

test("lease occupancy ignores same-user and expired leases", () => {
  const now = Date.now();
  const activeOther = {
    canEdit: true,
    editor: { id: "9", name: "Jane Midwife" },
    editorExpiresAt: new Date(now + 600_000).toISOString(),
  };
  assert.equal(consultationEditorLease(activeOther, "3", now).occupied, true);
  assert.equal(consultationEditorLease(activeOther, "9", now).occupied, false);
  assert.equal(consultationEditorLease({
    ...activeOther,
    editorExpiresAt: new Date(now - 60_000).toISOString(),
  }, "3", now).occupied, false);
  assert.equal(ownershipFromDraft(activeOther, "3").canTakeover, true);
  assert.equal(ownershipFromDraft({ ...activeOther, canEdit: false }, "3").canTakeover, false);
  assert.equal(ownershipFromDraft(activeOther, "9"), null);
});

test("lease conflict detection keeps review locks separate from editor occupancy", () => {
  assert.equal(isEditorLeaseConflict({ code: "EDITOR_LEASE_OCCUPIED" }), true);
  assert.equal(isEditorLeaseConflict({ message: "Being edited by Jane. Confirm takeover to continue." }), true);
  assert.equal(ownershipFromProblem({ message: "Being edited by Jane Midwife. Confirm takeover to continue." }).editorName, "Jane Midwife");
  assert.throws(() => assertConsultationEditable({ canEdit: false }), /under review/i);
});
