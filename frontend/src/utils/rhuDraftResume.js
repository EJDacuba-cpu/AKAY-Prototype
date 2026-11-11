import {
  assertConsultationEditable,
  assertConsultationLeaseAvailable,
} from "./clinicalConsultationLease.js";

export {
  consultationEditorLease,
  editorLeaseConflict,
  isEditorLeaseConflict,
} from "./clinicalConsultationLease.js";

export const rhuEntryKey = (owner, visitId, patientId) => ["rhu-consultation-entry", owner, String(visitId), String(patientId)];

export function rhuRecoveryMatches({ visit, patientId, draft }) {
  const uuid = visit?.consultation_uuid || visit?.consultationUuid;
  return Boolean(visit?.id && uuid && String(visit.patient?.id || visit.patient_id) === String(patientId)
    && String(draft?.patient?.id) === String(patientId)
    && draft?.consultationUuid === uuid
    && (!draft.payload?.rhuVisitId || String(draft.payload.rhuVisitId) === String(visit.id)));
}

function assertDraft(visit, patientId, draft) {
  if (!rhuRecoveryMatches({ visit, patientId, draft })) {
    throw new Error("This unfinished consultation no longer matches this visit. Cancel and reopen it from Today's Queue.");
  }
}

export async function lookupRhuRecovery({ visit, patientId, owner, api }) {
  const server = await api.lookup({ patientId, rhuVisitId: visit.id, draftOwnerContext: owner });
  if (server) assertDraft(visit, patientId, server);
  return server ? { server, local: null } : null;
}

async function currentServer({ visit, patientId, owner, decision, api }) {
  const metadata = await api.lookup({ patientId, rhuVisitId: visit.id, draftOwnerContext: owner });
  if (metadata) assertDraft(visit, patientId, metadata);
  if ((metadata?.id || null) !== (decision?.server?.id || null)) {
    throw new Error("The unfinished work changed. Please try again before continuing.");
  }
  return metadata;
}

export async function resumeRhuRecovery({ visit, patientId, owner, decision, api, currentUserId }) {
  const options = { draftOwnerContext: owner };
  const metadata = await currentServer({ visit, patientId, owner, decision, api });
  if (!metadata) throw new Error("This unfinished consultation is no longer available. Please try again.");
  assertConsultationLeaseAvailable(metadata, currentUserId);
  assertConsultationEditable(metadata);
  const server = await api.load(metadata.id, { ...options, claim: false });
  if (server) assertDraft(visit, patientId, server);
  if (!server) throw new Error("This unfinished consultation is no longer available. Please try again.");
  assertConsultationLeaseAvailable(server, currentUserId);
  assertConsultationEditable(server);
  const claimed = api.claim
    ? { ...server, ...await api.claim(server.id, server.version, options), payload: server.payload }
    : server;
  assertConsultationEditable(claimed);
  return { draft: claimed, unsynced: false };
}

export async function takeoverRhuRecovery({ visit, patientId, owner, decision, api, note }) {
  const reason = String(note || "").trim();
  if (!reason) throw new Error("A short reason is required before taking over.");
  const options = { draftOwnerContext: owner };
  const metadata = await currentServer({ visit, patientId, owner, decision, api });
  if (!metadata) throw new Error("This unfinished consultation is no longer available. Please try again.");
  assertConsultationEditable(metadata);
  const server = await api.load(metadata.id, { ...options, claim: false });
  if (server) assertDraft(visit, patientId, server);
  if (!server) throw new Error("This unfinished consultation is no longer available. Please try again.");
  assertConsultationEditable(server);
  if (!api.takeover) throw new Error("Takeover is not available right now. Please try again.");
  const claimed = {
    ...server,
    ...await api.takeover(server.id, server.version, reason, options),
    payload: server.payload,
  };
  assertConsultationEditable(claimed);
  return { draft: claimed, unsynced: false };
}

export async function discardRhuRecovery({ visit, patientId, owner, decision, api, currentUserId }) {
  const metadata = await currentServer({ visit, patientId, owner, decision, api });
  if (!metadata) throw new Error("No unfinished consultation was found. Please try again.");
  if (metadata.version !== decision.server.version) {
    throw new Error("The unfinished work changed. Please review the latest input before discarding.");
  }
  assertConsultationLeaseAvailable(metadata, currentUserId);
  assertConsultationEditable(metadata);
  const options = { draftOwnerContext: owner };
  const claimed = api.claim ? await api.claim(metadata.id, metadata.version, options) : metadata;
  await api.discard(metadata.id, claimed.version, options);
}

/**
 * Load the authoritative RHU server draft for a visit before the workspace
 * becomes editable. Callers must keep the form locked until this settles and
 * ignore the result when isCancelled() is true (unmount / identity change).
 */
export async function hydrateRhuConsultationDraft({
  patientId,
  visitId,
  lookup,
  load,
  restore,
  isCancelled = () => false,
} = {}) {
  const metadata = await lookup({ patientId, rhuVisitId: visitId });
  if (isCancelled()) return { cancelled: true, restored: false, draft: null };
  if (!metadata?.id) return { cancelled: false, restored: false, draft: null };

  const draft = await load(metadata.id);
  if (isCancelled()) return { cancelled: true, restored: false, draft: null };
  if (draft) restore?.(draft);
  return { cancelled: false, restored: Boolean(draft), draft: draft || null };
}
