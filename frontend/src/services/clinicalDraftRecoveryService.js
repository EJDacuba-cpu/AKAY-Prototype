import { apiRequest } from "./apiClient";
import { createClinicalDraftVault } from "./clinicalDraftVault";
import { formDraftVault } from "./formDraftVault";
import { formDraftOwnerContext } from "../utils/formDraftRequest";
import * as legacy from "./localDraftVault";

export function createClinicalDraftRecovery(user) {
  const owner = formDraftOwnerContext(user);
  const call = (path, body) => apiRequest(`/form-drafts/${path}`, { method: "POST", body, draftOwnerContext: owner }).then((response) => response.data);
  return createClinicalDraftVault({
    owner, vault: formDraftVault, available: legacy.isLocalDraftVaultAvailable,
    legacy: user.role === "rhu" ? null : legacy, legacyOwnerKey: String(user.id || ""),
    api: {
      key: (contextKey, uuid) => call("device-key", { form_type: "consultation", mode: "edit", context_key: contextKey, transaction_uuid: uuid }),
      open: (keyId) => call(`clinical-key/${encodeURIComponent(keyId)}`),
      migrate: (contextKey, uuid, payload) => call("clinical-migrate", { form_type: "consultation", mode: "edit", context_key: contextKey, transaction_uuid: uuid, payload }),
      discard: (contextKey, uuid, keyId) => call("clinical-discard", { form_type: "consultation", mode: "edit", context_key: contextKey, transaction_uuid: uuid, key_id: keyId }),
    },
  });
}
