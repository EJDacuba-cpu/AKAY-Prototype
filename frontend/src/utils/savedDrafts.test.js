import test from "node:test";
import assert from "node:assert/strict";

import {
  bindLocalToServerDraft,
  getLocalConsultationUuid,
  localConsultationKey,
  mergeSavedDrafts,
} from "./savedDrafts.js";

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

/* ── consultation_uuid priority ──────────────────────────────────────── */

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

const identifiedLocal = (uuid, overrides = {}) =>
  localEntry({
    consultationKey: localConsultationKey(uuid),
    ...overrides,
    draft: { id: "", consultationUuid: uuid, ...(overrides.draft || {}) },
  });

test("the vault slot is keyed on the consultation, never the patient", () => {
  assert.equal(localConsultationKey(UUID_A), `consultation:${UUID_A}`);
  assert.equal(localConsultationKey(` ${UUID_A.toUpperCase()} `), `consultation:${UUID_A}`);
  assert.equal(localConsultationKey(UUID_A).includes("1001"), false);
});

test("a vault slot is never created without an identity", () => {
  for (const missing of ["", "   ", null, undefined]) {
    assert.throws(() => localConsultationKey(missing));
  }
});

test("two consultations for the same patient get two different slots", () => {
  assert.notEqual(localConsultationKey(UUID_A), localConsultationKey(UUID_B));
});

test("two consultations for the same patient stay two rows", () => {
  const rows = mergeSavedDrafts(
    [],
    [identifiedLocal(UUID_A), identifiedLocal(UUID_B, { savedAt: "2026-09-20T12:00:00.000Z" })],
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.consultationUuid).sort(), [UUID_A, UUID_B]);
});

test("the identity is read from the draft, falling back to its payload", () => {
  assert.equal(getLocalConsultationUuid(identifiedLocal(UUID_A)), UUID_A);
  assert.equal(
    getLocalConsultationUuid(
      localEntry({ draft: { payload: { consultationUuid: UUID_B.toUpperCase() } } }),
    ),
    UUID_B,
  );
  assert.equal(getLocalConsultationUuid(localEntry()), "");
});

test("consultation_uuid beats every other match", () => {
  const rows = mergeSavedDrafts(
    [
      // Newer same-patient draft that the old patient rule would have picked.
      serverDraft({ id: "srv-newer", consultationUuid: UUID_B, lastSavedAt: "2026-09-20T12:30:00.000Z" }),
      serverDraft({ id: "srv-mine", consultationUuid: UUID_A }),
    ],
    [identifiedLocal(UUID_A)],
  );
  const mine = rows.find((row) => row.serverId === "srv-mine");
  assert.ok(mine.localEntry, "attached to the draft with the same identity");
  assert.equal(mine.matchedBy, "consultation");
  assert.equal(rows.find((row) => row.serverId === "srv-newer").localEntry, null);
});

test("a local copy made before the first autosave dedupes by identity alone", () => {
  // Offline from the start: no server id on the device copy at all.
  const rows = mergeSavedDrafts(
    [serverDraft({ consultationUuid: UUID_A })],
    [identifiedLocal(UUID_A)],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].matchedBy, "consultation");
  assert.equal(rows[0].unsynced, true);
});

test("the patient is never enough when EITHER side has an identity", () => {
  // Local has an identity, server is legacy.
  let rows = mergeSavedDrafts([serverDraft()], [identifiedLocal(UUID_A)]);
  assert.equal(rows.length, 2);

  // Server has an identity, local is legacy.
  rows = mergeSavedDrafts(
    [serverDraft({ consultationUuid: UUID_A })],
    [localEntry({ draft: { id: "" } })],
  );
  assert.equal(rows.length, 2);

  // Both identified, different consultations, same patient.
  rows = mergeSavedDrafts(
    [serverDraft({ consultationUuid: UUID_B })],
    [identifiedLocal(UUID_A)],
  );
  assert.equal(rows.length, 2);
});

test("the patient fallback applies only when neither side has an identity", () => {
  const rows = mergeSavedDrafts([serverDraft()], [localEntry({ draft: { id: "" } })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].matchedBy, "patient");
});

test("a server id match that contradicts the identity is not a match", () => {
  const rows = mergeSavedDrafts(
    [serverDraft({ id: "srv-1", consultationUuid: UUID_B })],
    [identifiedLocal(UUID_A, { draft: { id: "srv-1" } })],
  );
  assert.equal(rows.length, 2);
});

test("a server id match still works for drafts from before identities", () => {
  const rows = mergeSavedDrafts([serverDraft()], [localEntry()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].matchedBy, "draft");
});

test("NULL identities never match each other across patients", () => {
  const rows = mergeSavedDrafts(
    [serverDraft({ id: "a", patient: { id: "1", label: "A" } })],
    [
      localEntry({
        consultationKey: "patient:2",
        draft: { id: "", patient: { id: "2", label: "B" } },
      }),
    ],
  );
  assert.equal(rows.length, 2);
});

test("a second device copy never steals a row that already has one", () => {
  const rows = mergeSavedDrafts(
    [serverDraft()],
    [
      localEntry({ consultationKey: "patient:1001", draft: { id: "" } }),
      localEntry({ consultationKey: "patient:1001-b", draft: { id: "" }, savedAt: "2026-09-20T12:00:00.000Z" }),
    ],
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((row) => row.localEntry).length, 2);
});

/* ── Reopening a device copy ─────────────────────────────────────────── */

test("an id-less device copy is bound to its matched draft so autosave updates it", () => {
  const [row] = mergeSavedDrafts(
    [serverDraft({ consultationUuid: UUID_A, version: 4 })],
    [identifiedLocal(UUID_A)],
  );
  const bound = bindLocalToServerDraft(row).record.draft;
  assert.equal(bound.id, "srv-1");
  assert.equal(bound.version, 4, "the server's CURRENT version, so a newer write still 409s");
  assert.equal(bound.consultationUuid, UUID_A);
  assert.equal(bound.payload.chiefComplaint, "Fever", "device content is kept");
});

test("a legacy patient match binds too, carrying the device identity", () => {
  const [row] = mergeSavedDrafts(
    [serverDraft({ version: 2 })],
    [identifiedLocal(UUID_A, { consultationKey: "patient:1001" })].map((entry) => ({
      ...entry,
      // A legacy device copy: no identity on either side.
      record: { draft: { ...entry.record.draft, consultationUuid: "" } },
    })),
  );
  assert.equal(row.matchedBy, "patient");
  const bound = bindLocalToServerDraft(row).record.draft;
  assert.equal(bound.id, "srv-1");
  assert.equal(bound.version, 2);
});

test("a device copy that already names its draft is never rebound", () => {
  const entry = identifiedLocal(UUID_A, { draft: { id: "srv-own", version: 7 } });
  const bound = bindLocalToServerDraft({
    localEntry: entry,
    serverDraft: serverDraft({ id: "srv-other", version: 1 }),
  });
  assert.equal(bound.record.draft.id, "srv-own");
  assert.equal(bound.record.draft.version, 7);
});

test("a device-only row reopens exactly as stored", () => {
  const entry = identifiedLocal(UUID_A);
  assert.equal(bindLocalToServerDraft({ localEntry: entry, serverDraft: null }), entry);
});
