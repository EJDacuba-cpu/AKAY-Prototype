/**
 * Saved Drafts view model: server drafts and encrypted on-device drafts as
 * one list.
 *
 * AKAY is online-first, so the server draft is normally the whole story. A
 * device copy only exists when the connection dropped mid-consultation, and it
 * is by definition unsynced - so the rule here is simply "never let an older
 * server copy hide a newer device copy".
 */

/**
 * A local entry and a server draft are the same consultation when they share
 * the server draft id, or - for a device copy that never reached the server -
 * when they are for the same patient.
 *
 * @param {Array} serverDrafts normalized drafts from the draft API
 * @param {Array} localEntries `{ consultationKey, savedAt, record }` from the vault
 * @returns {Array} one row per consultation, newest first
 */
export function mergeSavedDrafts(serverDrafts = [], localEntries = []) {
  const byPatient = new Map();
  const byServerId = new Map();

  const rows = (Array.isArray(serverDrafts) ? serverDrafts : []).map((draft) => {
    const row = {
      key: `server:${draft.id}`,
      serverId: draft.id,
      serverDraft: draft,
      localEntry: null,
      patientId: String(draft.patient?.id || ""),
      patientLabel: draft.patient?.label || "Patient",
      classification: draft.classification || "Consultation",
      lastSavedAt: draft.lastSavedAt || "",
      expiresAt: draft.expiresAt || "",
      unsynced: false,
    };
    byServerId.set(String(draft.id), row);
    // Several server drafts can share a patient; the first (newest, as the API
    // returns them) is the one a device copy should attach to.
    if (row.patientId && !byPatient.has(row.patientId)) {
      byPatient.set(row.patientId, row);
    }
    return row;
  });

  for (const entry of Array.isArray(localEntries) ? localEntries : []) {
    const draft = entry?.record?.draft;
    if (!draft?.patient?.id) continue;

    const patientId = String(draft.patient.id);
    const match =
      (draft.id && byServerId.get(String(draft.id))) ||
      byPatient.get(patientId) ||
      null;

    if (match) {
      match.localEntry = entry;
      // Only a device copy that is genuinely ahead takes over the row. An
      // older leftover never displaces a newer server draft.
      if (isNewer(entry.savedAt, match.lastSavedAt)) {
        match.unsynced = true;
        match.lastSavedAt = entry.savedAt;
      }
      continue;
    }

    rows.push({
      key: `local:${entry.consultationKey}`,
      serverId: draft.id || "",
      serverDraft: null,
      localEntry: entry,
      patientId,
      patientLabel: draft.patient.label || "Patient",
      classification: draft.classification || "Consultation",
      lastSavedAt: entry.savedAt || "",
      expiresAt: "",
      unsynced: true,
    });
  }

  return rows.sort((a, b) => toTime(b.lastSavedAt) - toTime(a.lastSavedAt));
}

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isNewer(candidate, current) {
  return toTime(candidate) > toTime(current);
}
