/**
 * Follow-up list/calendar actions and navigation.
 * The dedicated Follow-up Details page is retired for BHC and RHU.
 */

export function getCompletedFollowUpRecordId(task) {
  if (!task) return "";
  const fulfilled =
    task.effectiveState === "fulfilled" || task.state === "fulfilled";
  if (!fulfilled) return "";
  const recordId =
    task.fulfilledByHealthRecordId || task.fulfilledByHealthRecord?.id || "";
  return recordId ? String(recordId) : "";
}

/**
 * Bookmarks of the retired Follow-up Details page. Completed visits with
 * a recorded consultation go to that health record; pending/cancelled tasks
 * stay on the Follow-ups list instead of an unrelated source record.
 */
export function getFollowUpLegacyDestination(task, basePath = "/bhc") {
  const root = String(basePath || "/bhc").replace(/\/$/, "") || "/bhc";
  const recordId = getCompletedFollowUpRecordId(task);
  return recordId ? `${root}/health-records/${recordId}` : `${root}/follow-ups`;
}

/** @deprecated Prefer getFollowUpLegacyDestination(task, "/bhc"). */
export function getBhcFollowUpLegacyDestination(task) {
  return getFollowUpLegacyDestination(task, "/bhc");
}

/**
 * Calendar/list click target. Only navigates when a completed follow-up has
 * its own recorded consultation; otherwise the row stays on the list.
 */
export function getTaskNavigationTarget(task, basePath = "/bhc") {
  if (!task?.id) return "";
  const recordId = getCompletedFollowUpRecordId(task);
  return recordId ? `${basePath}/health-records/${recordId}` : "";
}

/**
 * The one follow-up action menu, shared by the List rows and every Calendar
 * event so the two views can never offer different actions for the same
 * task. Optional handlers are only listed when the caller supplies them.
 */
export function buildTaskActions(task, handlers = {}) {
  const actions = [];

  if (
    ["due_today", "no_show", "upcoming", "rescheduled"].includes(
      task.effectiveState,
    )
  ) {
    actions.push({
      label: "Record Visit",
      onClick: handlers.onRecordVisit,
    });
    actions.push({
      label: "Reschedule",
      onClick: handlers.onReschedule,
    });
    if (handlers.onCancel) {
      actions.push({
        label: "Cancel Follow-up",
        onClick: handlers.onCancel,
      });
    }
  }

  if (
    task.effectiveState === "fulfilled" &&
    handlers.onViewRecord &&
    getCompletedFollowUpRecordId(task)
  ) {
    actions.push({
      label: "View Health Record",
      onClick: handlers.onViewRecord,
    });
  }

  return actions;
}
