import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FilePlus2,
  History,
  Stethoscope,
  RefreshCcw,
  XCircle,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  RecordTabs,
  RefreshingIndicator,
  SoftLoadingArea,
} from "../../components/common";
import FollowUpActionModal from "../../components/features/followups/FollowUpActionModal";
import { FollowUpEpisodeContent } from "../../components/features/health-records/FollowUpEpisodePanel";
import { DispensedMedicinesList } from "../../components/features/health-records/HealthRecordClinicalDetails";
import {
  StateBadge,
  buildRecordFollowUpVisitPath,
  formatDate,
  formatTimeLabel,
  getEffectiveState,
  getTaskServiceTypeLabel,
} from "../../components/features/followups/followUpStatusStyles.jsx";
import {
  getFollowUpTask,
  rescheduleFollowUp,
} from "../../services/followUpTaskService";
import { getHealthRecordById } from "../../services/healthRecordService";
import {
  formatDisplayValue,
  formatLongDate,
} from "../../utils/formatters";
import useNotification from "../../hooks/useNotification";
import { queryKeys } from "../../utils/queryKeys";
import {
  getDispensedMedicines,
  getRecordChiefComplaint,
  getRecordDateValue,
  getRecordDiagnosis,
  getRecordInitialActions,
  getRecordNotes,
  getRecordPractitioner,
  getRecordSummary,
  getRecordTime,
  getRecordValue,
  getVitalSignItems,
  normalizeHealthRecordStatus,
} from "../../components/features/health-records/recordDetailsHelpers";
import { errorStateVariant } from "../../utils/errorStateVariant";

const ACTIVE_STATES = ["due_today", "no_show", "upcoming", "rescheduled"];

