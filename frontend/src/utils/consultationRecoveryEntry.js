import {
  assertConsultationEditable,
  assertConsultationLeaseAvailable,
} from "./clinicalConsultationLease.js";

export const consultationEntryKey = (owner, patientId) => ["consultation-entry", owner, String(patientId)];

/**
 * Find an unfinished server draft for the selected patient.
 * Device copies are ignored — server drafts are the only recovery source.
 */
export function consultationRecoveryEntry({ patientId, server = [] } = {}) {
  const matches = (Array.isArray(server) ? server : []).filter((draft) => String(draft?.patient?.id) === String(patientId));
  if (matches.length > 1) {
    throw new Error("This patient has multiple unfinished consultations. Open one from the unfinished list before starting another.");
  }
  if (!matches.length) return null;
  return { server: matches[0], local: null };
}

export function consultationRecoveryPath(patientId, entry) {
  const params = new URLSearchParams({ patientId: String(patientId) });
  if (entry?.server?.id) params.set("draftId", String(entry.server.id));
  else if (entry?.server?.consultationUuid) params.set("recoveryUuid", String(entry.server.consultationUuid));
  return `/bhc/health-records/add?${params}`;
}

export function validConsultationHandoff(entry, { owner, patientId, draftId, now = Date.now() } = {}) {
  if (!entry || entry.owner !== owner || String(entry.patientId) !== String(patientId)) return false;
  if (!entry.createdAt || now - entry.createdAt < 0 || now - entry.createdAt >= 60_000) return false;
  const handoffDraftId = entry.draft?.id || entry.draftId;
  if (draftId && String(handoffDraftId) !== String(draftId)) return false;
  return true;
}

function assertPatientMatch(draft, patientId) {
  if (String(draft?.patient?.id || patientId) !== String(patientId)) {
    throw new Error("This unfinished consultation no longer matches this patient. Please try again.");
  }
}

export async function prepareConsultationRecovery({
  patientId,
  entry,
  lookup,
  load,
  claim,
  currentUserId,
} = {}) {
  const current = await lookup();
  if ((current?.id || null) !== (entry?.server?.id || null)) {
    throw new Error("The unfinished work changed. Please try again before continuing.");
  }
  if (!current?.id) throw new Error("This unfinished consultation is no longer available. Please try again.");
  assertConsultationLeaseAvailable(current, currentUserId);
  assertConsultationEditable(current);
  const loaded = await load(current.id);
  if (!loaded) throw new Error("This unfinished consultation is no longer available. Please try again.");
  assertConsultationLeaseAvailable(loaded, currentUserId);
  assertConsultationEditable(loaded);
  const claimed = claim
    ? { ...loaded, ...await claim(loaded.id, loaded.version), payload: loaded.payload }
    : loaded;
  assertConsultationEditable(claimed);
  assertPatientMatch(claimed, patientId);
  return { draft: claimed, unsynced: false };
}

export async function takeoverConsultationRecovery({
  patientId,
  entry,
  lookup,
  load,
  takeover,
  note,
} = {}) {
  const reason = String(note || "").trim();
  if (!reason) throw new Error("A short reason is required before taking over.");
  const current = await lookup();
  if ((current?.id || null) !== (entry?.server?.id || null)) {
    throw new Error("The unfinished work changed. Please try again before continuing.");
  }
  if (!current?.id) throw new Error("This unfinished consultation is no longer available. Please try again.");
  assertConsultationEditable(current);
  const loaded = await load(current.id);
  if (!loaded) throw new Error("This unfinished consultation is no longer available. Please try again.");
  assertConsultationEditable(loaded);
  if (!takeover) throw new Error("Takeover is not available right now. Please try again.");
  const claimed = {
    ...loaded,
    ...await takeover(loaded.id, loaded.version, reason),
    payload: loaded.payload,
  };
  assertConsultationEditable(claimed);
  assertPatientMatch(claimed, patientId);
  return { draft: claimed, unsynced: false };
}

export async function discardConsultationRecovery({
  patientId,
  entry,
  lookup,
  claim,
  discard,
  currentUserId,
} = {}) {
  const current = await lookup();
  if ((current?.id || null) !== (entry?.server?.id || null)) {
    throw new Error("The unfinished work changed. Please try again before discarding.");
  }
  if (!current?.id) throw new Error("No unfinished consultation was found. Please try again.");
  if (current.version !== entry.server?.version || current.consultationUuid !== entry.server?.consultationUuid) {
    throw new Error("The unfinished work changed. Please try again before discarding.");
  }
  assertConsultationLeaseAvailable(current, currentUserId);
  assertConsultationEditable(current);
  const claimed = claim ? await claim(current.id, current.version) : current;
  assertConsultationEditable(claimed);
  await discard(claimed.id || current.id, claimed.version);
}
