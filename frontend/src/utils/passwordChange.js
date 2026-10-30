export const CHANGE_PASSWORD_PATH = "/change-password";

/** A signed-in user whose temporary password is still active must change it before using anything else. */
export function needsPasswordChange(user, pathname) {
  return Boolean(user?.must_change_password) && pathname !== CHANGE_PASSWORD_PATH;
}
