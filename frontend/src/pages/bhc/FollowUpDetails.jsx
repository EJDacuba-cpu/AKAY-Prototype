import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  FilePlus2,
  History,
  Link2,
  RefreshCcw,
  XCircle,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  RefreshingIndicator,
  SideCard,
  SoftLoadingArea,
} from "../../components/common";
import FollowUpActionModal from "../../components/features/followups/FollowUpActionModal";
import {
  StateBadge,
  formatDate,
  formatStateLabel,
  formatTimeLabel,
  getEffectiveState,
  getTaskClassification,
  getTaskServiceTypeLabel,
} from "../../components/features/followups/followUpStatusStyles.jsx";
import {
  cancelFollowUp,
  getFollowUpTask,
  rescheduleFollowUp,
} from "../../services/followUpTaskService";
import { isConnectionError } from "../../services/apiClient";
import { formatDisplayValue } from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const ACTIVE_STATES = ["due_today", "no_show", "upcoming", "rescheduled"];

export default function FollowUpDetails() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [savingAction, setSavingAction] = useState(false);
  const [actionError, setActionError] = useState("");

  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.followUpTaskDetails("bhc", taskId),
    queryFn: () => getFollowUpTask(taskId),
    enabled: Boolean(taskId),
    retry: false,
  });

  const task = useMemo(
    () =>
      data
        ? {
            ...data,
            effectiveState: getEffectiveState(data),
          }
        : null,
    [data],
  );
  const loading = isLoading && !task;
  const updating = isFetching && !loading && Boolean(task);
  const notFound = !loading && (error?.status === 404 || (!error && !task));
  const hasConnectionError =
    !loading && Boolean(error) && !notFound && error?.status !== 403;

  async function refreshTaskData() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.followUpTaskDetails("bhc", taskId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.followUpTasks("bhc"),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords("bhc"),
      }),
    ]);
  }

  function recordFollowUpVisit() {
    if (!task) return;

    const params = new URLSearchParams({
      mode: "followup",
      followUpId: task.id,
      patientId: task.patientId,
      serviceType:
        getTaskClassification(task) || getTaskServiceTypeLabel(task),
      followUpStatus: formatStateLabel(task.effectiveState),
      followUpDate: task.dueDate || "",
    });

    if (task.healthRecordId) {
      params.set("recordId", task.healthRecordId);
    }

    navigate(`/bhc/health-records/add?${params.toString()}`);
  }

  async function handleReschedule(selectedTask, payload) {
    setSavingAction(true);
    setActionError("");
    try {
      await rescheduleFollowUp(selectedTask.id, payload);
      setModal(null);
      await refreshTaskData();
    } catch (requestError) {
      setActionError(
        requestError?.status === 409
          ? "This follow-up has already changed. The latest details have been loaded."
          : requestError?.message || "Unable to reschedule this follow-up.",
      );
      if (requestError?.status === 409) {
        setModal(null);
        await refreshTaskData();
      }
    } finally {
      setSavingAction(false);
    }
  }

  async function handleCancel(selectedTask, notes) {
    setSavingAction(true);
    setActionError("");
    try {
      await cancelFollowUp(selectedTask.id, notes);
      setModal(null);
      await refreshTaskData();
    } catch (requestError) {
      setActionError(
        requestError?.status === 409
          ? "This follow-up has already changed. The latest details have been loaded."
          : requestError?.message || "Unable to cancel this follow-up.",
      );
      if (requestError?.status === 409) {
        setModal(null);
        await refreshTaskData();
      }
    } finally {
      setSavingAction(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Follow-up Details">
        <SoftLoadingArea
          isLoading
          message="Loading follow-up details..."
          minHeight="min-h-[520px]"
        >
          <div className="min-h-[520px] rounded-2xl border border-slate-200 bg-white shadow-sm" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (notFound || error?.status === 403) {
    const forbidden = error?.status === 403;
    return (
      <DashboardLayout role="bhc" title="Follow-up Details">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-[#B91C1C]">
            <XCircle size={26} />
          </div>
          <h1 className="mt-5 text-xl font-bold text-[#0F172A]">
            {forbidden ? "Follow-up unavailable" : "Follow-up not found"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {forbidden
              ? "You do not have access to this follow-up schedule."
              : "This follow-up schedule does not exist or is no longer available."}
          </p>
          <Link
            to="/bhc/follow-ups"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#7F1D1D]"
          >
            <ArrowLeft size={14} />
            Back to Follow-ups
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (hasConnectionError) {
    return (
      <DashboardLayout role="bhc" title="Follow-up Details">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={
            error?.isTimeout
              ? "timeout"
              : isConnectionError(error)
                ? "offline"
                : "error"
          }
        />
      </DashboardLayout>
    );
  }

  if (!task) return null;

  const active = ACTIVE_STATES.includes(task.effectiveState);
  const firstFollowUp =
    String(task.healthRecordId) === String(task.originalHealthRecordId);
  const sourceRecordLabel = firstFollowUp
    ? "View Original Record"
    : "View Previous Follow-up Record";
  const completedRecordId =
    task.fulfilledByHealthRecordId || task.fulfilledByHealthRecord?.id || "";

  return (
    <DashboardLayout role="bhc" title="Follow-up Details">
      <FollowUpActionModal
        modal={modal}
        saving={savingAction}
        onClose={() => setModal(null)}
        onReschedule={handleReschedule}
        onCancel={handleCancel}
      />

      <div className="min-h-[520px]">
        <header className="mb-6 p-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#B91C1C]"
          >
            <ArrowLeft size={15} />
            Back to Follow-ups
          </button>

          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-[#0F172A]">
                  Follow-up Details
                </h1>
                <StateBadge state={task.effectiveState} />
                {updating && (
                  <RefreshingIndicator label="Updating follow-up details..." />
                )}
              </div>
              <p className="mt-2 font-mono text-[11px] font-semibold text-slate-600">
                Follow-up #{task.id}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Linked to record #{formatDisplayValue(task.healthRecordId)}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {task.healthRecordId && (
                <Link
                  to={`/bhc/health-records/${task.healthRecordId}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  <Link2 size={14} />
                  {sourceRecordLabel}
                </Link>
              )}
              {task.effectiveState === "fulfilled" && completedRecordId && (
                <Link
                  to={`/bhc/health-records/${completedRecordId}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                >
                  <History size={14} />
                  View Follow-up Health Record
                </Link>
              )}
              {active && (
                <>
                  <button
                    type="button"
                    onClick={() => setModal({ type: "reschedule", task })}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                  >
                    <RefreshCcw size={14} />
                    Reschedule
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal({ type: "cancel", task })}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#B91C1C] shadow-sm transition hover:bg-red-50"
                  >
                    <XCircle size={14} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={recordFollowUpVisit}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                  >
                    <FilePlus2 size={14} />
                    Record Visit
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetadataItem label="Patient Full Name" value={task.patientName} />
            <MetadataItem
              label="Patient ID"
              value={task.patient?.patientId || task.patientId}
            />
            <MetadataItem
              label="Service Type"
              value={getTaskServiceTypeLabel(task)}
            />
            <MetadataItem
              label="Scheduled Date"
              value={formatDate(task.dueDate)}
            />
            <MetadataItem
              label="Scheduled Time"
              value={formatTimeLabel(task.dueTime) || "Not recorded"}
            />
          </div>
        </header>

        {actionError && (
          <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {actionError}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <SideCard
            title="Follow-up Schedule"
            subtitle="Return-visit information recorded for this schedule."
            icon={<CalendarDays size={15} />}
          >
            <div className="grid gap-x-5 sm:grid-cols-2">
              <DetailItem
                label="Scheduled Date"
                value={formatDate(task.dueDate)}
              />
              <DetailItem
                label="Scheduled Time"
                value={formatTimeLabel(task.dueTime)}
              />
              <DetailItem
                label="Follow-up Reason"
                value={task.reason}
                fullWidth
              />
              <DetailItem label="Remarks" value={task.notes} fullWidth />
              <DetailItem
                label="Assigned Practitioner"
                value={task.practitioner?.name}
                fullWidth
              />
            </div>
          </SideCard>

          <SideCard
            title="Status & Record Links"
            subtitle="Explicit schedule lifecycle and linked health records."
            icon={<CalendarClock size={15} />}
            badge={formatStateLabel(task.effectiveState)}
            badgeType={getBadgeType(task.effectiveState)}
          >
            <div className="grid gap-x-5 sm:grid-cols-2">
              <DetailItem
                label="Current Status"
                value={formatStateLabel(task.effectiveState)}
              />
              <DetailItem label="Follow-up ID" value={`#${task.id}`} />
              <DetailItem
                label="Direct Source Record"
                value={`Record #${formatDisplayValue(task.healthRecordId)}`}
              />
              <DetailItem
                label="Original Episode Record"
                value={`Record #${formatDisplayValue(task.originalHealthRecordId)}`}
              />
              {completedRecordId && (
                <DetailItem
                  label="Completed Health Record"
                  value={`Record #${completedRecordId}`}
                  fullWidth
                />
              )}
              {task.noShowAt && (
                <DetailItem
                  label="Marked No Show"
                  value={formatTimestamp(task.noShowAt)}
                  fullWidth
                />
              )}
              {task.rescheduledAt && (
                <DetailItem
                  label="Last Rescheduled"
                  value={formatTimestamp(task.rescheduledAt)}
                  fullWidth
                />
              )}
              {task.fulfilledAt && (
                <DetailItem
                  label="Completed"
                  value={formatTimestamp(task.fulfilledAt)}
                  fullWidth
                />
              )}
              {task.cancelledAt && (
                <DetailItem
                  label="Cancelled"
                  value={formatTimestamp(task.cancelledAt)}
                  fullWidth
                />
              )}
            </div>
          </SideCard>
        </div>
      </div>
    </DashboardLayout>
  );
}

function MetadataItem({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-700">
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}

function DetailItem({ label, value, fullWidth = false }) {
  return (
    <div
      className={`border-b border-slate-100 py-3 ${
        fullWidth ? "sm:col-span-2" : ""
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}

function formatTimestamp(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getBadgeType(state) {
  if (state === "fulfilled") return "success";
  if (state === "cancelled" || state === "no_show") return "danger";
  if (state === "due_today") return "warning";
  return "default";
}
