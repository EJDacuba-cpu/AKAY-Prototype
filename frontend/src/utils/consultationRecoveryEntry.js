import { clinicalRecoveryChoice, clinicalDeviceDraft } from "./clinicalDraftRecovery.js";

export const consultationEntryKey = (owner, patientId) => ["bhc-consultation-entry", owner, String(patientId)];

export function validConsultationHandoff(entry, { owner, patientId, draftId = "", now = Date.now() }) {
  return Boolean(entry && entry.owner === owner && String(entry.patientId) === String(patientId)
    && now - entry.createdAt < 60_000 && now >= entry.createdAt
    && (!entry.draft || String(entry.draft.patient?.id) === String(patientId))
    && (!draftId || entry.draft?.id === draftId));
}

/** Prepare the existing BHC draft before routing; never create a consultation here. */
export async function prepareConsultationRecovery({ patientId, entry, lookup, load, claim, vault, ownerKey, source = "" }) {
  const metadata = await lookup();
  if ((metadata?.id || null) !== (entry.server?.id || null)) throw new Error("The unfinished draft changed. Retry the recovery check.");
  const server = metadata ? await load(metadata.id) : null;
  const local = entry.local ? await vault.readLocalDraft({ ownerKey, consultationKey: entry.local.consultationKey }) : null;
  if (!server && !local) throw new Error("This unfinished consultation is no longer available.");
  for (const draft of [server, local?.record?.draft].filter(Boolean)) {
    if (String(draft.patient?.id) !== String(patientId)) throw new Error("This consultation does not match the selected patient.");
    const expected = entry.server?.consultationUuid || entry.local?.record?.draft?.consultationUuid;
    if (expected && draft.consultationUuid !== expected) throw new Error("The consultation identity changed.");
  }
  const choice = local ? clinicalRecoveryChoice(local, server) : "server";
  if ((choice === "conflict" && !source) || (choice === "locked" && source !== "server")) return { decision: { local, server, conflict: true, locked: choice === "locked" } };
  const claimed = server && server.canEdit !== false ? { ...server, ...await claim(server.id, server.version), payload: server.payload, medicineSelections: server.medicineSelections } : server;
  const expected = source && entry.conflict ? { ...local, base: { serverPayload: JSON.stringify(entry.server.payload) } } : local;
  if (local && claimed && clinicalRecoveryChoice(expected, claimed) === "conflict") return { decision: { local, server: claimed, conflict: true } };
  return claimed && (source === "server" || choice === "server")
    ? { draft: claimed, unsynced: false }
    : { draft: clinicalDeviceDraft(local.record.draft, claimed), unsynced: true };
}

export function consultationRecoveryEntry({ patientId, server = [], device = [] }) {
  const matches = server.filter((row) => String(row.patient?.id) === String(patientId));
  const copies = device.filter((row) => String(row.record?.draft?.patient?.id) === String(patientId));
  const identities = new Set(matches.map((row) => row.consultationUuid || row.id));
  for (const row of copies) {
    const draft = row.record.draft;
    const match = matches.find((item) => item.id && item.id === draft.id);
    identities.add(match ? match.consultationUuid || match.id : draft.consultationUuid || row.consultationKey);
  }
  if (identities.size > 1) throw new Error("This patient has multiple unfinished consultations. Review the existing drafts before starting another.");
  return matches.length || copies.length ? { server: matches[0] || null, local: copies[0] || null } : null;
}

export function consultationRecoveryPath(patientId, entry) {
  const query = new URLSearchParams({ patientId: String(patientId) });
  if (entry.local) {
    query.set("mode", "new");
    query.set("recoveryUuid", entry.local.record.draft.consultationUuid);
  } else query.set("draftId", entry.server.id);
  return `/bhc/health-records/add?${query}`;
}
