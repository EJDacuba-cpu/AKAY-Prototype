function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  return value ?? null;
}
function stable(value) {
  let payload = value;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { /* A malformed baseline cannot match an object payload. */ }
  }
  return JSON.stringify(normalize(payload));
}

/** Compare content, not lease-only version bumps. Unknown server changes need a choice. */
export function clinicalRecoveryChoice(local, server) {
  if (!server) return "device";
  const device = local?.record?.draft;
  if (!device || String(device.patient?.id) !== String(server.patient?.id) || (server.consultationUuid && device.consultationUuid !== server.consultationUuid)) return "conflict";
  if (server.canEdit === false) return "locked";
  const synced = stable(server.payload);
  if (synced === stable(device.payload)) return "server";
  if (local.base?.serverPayload && synced === stable(local.base.serverPayload)) return "device";
  if (local.base?.pendingPayload && synced === stable(local.base.pendingPayload)) return "device";
  return "conflict";
}

export function clinicalDeviceDraft(device, server) {
  if (!server) return device;
  const stock = new Map((server.medicineSelections || []).map((row) => [String(row.medicine_id), row]));
  return {
    ...device,
    id: server.id, version: server.version, reviewState: server.reviewState, returnNote: server.returnNote,
    medicineSelections: (device.medicineSelections || []).map((row) => {
      const current = stock.get(String(row.medicine_id));
      return current ? { ...row, medicine: current.medicine, warning: current.warning } : row;
    }),
  };
}
