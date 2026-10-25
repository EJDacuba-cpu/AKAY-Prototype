/**
 * Follow-up list/calendar actions and navigation. BHC no longer has a
 * dedicated Follow-up Details page; RHU still does, so callers pass basePath.
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
 * Bookmarks of the retired BHC Follow-up Details page. Completed visits with
 * a recorded consultation go to that health record; pending/cancelled tasks
 * stay on the Follow-ups list instead of an unrelated source record.
 */
export function getBhcFollowUpLegacyDestination(task) {
  const recordId = getCompletedFollowUpRecordId(task);
  return recordId ? `/bhc/health-records/${recordId}` : "/bhc/follow-ups";
}

/**
 * Calendar/list click target. RHU still opens Follow-up Details. BHC only
 * navigates when a completed follow-up has its own recorded consultation.
 */
export function getTaskNavigationTarget(task, basePath = "/bhc") {
  if (!task?.id) return "";
  if (basePath === "/rhu") return `${basePath}/follow-ups/${task.id}`;
  const recordId = getCompletedFollowUpRecordId(task);
  return recordId ? `${basePath}/health-records/${recordId}` : "";
}

/**
 * The one follow-up action menu, shared by the List rows and every Calendar
 * event so the two views can never offer different actions for the same
 * task. Optional handlers are only listed when the caller supplies them.
 * BHC omits "View Follow-up Details"; RHU keeps that action.
 */
export function buildTaskActions(task, handlers = {}) {
  const basePath = handlers.basePath || "/bhc";
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

  if (basePath === "/rhu" && task.id) {
    actions.push({
      label: "View Follow-up Details",
      to: `${basePath}/follow-ups/${task.id}`,
    });
  }

  return actions;
}
