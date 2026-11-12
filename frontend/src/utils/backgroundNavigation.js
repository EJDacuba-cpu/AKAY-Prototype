/** Preserve the existing leave flow. Server confirmation is required to leave safely. */
export async function saveDraftBeforeNavigation({ flush, protectLocal, notifyLocal, requireServer = false }) {
  if (await flush()) return "";
  if (!(await protectLocal?.())) {
    return "Your changes couldn't be saved. Please try again before leaving.";
  }
  if (requireServer) {
    return "Your changes couldn't be saved. Please try again before leaving.";
  }
  notifyLocal?.();
  return "";
}
