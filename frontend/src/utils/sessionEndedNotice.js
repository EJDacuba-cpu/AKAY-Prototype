/**
 * Login banner after a forced session end. SESSION_EXPIRED stays generic;
 * SESSION_REPLACED explains First-In Kicked Out single-session enforcement.
 */
export function sessionEndedNotice(state = {}) {
  if (state.sessionReason === "session-expired") {
    return "Your session has expired. Please sign in again.";
  }
  if (state.sessionReason === "session-replaced") {
    return "You have been signed out because your account was logged in on another device.";
  }
  if (state.sessionEnded) {
    return "Your session is no longer valid. Please sign in again.";
  }
  return state.notice || "";
}
