/**
 * What a person reads when a request fails. Browser and transport wording ("Failed to fetch", "API ...") never
 * reaches the screen; a message the server wrote for people (for example "Email is already taken.") is kept.
 */
export const API_ERROR_MESSAGES = {
  offline: "You are offline. Please reconnect and try again.",
  timeout: "The server is taking too long to respond. Please try again in a moment.",
  unreachable: "We couldn't reach the server. Please check your connection and try again.",
  generic: "Something went wrong. Please try again.",
};

/** The server's own message, else its first validation message, else the generic text. */
export function serverErrorMessage(payload) {
  if (payload?.message) return payload.message;
  const firstValidationError = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
  return firstValidationError || API_ERROR_MESSAGES.generic;
}
