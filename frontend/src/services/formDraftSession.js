import { formDraftOwnerTag, formDraftVault } from "./formDraftVault.js";

const active = new Set();

export function registerFormDraftCoordinator(coordinator) {
  active.add(coordinator);
  return () => active.delete(coordinator);
}

export function hasActiveFormDraft(owner) {
  return [...active].some((engine) => engine.options.owner === owner);
}

export async function prepareDraftLogout(owner, { coordinators = active, vault = formDraftVault, timeoutMs = 4000 } = {}) {
  const owned = [...coordinators].filter((engine) => engine.options.owner === owner);
  let timer;
  try {
    await Promise.race([
      Promise.allSettled(owned.map((engine) => engine.flushBeforeLeave())),
      new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
  let deviceOnlyCount = 0;
  let checkFailed = false;
  try { deviceOnlyCount = (await vault.pendingForOwner(await formDraftOwnerTag(owner))).length; }
  catch { checkFailed = true; }
  return { deviceOnlyCount, checkFailed, hasUnprotectedInput: owned.some((engine) => engine.hasUnprotectedChanges()) };
}

export function draftLogoutDescription({ deviceOnlyCount = 0, hasUnprotectedInput = false, checkFailed = false } = {}) {
  if (hasUnprotectedInput) return "Some recent input has not been saved and may be lost if you log out. Keep working and retry to protect it.";
  if (checkFailed) return "Device recovery could not be checked. Keep working and retry before logging out.";
  if (deviceOnlyCount) return "Some drafts are saved only on this device. Sign in with the same account in this browser to Resume them.";
  return "Signing out keeps saved drafts. You can Resume available drafts after signing in again.";
}
