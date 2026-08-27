/**
 * Referral submission gate error contract (DOC-14, REF-SLIP-05c).
 *
 * Kept as a dependency-free module so the codes the UI branches on have one
 * definition and can be tested directly. The server is the sole authority for
 * these rules; these helpers only classify its responses.
 */

/** DOC-14 - unconditional hard block. There is no client-side override. */
export const NO_PROVIDER_AVAILABLE = "NO_PROVIDER_AVAILABLE";

/** REF-SLIP-05c - Decision A warning; resubmittable with an acknowledgment. */
export const PREFERRED_PROVIDER_UNAVAILABLE = "PREFERRED_PROVIDER_UNAVAILABLE";

/** DOC-15 - the preference is not an active provider of the receiving RHU. */
export const PREFERRED_PROVIDER_INVALID = "PREFERRED_PROVIDER_INVALID";

function gateCode(error) {
  return error?.payload?.code ?? error?.code ?? "";
}

export function isNoProviderAvailableError(error = {}) {
  return gateCode(error) === NO_PROVIDER_AVAILABLE;
}

export function isPreferredProviderUnavailableError(error = {}) {
  return gateCode(error) === PREFERRED_PROVIDER_UNAVAILABLE;
}

export function isPreferredProviderInvalidError(error = {}) {
  return gateCode(error) === PREFERRED_PROVIDER_INVALID;
}

/**
 * The alternatives the server offered alongside a Decision A warning. Always an
 * array so callers never branch on shape.
 */
export function getAvailableAlternatives(error = {}) {
  const alternatives = error?.payload?.available_alternatives;
  return Array.isArray(alternatives) ? alternatives : [];
}
