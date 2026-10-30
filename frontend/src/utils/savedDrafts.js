import { normalizeConsultationUuid as normalizeUuid } from "./consultationIdentity.js";

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
 * The vault slot for one consultation. Keyed on the consultation identity, so
 * the same patient's second consultation is a second slot. There is no
 * patient-keyed form: a slot is never created without an identity.
 */
export function localConsultationKey(consultationUuid) {
  const uuid = normalizeUuid(consultationUuid);
  if (!uuid) throw new Error("A local consultation slot needs a consultation uuid.");
  return `consultation:${uuid}`;
}

/** The consultation identity a local vault entry carries, or "". */
export function getLocalConsultationUuid(entry) {
  const draft = entry?.record?.draft;
  return normalizeUuid(draft?.consultationUuid || draft?.payload?.consultationUuid);
}

/**
 * One row per consultation. A local entry attaches to a server draft by, in
 * strict priority:
 *
 *   1. consultation_uuid - exact. The authoritative identity.
 *   2. server draft public id - exact. Drafts from before consultation_uuid.
 *   3. patient id - LEGACY ONLY, and only when NEITHER side has a
 *      consultation_uuid. If either side has one, the patient is never enough:
 *      two consultations for one patient are two different rows.
 *
 * Empty identities never match each other - "" is "unknown", not a value.
 *
 * @param {Array} serverDrafts normalized drafts from the draft API
 * @param {Array} localEntries `{ consultationKey, savedAt, record }` from the vault
 * @returns {Array} one row per consultation, newest first
 */
export function mergeSavedDrafts(serverDrafts = [], localEntries = []) {
  const byConsultation = new Map();
  const byServerId = new Map();
  // Legacy server drafts (no consultation_uuid) per patient - the only ones
  // eligible for the patient fallback.
  const legacyByPatient = new Map();

  const rows = (Array.isArray(serverDrafts) ? serverDrafts : []).map((draft) => {
    const consultationUuid = normalizeUuid(draft.consultationUuid);
    const row = {
      key: `server:${draft.id}`,
      serverId: draft.id,
      serverDraft: draft,
      localEntry: null,
      consultationUuid,
      patientId: String(draft.patient?.id || ""),
      patientLabel: draft.patient?.label || "Patient",
      classification: draft.classification || "Consultation",
      lastSavedAt: draft.lastSavedAt || "",
      expiresAt: draft.expiresAt || "",
      unsynced: false,
      matchedBy: "",
    };

    byServerId.set(String(draft.id), row);
    if (consultationUuid) {
      byConsultation.set(consultationUuid, row);
    } else if (row.patientId && !legacyByPatient.has(row.patientId)) {
      // Newest first, as the API returns them.
      legacyByPatient.set(row.patientId, row);
    }
    return row;
  });

  for (const entry of Array.isArray(localEntries) ? localEntries : []) {
    const draft = entry?.record?.draft;
    if (!draft?.patient?.id) continue;

    const patientId = String(draft.patient.id);
    const consultationUuid = getLocalConsultationUuid(entry);
    const { row: match, matchedBy } = findMatch({
      consultationUuid,
      serverId: draft.id ? String(draft.id) : "",
      patientId,
      byConsultation,
      byServerId,
      legacyByPatient,
    });

    if (match && !match.localEntry) {
      match.localEntry = entry;
      match.matchedBy = matchedBy;
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
      consultationUuid,
      patientId,
      patientLabel: draft.patient.label || "Patient",
      classification: draft.classification || "Consultation",
      lastSavedAt: entry.savedAt || "",
      expiresAt: "",
      unsynced: true,
      matchedBy: "",
    });
  }

  return rows.sort((a, b) => toTime(b.lastSavedAt) - toTime(a.lastSavedAt));
}

/**
 * The device copy to reopen for a row whose device copy is ahead.
 *
 * A device copy that went offline before its first autosave has no server id.
 * Reopened as-is, autosave would CREATE - a second draft for a consultation
 * that already has one. When the row matched a server draft, the copy is bound
 * to that draft's id and CURRENT version instead, so autosave UPDATES it and
 * the optimistic version check still stands between it and any newer write.
 *
 * Never rebinds a copy that already names a server draft: that id is its own.
 */
export function bindLocalToServerDraft(row) {
  const entry = row?.localEntry;
  const draft = entry?.record?.draft;
  const server = row?.serverDraft;
  if (!draft || !server?.id || draft.id) return entry || null;

  return {
    ...entry,
    record: {
      ...entry.record,
      draft: {
        ...draft,
        id: server.id,
        version: Number(server.version || 0),
        lastSavedAt: server.lastSavedAt || draft.lastSavedAt || "",
        // A legacy server draft has no identity of its own; the device copy's
        // travels with it and the server adopts it on the next save.
        consultationUuid:
          getLocalConsultationUuid(entry) || normalizeUuid(server.consultationUuid),
      },
    },
  };
}

function findMatch({
  consultationUuid,
  serverId,
  patientId,
  byConsultation,
  byServerId,
  legacyByPatient,
}) {
  if (consultationUuid && byConsultation.has(consultationUuid)) {
    return { row: byConsultation.get(consultationUuid), matchedBy: "consultation" };
  }

  if (serverId && byServerId.has(serverId)) {
    const row = byServerId.get(serverId);
    // Same draft id but a DIFFERENT consultation identity on each side is a
    // contradiction, not a match. Keep them apart rather than guess.
    if (consultationUuid && row.consultationUuid && row.consultationUuid !== consultationUuid) {
      return { row: null, matchedBy: "" };
    }
    return { row, matchedBy: "draft" };
  }

  // Legacy fallback: permitted only when the local copy has no identity
  // either. A local copy WITH a uuid that found nothing above is a different
  // consultation, however many drafts its patient has.
  if (!consultationUuid && legacyByPatient.has(patientId)) {
    return { row: legacyByPatient.get(patientId), matchedBy: "patient" };
  }

  return { row: null, matchedBy: "" };
}

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isNewer(candidate, current) {
  return toTime(candidate) > toTime(current);
}
