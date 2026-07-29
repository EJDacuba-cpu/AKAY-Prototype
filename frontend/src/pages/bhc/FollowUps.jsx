import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCcw, X } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  ModuleToolbar,
  SoftLoadingArea,
} from "../../components/common";
import { isConnectionError } from "../../services/apiClient";
import {
  cancelFollowUp,
  getFollowUpTasks,
  rescheduleFollowUp,
} from "../../services/followUpTaskService";
import { formatDisplayValue } from "../../utils/formatters";
import { createActiveFilterChips } from "../../utils/filterUtils";
import { queryKeys } from "../../utils/queryKeys";
import {
  StateBadge,
  formatDate,
  formatStateLabel,
  getEffectiveState,
  getTaskClassification,
  getTaskNavigationTarget,
  getTaskServiceTypeLabel,
} from "../../components/features/followups/followUpStatusStyles.jsx";
import {
  addDays,
  addMonths,
  addWeeks,
  formatMonthLabel,
  formatWeekRangeLabel,
  getTasksForDay,
  getWeekDays,
  getWeekStart,
  groupTasksByDay,
} from "../../components/features/followups/followUpCalendarUtils.js";
import FollowUpWeekCalendar from "../../components/features/followups/FollowUpWeekCalendar";
import FollowUpDayView from "../../components/features/followups/FollowUpDayView";
import FollowUpMonthMiniCalendar from "../../components/features/followups/FollowUpMonthMiniCalendar";

const DEFAULT_FILTERS = {
  search: "",
  serviceType: "",
  state: "All Active",
};

const VIEW_MODES = ["list", "day", "week", "month"];

