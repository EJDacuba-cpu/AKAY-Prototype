import { API_ERROR_MESSAGES } from "../services/apiErrorMessages.js";
import { errorStateVariant } from "./errorStateVariant.js";

/** Mark a validated-but-unusable visit so the workspace can hide Retry. */
export function visitUnavailableError(message) {
  const error = new Error(message || "Start this consultation from Today's Queue.");
  error.code = "VISIT_UNAVAILABLE";
  return error;
}

/**
 * Map a failed RHU visit fetch/validation into UI copy.
 * Timeout/network stay retryable; closed/mismatched visits and auth failures do not.
 */
export function rhuVisitLoadError(error) {
  if (error?.code === "VISIT_UNAVAILABLE") {
    return {
      kind: "unavailable",
      title: "Consultation not available",
      message: error.message || "Start this consultation from Today's Queue.",
      retryable: false,
      variant: "error",
    };
  }

  if (Number(error?.status) === 401 || Number(error?.status) === 403) {
    return {
      kind: "forbidden",
      title: "Access Not Assigned",
      message:
        error?.message
        || "Your current facility permissions do not include this consultation. Contact MHO if your work requires this access.",
      retryable: false,
      variant: "forbidden",
    };
  }

  const variant = errorStateVariant(error);
  const fallback =
    variant === "timeout"
      ? API_ERROR_MESSAGES.timeout
      : variant === "offline"
        ? API_ERROR_MESSAGES.offline
        : variant === "unreachable"
          ? API_ERROR_MESSAGES.unreachable
          : API_ERROR_MESSAGES.generic;

  return {
    kind: "load",
    title: "Unable to load consultation",
    message: error?.message || fallback,
    retryable: true,
    variant,
  };
}
