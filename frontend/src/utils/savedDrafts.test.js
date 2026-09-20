import test from "node:test";
import assert from "node:assert/strict";

import { mergeSavedDrafts } from "./savedDrafts.js";

const serverDraft = (overrides = {}) => ({
  id: "srv-1",
  patient: { id: "1001", label: "Juana Dela Cruz" },
  classification: "Maternal",
  lastSavedAt: "2026-09-20T10:00:00.000Z",
  expiresAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

const localEntry = (overrides = {}) => {
  const { draft = {}, ...rest } = overrides;
  return {
    consultationKey: "patient:1001",
    savedAt: "2026-09-20T11:00:00.000Z",
    record: {
      draft: {
        id: "srv-1",
        version: 3,
        patient: { id: "1001", label: "Juana Dela Cruz" },
        classification: "Maternal",
        payload: { chiefComplaint: "Fever" },
        ...draft,
      },
    },
    ...rest,
  };
};

test("server drafts alone come through as ordinary synced rows", () => {
  const rows = mergeSavedDrafts([serverDraft()], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unsynced, false);
  assert.equal(rows[0].serverId, "srv-1");
  assert.equal(rows[0].localEntry, null);
  assert.equal(rows[0].expiresAt, "2026-10-20T10:00:00.000Z");
});

test("a device-only draft is listed even with no server drafts at all", () => {
  const rows = mergeSavedDrafts([], [localEntry({ draft: { id: "" } })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unsynced, true);
  assert.equal(rows[0].serverId, "");
  assert.equal(rows[0].patientLabel, "Juana Dela Cruz");
  assert.equal(rows[0].key, "local:patient:1001");
});

test("the same consultation is ONE row, matched on the server draft id", () => {
  const rows = mergeSavedDrafts([serverDraft()], [localEntry()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].serverId, "srv-1");
  assert.ok(rows[0].localEntry);
});

test("a newer device copy takes over the row and is flagged unsynced", () => {
  const rows = mergeSavedDrafts([serverDraft()], [localEntry()]);
  assert.equal(rows[0].unsynced, true);
  // The row reports the device timestamp, which is the newer one.
  assert.equal(rows[0].lastSavedAt, "2026-09-20T11:00:00.000Z");
});

test("an OLDER device copy never displaces a newer server draft", () => {
  const rows = mergeSavedDrafts(
    [serverDraft({ lastSavedAt: "2026-09-20T12:00:00.000Z" })],
    [localEntry({ savedAt: "2026-09-20T09:00:00.000Z" })],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unsynced, false);
  assert.equal(rows[0].lastSavedAt, "2026-09-20T12:00:00.000Z");
  // It is still attached, so discarding the row can clean both copies up.
  assert.ok(rows[0].localEntry);
});

test("a device copy with no server id still dedupes against the same patient", () => {
  const rows = mergeSavedDrafts(
    [serverDraft()],
    [localEntry({ draft: { id: "" } })],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unsynced, true);
  assert.equal(rows[0].serverId, "srv-1");
});

test("drafts for different patients stay separate rows", () => {
  const rows = mergeSavedDrafts(
    [serverDraft()],
    [
      localEntry({
        consultationKey: "patient:2002",
        draft: { id: "", patient: { id: "2002", label: "Maria Santos" } },
      }),
    ],
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.patientId).sort(),
    ["1001", "2002"],
  );
});

test("rows are newest first regardless of which side they came from", () => {
  const rows = mergeSavedDrafts(
    [
      serverDraft({ id: "old", patient: { id: "1", label: "A" }, lastSavedAt: "2026-09-01T00:00:00.000Z" }),
      serverDraft({ id: "new", patient: { id: "2", label: "B" }, lastSavedAt: "2026-09-19T00:00:00.000Z" }),
    ],
    [
      localEntry({
        consultationKey: "patient:3",
        savedAt: "2026-09-21T00:00:00.000Z",
        draft: { id: "", patient: { id: "3", label: "C" } },
      }),
    ],
  );
  assert.deepEqual(rows.map((row) => row.patientLabel), ["C", "B", "A"]);
});

test("a device copy without a patient is ignored rather than shown blank", () => {
  const rows = mergeSavedDrafts([], [localEntry({ draft: { patient: null } })]);
  assert.deepEqual(rows, []);
});

test("row keys are unique so list rendering cannot collide", () => {
  const rows = mergeSavedDrafts(
    [serverDraft({ id: "a", patient: { id: "1", label: "A" } })],
    [
      localEntry({
        consultationKey: "patient:2",
        draft: { id: "", patient: { id: "2", label: "B" } },
      }),
    ],
  );
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
});

test("empty input is an empty list, not a crash", () => {
  assert.deepEqual(mergeSavedDrafts(), []);
  assert.deepEqual(mergeSavedDrafts(undefined, undefined), []);
});
