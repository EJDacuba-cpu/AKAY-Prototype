import { apiRequest } from "./apiClient";

export function createFormDraftApi({ owner, queryClient, request = apiRequest }) {
  const scope = ["form-drafts", owner];
  const call = (path, options = {}) => request(`/form-drafts${path}`, { ...options, draftOwnerContext: owner });
  const data = (result) => result?.data ?? null;
  const read = (path) => queryClient
    ? queryClient.fetchQuery({ queryKey: [...scope, path], queryFn: () => call(path).then(data), staleTime: 0, retry: false })
    : call(path).then(data);
  const params = (identity, extra = {}) => new URLSearchParams({ ...identity, ...extra }).toString();
  const write = async (path, options) => {
    const result = await call(path, options);
    // Drop cached lookups so Discard/Resume cannot revive a stale draft decision.
    await queryClient?.removeQueries({ queryKey: scope });
    return data(result);
  };
  const body = (identity, payload, transactionUuid, baseRevision) => ({ ...identity, payload, transaction_uuid: transactionUuid, schema_version: 1, base_revision: baseRevision });
  return {
    lookup: (identity) => read(`/lookup?${params(identity)}`),
    status: (identity, transactionUuid) => read(`/status?${params(identity, { transaction_uuid: transactionUuid })}`),
    detail: (id) => read(`/${encodeURIComponent(id)}`),
    key: (identity, transactionUuid, local) => call("/device-key", { method: "POST", body: { ...identity, transaction_uuid: transactionUuid,
      ...(local?.keyId ? { key_id: local.keyId, key_version: local.keyVersion } : {}),
    } }).then(data),
    create: (identity, payload, transactionUuid, baseRevision) => write("", { method: "POST", body: body(identity, payload, transactionUuid, baseRevision) }),
    update: (draft, identity, payload, transactionUuid, baseRevision) => write(`/${draft.id}`, { method: "PUT", body: { ...body(identity, payload, transactionUuid, baseRevision), version: draft.version } }),
    discard: (draft) => write(`/${draft.id}`, { method: "DELETE", body: { version: draft.version } }),
    retireDevice: (identity, transactionUuid, keyId) => write("/device-key/retire", { method: "POST", body: { ...identity, transaction_uuid: transactionUuid, key_id: keyId } }),
  };
}
