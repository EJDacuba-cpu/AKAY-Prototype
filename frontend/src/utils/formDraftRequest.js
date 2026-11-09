export function formDraftOwnerContext(user = {}) {
  return JSON.stringify([
    String(user.id || ""), user.backendRole || user.role || "",
    user.workingFacilityKey || user.working_facility_key || "",
    user.barangayHealthCenterId || user.barangay_health_center_id || "",
    user.ruralHealthUnitId || user.rural_health_unit_id || "",
  ]);
}

export function formDraftRequestOptions(options, user = {}) {
  if (!options.draftOwnerContext && !options.draftCommit) return options;
  if (!user.id || options.draftOwnerContext !== formDraftOwnerContext(user)) {
    throw Object.assign(new Error("The account or working facility changed. Reopen the form before saving."), { code: "DRAFT_SESSION_CHANGED" });
  }
  if (!options.draftCommit) return options;
  const { id, version, transaction_uuid: transaction } = options.draftCommit;
  if (!id || !transaction || !Number.isInteger(version) || version < 1) throw new Error("Draft commit metadata is incomplete.");
  return { ...options, headers: { ...options.headers,
    "X-Form-Draft-Id": String(id), "X-Form-Draft-Version": String(version), "X-Form-Draft-Transaction": String(transaction),
  } };
}