export default function FollowUps() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState("list");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [modal, setModal] = useState(null);
  const [routeNotice, setRouteNotice] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  const {
    data: tasksData = [],
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.followUpTasks("bhc"),
    queryFn: () => getFollowUpTasks(),
    staleTime: 30_000,
    retry: false,
  });

  const tasks = useMemo(
    () =>
      (Array.isArray(tasksData) ? tasksData : []).map((task) => ({
        ...task,
        effectiveState: getEffectiveState(task),
      })),
    [tasksData],
  );

  const filteredTasks = useMemo(() => {
    const searchValue = filters.search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesFilter =
        filters.state === "All Active"
          ? ["upcoming", "due_today", "no_show", "rescheduled"].includes(
              task.effectiveState,
            )
          : task.effectiveState === normalizeFilterState(filters.state);
      const matchesServiceType =
        !filters.serviceType ||
        getTaskServiceTypeLabel(task) === filters.serviceType;

      const haystack = [
        task.patientName,
        task.patientId,
        task.healthRecordId,
        task.healthRecord?.chiefComplaint,
        getTaskClassification(task),
        getTaskServiceTypeLabel(task),
        task.contact,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesFilter &&
        matchesServiceType &&
        (!searchValue || haystack.includes(searchValue))
      );
    });
  }, [tasks, filters]);

  const groupedByDay = useMemo(() => groupTasksByDay(filteredTasks), [filteredTasks]);
  const loading = isLoading && tasks.length === 0;
  const hasLoadError = Boolean(loadError) && !loading;
  const requestedTaskId = searchParams.get("task") || "";
  const requestedOpen = searchParams.get("open") || "";

  useEffect(() => {
    if (!requestedTaskId) {
      setRouteNotice("");
      return;
    }
    if (isLoading) return;

    const requestedTask = tasks.find(
      (task) => String(task.id) === String(requestedTaskId),
    );

    if (!requestedTask) {
      setRouteNotice("Follow-up task not found or no longer available.");
      return;
    }

    setRouteNotice("");
    if (requestedOpen === "reschedule" || requestedOpen === "cancel") {
      setModal({ type: requestedOpen, task: requestedTask });
    } else {
      navigate(`/bhc/follow-ups/${requestedTask.id}`, { replace: true });
    }
  }, [isLoading, navigate, requestedOpen, requestedTaskId, tasks]);

  const dropdownFilters = [
    {
      key: "serviceType",
      label: "Service Type",
      value: filters.serviceType,
      resetValue: "",
      type: "select",
      placeholder: "All Service Types",
      options: [
        "General Consultation",
        "Maternal / Prenatal",
        "Child Health / EPI",
        "Hypertension / Diabetic Monitoring",
        "Family Planning",
        "TB DOTS / TB Monitoring",
      ],
    },
    {
      key: "state",
      label: "Status",
      value: filters.state,
      resetValue: "All Active",
      type: "select",
      options: [
        "All Active",
        "Due Today",
        "Pending",
        "No Show",
        "Rescheduled",
        "Completed",
        "Cancelled",
      ],
    },
  ];
  const activeFilters = createActiveFilterChips(filters, dropdownFilters);
  const activeFilterCount = activeFilters.length;

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    updateFilter(key, DEFAULT_FILTERS[key]);
  }

  async function refreshTasks() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.followUpTasks("bhc"),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.healthRecords("bhc"),
    });
  }

  function cleanTaskQuery() {
    if (!requestedTaskId && !requestedOpen) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("task");
    nextParams.delete("open");
    setSearchParams(nextParams, { replace: true });
  }

  function closeModal() {
    setModal(null);
    cleanTaskQuery();
  }

  function recordFollowUpVisit(task) {
    const params = new URLSearchParams({
      mode: "followup",
      followUpId: task.id,
      patientId: task.patientId,
      serviceType: getTaskClassification(task) || getTaskServiceTypeLabel(task),
      followUpStatus: formatStateLabel(task.effectiveState),
      followUpDate: task.dueDate || "",
    });

    if (task.healthRecordId) {
      params.set("recordId", task.healthRecordId);
    }

    navigate(`/bhc/health-records/add?${params.toString()}`);
  }

  function openRescheduleModal(task) {
    setModal({ type: "reschedule", task });
  }

  function handleTaskClick(task) {
    const target = getTaskNavigationTarget(task);
    if (target) navigate(target);
  }

  function viewCompletedHealthRecord(task) {
    const recordId =
      task.fulfilledByHealthRecordId ||
      task.latestHealthRecordId ||
      task.healthRecordId;
    if (recordId) navigate(`/bhc/health-records/${recordId}`);
  }

  async function handleReschedule(task, payload) {
    setSavingAction(true);
    try {
      await rescheduleFollowUp(task.id, payload);
      closeModal();
      await refreshTasks();
    } finally {
      setSavingAction(false);
    }
  }

  function openCancelModal(task) {
    setModal({ type: "cancel", task });
  }

  async function handleCancel(task, notes) {
    setSavingAction(true);
    try {
      await cancelFollowUp(task.id, notes);
      closeModal();
      await refreshTasks();
    } finally {
      setSavingAction(false);
    }
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function goToPrevious() {
    setCurrentDate((prev) =>
      viewMode === "day"
        ? addDays(prev, -1)
        : viewMode === "month"
          ? addMonths(prev, -1)
          : addWeeks(prev, -1),
    );
  }

  function goToNext() {
    setCurrentDate((prev) =>
      viewMode === "day"
        ? addDays(prev, 1)
        : viewMode === "month"
          ? addMonths(prev, 1)
          : addWeeks(prev, 1),
    );
  }

  function handleSelectDayFromMonth(date) {
    setCurrentDate(date);
    setViewMode("day");
  }

  if (hasLoadError) {
    return (
      <DashboardLayout role="bhc" title="Follow-ups">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={loadError?.isTimeout ? "timeout" : isConnectionError(loadError) ? "offline" : "error"}
        />
      </DashboardLayout>
    );
  }

  const weekStart = getWeekStart(currentDate);
  const weekDays = getWeekDays(weekStart);
  const headerLabel =
    viewMode === "day"
      ? formatMonthLabel(currentDate)
      : viewMode === "month"
        ? formatMonthLabel(currentDate)
        : formatWeekRangeLabel(weekStart, weekDays[6]);

  return (
    <DashboardLayout role="bhc" title="Follow-ups">
      <ActionModal
        modal={modal}
        saving={savingAction}
        onClose={closeModal}
        onReschedule={handleReschedule}
        onCancel={handleCancel}
      />

      {routeNotice && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {routeNotice}
        </div>
      )}

      <SoftLoadingArea
        isLoading={loading}
        message="Loading follow-ups..."
        scope="area"
      >
        {!loading ? (
          <ModuleToolbar
            searchValue={filters.search}
            onSearchChange={(value) => updateFilter("search", value)}
            searchPlaceholder="Search by patient or record..."
            filters={dropdownFilters}
            activeFilterCount={activeFilterCount}
            activeFilters={activeFilters}
            onApplyFilters={(nextFilters) =>
              setFilters((prev) => ({ ...prev, ...nextFilters }))
            }
            onClearFilters={clearFilters}
            onRemoveFilter={removeFilter}
            filterDescription="Narrow the follow-up tracking list."
          />
        ) : null}

        {!loading && (
          <div className="anim-fade-up rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col gap-3 border-b border-[#F1F5F9] pb-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-bold text-[#0F172A]">
                {viewMode === "list" ? "Scheduled Return Visits" : headerLabel}
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                {viewMode !== "list" && (
                <div className="flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white p-0.5">
                  <button
                    type="button"
                    onClick={goToPrevious}
                    aria-label="Previous"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="h-7 rounded-md px-2 text-[11px] font-semibold text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={goToNext}
                    aria-label="Next"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                )}

                <div className="flex items-center gap-0.5 rounded-lg border border-[#E5E7EB] bg-white p-0.5">
                  {VIEW_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={`h-7 rounded-md px-2.5 text-[11px] font-semibold capitalize transition-colors ${
                        viewMode === mode
                          ? "bg-red-50 text-[#B91C1C]"
                          : "text-[#64748B] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3">
              {viewMode === "list" && (
                <FollowUpList
                  tasks={filteredTasks}
                  onView={handleTaskClick}
                  onRecord={recordFollowUpVisit}
                  onReschedule={openRescheduleModal}
                  onCancel={openCancelModal}
                  onViewRecord={viewCompletedHealthRecord}
                />
              )}
              {viewMode === "week" && (
                <FollowUpWeekCalendar
                  weekStart={weekStart}
                  groupedByDay={groupedByDay}
                  onTaskClick={handleTaskClick}
                  onRecordVisit={recordFollowUpVisit}
                  onReschedule={openRescheduleModal}
                />
              )}

              {viewMode === "day" && (
                <FollowUpDayView
                  date={currentDate}
                  tasksForDay={getTasksForDay(groupedByDay, currentDate)}
                  onTaskClick={handleTaskClick}
                  onRecordVisit={recordFollowUpVisit}
                  onReschedule={openRescheduleModal}
                />
              )}

              {viewMode === "month" && (
                <FollowUpMonthMiniCalendar
                  monthDate={currentDate}
                  groupedByDay={groupedByDay}
                  onSelectDay={handleSelectDayFromMonth}
                />
              )}
            </div>
          </div>
        )}
      </SoftLoadingArea>
    </DashboardLayout>
  );
}

function FollowUpList({
  tasks,
  onView,
  onRecord,
  onReschedule,
  onCancel,
  onViewRecord,
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
        No follow-ups match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <th className="px-3 py-3">Patient</th>
            <th className="px-3 py-3">Linked Record</th>
            <th className="px-3 py-3">Schedule</th>
            <th className="px-3 py-3">Service</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((task) => {
            const active = ["due_today", "no_show", "upcoming", "rescheduled"].includes(
              task.effectiveState,
            );
            return (
              <tr key={task.id} className="align-top hover:bg-slate-50/60">
                <td className="px-3 py-4">
                  <p className="font-bold text-slate-900">
                    {formatDisplayValue(task.patientName)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Patient ID {formatDisplayValue(task.patientId)}
                  </p>
                </td>
                <td className="px-3 py-4 font-semibold text-slate-700">
                  Record #{formatDisplayValue(task.healthRecordId)}
                </td>
                <td className="px-3 py-4 text-slate-700">
                  <p className="font-semibold">{formatDate(task.dueDate)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {task.dueTime || "Time not recorded"}
                  </p>
                </td>
                <td className="px-3 py-4 text-slate-700">
                  {getTaskServiceTypeLabel(task)}
                </td>
                <td className="px-3 py-4">
                  <StateBadge state={task.effectiveState} />
                </td>
                <td className="px-3 py-4">
                  <div className="flex min-w-max justify-end gap-2">
                    <TableAction onClick={() => onView(task)}>View Details</TableAction>
                    {active && (
                      <>
                        <TableAction primary onClick={() => onRecord(task)}>
                          Record Visit
                        </TableAction>
                        <TableAction onClick={() => onReschedule(task)}>
                          Reschedule
                        </TableAction>
                        <TableAction danger onClick={() => onCancel(task)}>
                          Cancel
                        </TableAction>
                      </>
                    )}
                    {task.effectiveState === "fulfilled" && (
                      <TableAction primary onClick={() => onViewRecord(task)}>
                        View Health Record
                      </TableAction>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableAction({ children, onClick, primary = false, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
        primary
          ? "border-[#B91C1C] bg-[#B91C1C] text-white hover:bg-[#991B1B]"
          : danger
            ? "border-red-200 bg-white text-[#B91C1C] hover:bg-red-50"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function normalizeFilterState(value) {
  const map = {
    "Due Today": "due_today",
    Pending: "upcoming",
    "No Show": "no_show",
    Rescheduled: "rescheduled",
    Completed: "fulfilled",
    Cancelled: "cancelled",
  };

  return map[value] || "all_active";
}

function ActionModal({
  modal,
  saving,
  onClose,
  onReschedule,
  onCancel,
}) {
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  useEffect(() => {
    setNotes("");
    setDueDate(modal?.task?.dueDate || "");
    setDueTime(modal?.task?.dueTime || "");
  }, [modal]);

  if (!modal) return null;

  const cancelling = modal.type === "cancel";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">
              {cancelling ? "Cancel Follow-up" : "Reschedule Follow-up"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {modal.task.patientName || "Selected patient"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-500"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {cancelling ? (
            <p className="text-sm leading-6 text-slate-600">
              This preserves the schedule in history and removes it from active
              follow-up lookup.
            </p>
          ) : (
            <>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              New Follow-up Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Follow-up Time (optional)
            </label>
            <input
              type="time"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white"
            />
          </div>
            </>
          )}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Remarks
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white"
              placeholder={cancelling ? "Reason for cancellation..." : "Rescheduling notes..."}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || (!cancelling && !dueDate)}
            onClick={() =>
              cancelling
                ? onCancel(modal.task, notes)
                : onReschedule(modal.task, {
                    dueDate,
                    dueTime,
                    notes,
                  })
            }
            className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw size={14} />
            {saving
              ? "Saving..."
              : cancelling
                ? "Cancel Follow-up"
                : "Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
