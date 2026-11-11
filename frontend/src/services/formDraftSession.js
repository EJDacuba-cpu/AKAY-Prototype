const active = new Set();

export function registerFormDraftCoordinator(coordinator) {
  active.add(coordinator);
  return () => active.delete(coordinator);
}

export function hasActiveFormDraft(owner) {
  return [...active].some((engine) => engine.options.owner === owner);
}

export async function prepareDraftLogout(owner, { coordinators = active, timeoutMs = 4000 } = {}) {
  const owned = [...coordinators].filter((engine) => engine.options.owner === owner);
  let timer;
  try {
    await Promise.race([
      Promise.allSettled(owned.map((engine) => engine.flushBeforeLeave())),
      new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
  return {
    deviceOnlyCount: 0,
    checkFailed: false,
    hasUnprotectedInput: owned.some((engine) => engine.hasUnprotectedChanges()),
  };
}

export function draftLogoutDescription({ hasUnprotectedInput = false } = {}) {
  if (hasUnprotectedInput) {
    return "Some recent input has not been saved and may be lost if you log out. Keep working and retry to protect it.";
  }
  return "Signing out keeps saved drafts. You can Resume available drafts after signing in again.";
}
