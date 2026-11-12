/** Active foreign editor lease — separate from unfinished-draft recovery. */
export function consultationEditorLease(draft, currentUserId, now = Date.now()) {
  const editorId = draft?.editor?.id != null ? String(draft.editor.id) : "";
  const expiresAt = draft?.editorExpiresAt ? Date.parse(draft.editorExpiresAt) : NaN;
  const active = Boolean(editorId && Number.isFinite(expiresAt) && expiresAt > now);
  const sameUser = Boolean(active && currentUserId != null && currentUserId !== "" && editorId === String(currentUserId));
  const occupied = Boolean(active && !sameUser);
  return {
    occupied,
    sameUser,
    canTakeover: occupied && draft?.canEdit !== false,
    editorId,
    editorName: draft?.editor?.name || "another staff member",
  };
}

export function editorLeaseConflict(editorName = "another staff member") {
  const error = new Error(`Being edited by ${editorName}. Confirm takeover to continue.`);
  error.code = "EDITOR_LEASE_OCCUPIED";
  error.editorName = editorName;
  return error;
}

export function isEditorLeaseConflict(problem) {
  return problem?.code === "EDITOR_LEASE_OCCUPIED" || /Being edited by/i.test(problem?.message || "");
}

export function assertConsultationEditable(draft) {
  if (draft?.canEdit === false) {
    throw new Error("This consultation is under review. Only authorized staff can continue editing.");
  }
}

export function assertConsultationLeaseAvailable(draft, currentUserId) {
  const lease = consultationEditorLease(draft, currentUserId);
  if (lease.occupied) throw editorLeaseConflict(lease.editorName);
}

export function ownershipFromDraft(draft, currentUserId) {
  if (!draft) return null;
  const lease = consultationEditorLease(draft, currentUserId);
  if (!lease.occupied) return null;
  return {
    occupied: true,
    canTakeover: lease.canTakeover,
    editorName: lease.editorName,
    editorId: lease.editorId,
  };
}

export function ownershipFromProblem(problem) {
  if (!isEditorLeaseConflict(problem)) return null;
  const match = String(problem?.message || "").match(/Being edited by\s+(.+?)\./i);
  return {
    occupied: true,
    editorName: problem?.editorName || match?.[1] || "another staff member",
  };
}