export default function FollowUpDetails({ role = "bhc" }) {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const basePath = `/${role}`;
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [savingAction, setSavingAction] = useState(false);
  const notify = useNotification();

  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.followUpTaskDetails(role, taskId),
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
  const completedRecordId =
    task?.fulfilledByHealthRecordId ||
    task?.fulfilledByHealthRecord?.id ||
    "";
  const relatedRecordId = completedRecordId || task?.healthRecordId || "";
  const {
    data: relatedRecord,
    error: relatedRecordError,
    isLoading: relatedRecordLoading,
    refetch: refetchRelatedRecord,
  } = useQuery({
    queryKey: queryKeys.healthRecordData(role, relatedRecordId),
    queryFn: () => getHealthRecordById(relatedRecordId, role),
    enabled: Boolean(relatedRecordId),
    retry: false,
  });
  const recordedVisit = completedRecordId ? relatedRecord : null;
  const loading = isLoading && !task;
  const updating = isFetching && !loading && Boolean(task);
  const notFound = !loading && (error?.status === 404 || (!error && !task));
  const hasConnectionError =
    !loading && Boolean(error) && !notFound && error?.status !== 403;

  async function refreshTaskData() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.followUpTaskDetails(role, taskId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.followUpTasks(role),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords(role),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary("bhc"),
      }),
      relatedRecordId
        ? queryClient.invalidateQueries({
            queryKey: queryKeys.healthRecordData(role, relatedRecordId),
          })
        : Promise.resolve(),
    ]);
  }

  function recordFollowUpVisit() {
    if (!task) return;
    navigate(buildRecordFollowUpVisitPath(task, basePath));
  }

  async function handleReschedule(selectedTask, payload) {
    setSavingAction(true);
    try {
      // A reschedule now supersedes this task with a new row rather than
      // moving this one's date, so the page must follow the caller onto the
      // replacement - refetching this id would leave them on the superseded
      // entry, which no longer accepts any action.
      const replacement = await rescheduleFollowUp(selectedTask.id, payload);
      setModal(null);
      await refreshTaskData();
      if (replacement?.id && String(replacement.id) !== String(selectedTask.id)) {
        navigate(`${basePath}/follow-ups/${replacement.id}`, { replace: true });
      }
    } catch (requestError) {
      notify.error(
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

  if (loading) {
    return (
      <DashboardLayout role={role} title="Follow-up Details">
        <SoftLoadingArea skeleton="details"
          isLoading
          message="Loading follow-up details..."
          minHeight="min-h-[520px]"
        >
          <div className="min-h-[520px]" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (notFound || error?.status === 403) {
    const forbidden = error?.status === 403;
    return (
      <DashboardLayout role={role} title="Follow-up Details">
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
            to={`${basePath}/follow-ups`}
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
      <DashboardLayout role={role} title="Follow-up Details">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={errorStateVariant(error)}
        />
      </DashboardLayout>
    );
  }

  if (!task) return null;

  // A task a later reschedule superseded is history: the server refuses every
  // action on it (FollowUpTaskSyncService::isProcessable), so the page must
  // not offer them either - it points at the replacement instead.
  const isSuperseded = Boolean(task.rescheduledToId);
  const active = !isSuperseded && ACTIVE_STATES.includes(task.effectiveState);
  const detailTabs = [
    {
      id: "clinical",
      label: "Clinical Details",
      icon: Stethoscope,
      content: (
        <FollowUpClinicalDetails
          task={task}
          record={recordedVisit}
          loading={completedRecordId && relatedRecordLoading}
          error={completedRecordId ? relatedRecordError : null}
          onRetry={refetchRelatedRecord}
        />
      ),
    },
    {
      id: "chain",
      label: "Visit Chain",
      icon: History,
      content: relatedRecordLoading ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Loading visit chain...
        </div>
      ) : relatedRecordError ? (
        <ConnectionErrorState size="compact" variant="error" onRetry={() => refetchRelatedRecord()} />
      ) : (
        <FollowUpEpisodeContent
          episode={relatedRecord?.followUpEpisode}
          currentRecord={recordedVisit || relatedRecord}
          showRecordNavigation={false}
          showSchedules={false}
        />
      ),
    },
  ];

  return (
    <DashboardLayout role={role} title="Follow-up Details">
      <FollowUpActionModal
        modal={modal}
        saving={savingAction}
        onClose={() => setModal(null)}
        onReschedule={handleReschedule}
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
              {isSuperseded && (
                <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                  Rescheduled - this entry was replaced.
                  <Link
                    to={`${basePath}/follow-ups/${task.rescheduledToId}`}
                    className="font-bold text-[#B91C1C] underline-offset-2 hover:underline"
                  >
                    View current follow-up #{task.rescheduledToId}
                  </Link>
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {task.effectiveState === "fulfilled" && completedRecordId && (
                <Link
                  to={`${basePath}/health-records/${completedRecordId}`}
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

          <div className="mt-5 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
            <MetadataItem
              label="Practitioner"
              value={task.practitioner?.name}
            />
          </div>
        </header>

        <RecordTabs
          key={`${task.id}-${completedRecordId || "pending"}`}
          tabs={detailTabs}
          defaultTabId="clinical"
        />
      </div>
    </DashboardLayout>
  );
}

function FollowUpClinicalDetails({ task, record, loading, error, onRetry }) {
  const completedRecordId =
    task.fulfilledByHealthRecordId || task.fulfilledByHealthRecord?.id || "";

  if (!completedRecordId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
          <Stethoscope size={22} />
        </span>
        <h2 className="mt-4 text-sm font-bold text-slate-900">
          No follow-up visit recorded
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Clinical details will appear here after this pending schedule is
          recorded as a follow-up visit.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        Loading recorded clinical details...
      </div>
    );
  }

  if (error || !record) {
    return (
      <ConnectionErrorState size="compact" variant="error" onRetry={onRetry ? () => onRetry() : undefined} />
    );
  }

  const vitalItems = getVitalSignItems(record);
  const status = normalizeHealthRecordStatus(
    record.followUpStatus || record.status || "Routine Monitoring",
  );
  const patientCondition = getRecordValue(
    record,
    ["patientCondition", "patient_condition"],
    "",
  );
  const followUpDate = getRecordValue(
    record,
    ["followUpDate", "follow_up_date"],
    "",
  );
  const followUpTime = getRecordValue(
    record,
    ["followUpTime", "follow_up_time"],
    "",
  );
  const monitoringNotes = getRecordValue(
    record,
    ["monitoringNotes", "monitoring_notes"],
    "",
  );

  return (
    <div className="space-y-7">
      <ClinicalSection title="Visit Overview">
        <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem
            label="Date of Visit"
            value={formatLongDate(getRecordDateValue(record), "Not recorded")}
          />
          <DetailItem
            label="Time of Visit"
            value={getRecordTime(record)}
          />
          <DetailItem
            label="Practitioner"
            value={getRecordPractitioner(record)}
          />
          <DetailItem label="Visit Status" value={status} />
        </div>
      </ClinicalSection>

      <ClinicalSection title="Clinical Assessment">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <DetailItem
            label="Current Condition"
            value={patientCondition}
          />
          <DetailItem
            label="Chief Complaint"
            value={getRecordChiefComplaint(record, "")}
          />
          <DetailItem
            label="Follow-up Findings"
            value={getRecordSummary(record, "")}
            fullWidth
          />
          <DetailItem
            label="Diagnosis / Assessment"
            value={getRecordDiagnosis(record, "")}
            fullWidth
          />
        </div>
      </ClinicalSection>

      <ClinicalSection title="Vital Signs">
        <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-5">
          {vitalItems.map((item) => (
            <DetailItem
              key={item.label}
              label={item.label}
              value={item.value}
            />
          ))}
        </div>
      </ClinicalSection>

      <ClinicalSection title="Treatment & Notes">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <DetailItem
            label="Treatment / Action Taken"
            value={getRecordInitialActions(record, "")}
            fullWidth
          />
          <DetailItem
            label="Follow-up Notes"
            value={getRecordNotes(record, "")}
            fullWidth
          />
        </div>
        <div className="mt-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Medicines / Supplies Dispensed
          </p>
          <DispensedMedicinesList medicines={getDispensedMedicines(record)} />
        </div>
      </ClinicalSection>

      <ClinicalSection title="Visit Outcome">
        <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem
            label="Next Follow-up Date"
            value={formatLongDate(followUpDate, "Not recorded")}
          />
          <DetailItem
            label="Next Follow-up Time"
            value={formatTimeLabel(followUpTime)}
          />
          <DetailItem
            label="Monitoring / Outcome Notes"
            value={monitoringNotes}
            fullWidth
          />
        </div>
      </ClinicalSection>
    </div>
  );
}

function ClinicalSection({ title, children }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h2>
        <span className="h-px flex-1 bg-slate-100" />
      </div>
      {children}
    </section>
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
