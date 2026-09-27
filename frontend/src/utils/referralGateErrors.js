/**
 * Referral submission gate error contract (DOC-14).
 *
 * Kept as a dependency-free module so the code the UI branches on has one
 * definition and can be tested directly. The server is the sole authority for
 * the rule; this helper only classifies its responses.
 */

/** DOC-14 - unconditional hard block. There is no client-side override. */
export const NO_PROVIDER_AVAILABLE = "NO_PROVIDER_AVAILABLE";

function gateCode(error) {
  return error?.payload?.code ?? error?.code ?? "";
}

export function isNoProviderAvailableError(error = {}) {
  return gateCode(error) === NO_PROVIDER_AVAILABLE;
}
