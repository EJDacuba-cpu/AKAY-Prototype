/** Preserve the existing leave flow, with a server-backed return path for Background. */
export async function saveDraftBeforeNavigation({ flush, protectLocal, notifyLocal, requireServer = false }) {
  if (await flush()) return "";
  if (!(await protectLocal())) {
    return "Your latest changes could not be saved securely. Keep this page open and reconnect before leaving.";
  }
  if (requireServer) {
    return "Your latest changes are protected on this device but have not synced. Keep this consultation open and reconnect before editing Patient Background.";
  }
  notifyLocal();
  return "";
}
