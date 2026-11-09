import { clinicalRecoveryChoice, clinicalDeviceDraft } from "./clinicalDraftRecovery.js";

export const rhuEntryKey = (owner, visitId, patientId) => ["rhu-consultation-entry", owner, String(visitId), String(patientId)];

export function rhuRecoveryMatches({ visit, patientId, draft }) {
  const uuid = visit?.consultation_uuid || visit?.consultationUuid;
  return Boolean(visit?.id && uuid && String(visit.patient?.id || visit.patient_id) === String(patientId)
    && String(draft?.patient?.id) === String(patientId)
    && draft?.consultationUuid === uuid
    && (!draft.payload?.rhuVisitId || String(draft.payload.rhuVisitId) === String(visit.id)));
}

function assertDraft(visit, patientId, draft) {
  if (!rhuRecoveryMatches({ visit, patientId, draft })) throw new Error("The consultation identity changed or does not match this visit. Cancel and reopen it from Today's Queue.");
}

export async function lookupRhuRecovery({ visit, patientId, owner, vault, shared = false, api }) {
  const [server, device] = await Promise.all([
    api.lookup({ patientId, rhuVisitId: visit.id, draftOwnerContext: owner }),
    shared ? vault.listLocalDrafts(owner) : [],
  ]);
  if (server) assertDraft(visit, patientId, server);
  const local = device.find((entry) => entry.record?.draft?.consultationUuid === (visit.consultation_uuid || visit.consultationUuid));
  if (local) assertDraft(visit, patientId, local.record.draft);
  return server || local ? { server, local } : null;
}

async function currentServer({ visit, patientId, owner, decision, api }) {
  const metadata = await api.lookup({ patientId, rhuVisitId: visit.id, draftOwnerContext: owner });
  if (metadata) assertDraft(visit, patientId, metadata);
  if ((metadata?.id || null) !== (decision?.server?.id || null)) throw new Error("The unfinished draft changed. Retry the recovery check before continuing.");
  return metadata;
}

export async function resumeRhuRecovery({ visit, patientId, owner, decision, vault, shared = false, source = "", api }) {
  const options = { draftOwnerContext: owner };
  const local = shared && decision?.local ? await vault.readLocalDraft({ ownerKey: owner, consultationKey: decision.local.consultationKey }) : null;
  const metadata = await currentServer({ visit, patientId, owner, decision, api });
  const server = metadata ? await api.load(metadata.id, { ...options, claim: false }) : null;
  if (server) assertDraft(visit, patientId, server);
  if (local) assertDraft(visit, patientId, local.record.draft);
  if (!local && !server) throw new Error("This unfinished consultation is no longer available. Retry the recovery check.");
  const choice = local ? clinicalRecoveryChoice(local, server) : "server";
  if (choice === "locked" && source !== "server") return { decision: { local, server, conflict: true, locked: true } };
  if (choice === "conflict" && !source) return { decision: { local, server, conflict: true } };
  // The claim uses the exact loaded revision; a concurrent edit must fail rather than be overwritten.
  const claimed = server && server.canEdit !== false && api.claim ? { ...server, ...await api.claim(server.id, server.version, options), payload: server.payload } : server;
  if (claimed?.canEdit === false && local && source !== "server") throw new Error("Another staff member is editing this consultation.");
  const expected = source && decision.conflict ? { ...local, base: { serverPayload: JSON.stringify(decision.server.payload) } } : local;
  if (local && claimed && clinicalRecoveryChoice(expected, claimed) === "conflict") return { decision: { local, server: claimed, conflict: true } };
  if (claimed && (source === "server" || choice === "server")) {
    if (local) await vault.saveLocalDraft({ ownerKey: owner, consultationKey: local.consultationKey, record: { draft: claimed }, base: { serverPayload: JSON.stringify(claimed.payload), version: claimed.version }, synced: true });
    return { draft: claimed, unsynced: false };
  }
  return { draft: clinicalDeviceDraft(local.record.draft, claimed), unsynced: true };
}

export async function discardRhuRecovery({ visit, patientId, owner, decision, vault, shared = false, api }) {
  const metadata = await currentServer({ visit, patientId, owner, decision, api });
  if (metadata) {
    if (metadata.version !== decision.server.version) throw new Error("The draft changed. Retry and review the latest input before discarding.");
    if (metadata.canEdit === false) throw new Error("Another staff member is editing this consultation.");
    const options = { draftOwnerContext: owner };
    const claimed = api.claim ? await api.claim(metadata.id, metadata.version, options) : metadata;
    await api.discard(metadata.id, claimed.version, options);
    if (shared) await vault.deleteLocalDraft({ ownerKey: owner, consultationKey: `consultation:${metadata.consultationUuid}` });
  } else if (shared && decision?.local) {
    await vault.discardDeviceDraft({ ownerKey: owner, consultationKey: decision.local.consultationKey });
  } else throw new Error("No unfinished consultation was found. Retry the recovery check.");
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
