import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, RefreshCcw, X } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ActionMenu,
  ConnectionErrorState,
  DataTableEmptyState,
  ModuleToolbar,
  ModuleTableCard,
  SoftLoadingArea,
  TablePagination,
} from "../../components/common";
import { isConnectionError } from "../../services/apiClient";
import {
  getFollowUpTasks,
  rescheduleFollowUp,
} from "../../services/followUpTaskService";
import { formatDisplayValue } from "../../utils/formatters";
import {
  createActiveFilterChips,
  isDateInPreset,
} from "../../utils/filterUtils";
import { formatServiceType } from "../../utils/healthRecordPrograms";
import { queryKeys } from "../../utils/queryKeys";

const DEFAULT_FILTERS = {
  search: "",
  dateRange: "all",
  dateFrom: "",
  dateTo: "",
  serviceType: "",
  state: "All Active",
};

const ITEMS_PER_PAGE = 5;

function getTaskClassification(task) {
  return (
    task.healthRecord?.category ||
      task.healthRecord?.patientClassification ||
      task.healthRecord?.recordType ||
      task.healthRecord?.record_type ||
      task.healthRecord?.healthRecordType ||
      task.healthRecord?.health_record_type ||
      task.category ||
      task.patientClassification ||
      task.recordType ||
      ""
  );
}

function getTaskServiceTypeLabel(task) {
  return formatServiceType(getTaskClassification(task), "Unclassified");
}

function getPatientSubtext(task) {
  return formatDisplayValue(
    task.patient?.patientId ||
      task.patientId ||
      task.patient?.ageSex ||
      task.patient?.age ||
      "",
    "No patient ID",
  );
}

export default function FollowUps() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
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
      const matchesDate = isDateInPreset(task.dueDate, filters.dateRange, {
        from: filters.dateFrom,
        to: filters.dateTo,
      });
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
        matchesDate &&
        matchesServiceType &&
        (!searchValue || haystack.includes(searchValue))
      );
    });
  }, [tasks, filters]);

  const totalPages = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE);
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const loading = isLoading && tasks.length === 0;
  const hasLoadError = Boolean(loadError) && !loading;
  const requestedTaskId = searchParams.get("task") || "";
  const requestedOpen = searchParams.get("open") || "";

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
    setModal({
      type: "details",
      task: requestedTask,
      mode: requestedOpen === "due" ? "due" : "no_show",
    });
  }, [isLoading, requestedOpen, requestedTaskId, tasks]);

  const dropdownFilters = [
    {
      key: "dateRange",
      label: "Follow-up Date",
      value: filters.dateRange,
      dateFromValue: filters.dateFrom,
      dateToValue: filters.dateTo,
      resetValue: "all",
      type: "datePresets",
      presets: [
        { value: "all", label: "All dates" },
        { value: "today", label: "Today" },
        { value: "this_week", label: "This week" },
        { value: "this_month", label: "This month" },
        { value: "custom", label: "Custom date" },
      ],
    },
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
    const resetValues = {
      search: "",
      dateRange: "all",
      dateFrom: "",
      dateTo: "",
      serviceType: "",
      state: "All Active",
    };
    if (key === "dateRange") {
      setFilters((prev) => ({
        ...prev,
        dateRange: "all",
        dateFrom: "",
        dateTo: "",
      }));
      return;
    }

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
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
      recordId: task.healthRecordId,
      mode: "follow-up",
      patientId: task.patientId,
      classification: getTaskClassification(task) || getTaskServiceTypeLabel(task),
    });

    navigate(`/bhc/health-records/add?${params.toString()}`);
  }

  function openRescheduleModal(task) {
    setModal({ type: "reschedule", task });
  }

  function viewOriginalRecord(task) {
    navigate(`/bhc/health-records/${task.healthRecordId}`);
  }

  async function handleReschedule(task, dueDate, notes) {
    setSavingAction(true);
    try {
      await rescheduleFollowUp(task.id, dueDate, notes);
      closeModal();
      await refreshTasks();
    } finally {
      setSavingAction(false);
    }
  }

  if (hasLoadError) {
    return (
      <DashboardLayout role="bhc" title="Follow-ups">
        <ConnectionErrorState
          fullPage
          title={isConnectionError(loadError) ? "Connection Lost" : "Unable to Load Data"}
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={loadError?.isTimeout ? "timeout" : isConnectionError(loadError) ? "offline" : "error"}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Follow-ups">
      <ActionModal
        modal={modal}
        saving={savingAction}
        onClose={closeModal}
        onRecordVisit={recordFollowUpVisit}
        onReschedule={handleReschedule}
        onOpenReschedule={openRescheduleModal}
        onViewOriginal={viewOriginalRecord}
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

        {loading ? null : (
        <ModuleTableCard
          title="Follow-up Tracking"
          count={filteredTasks.length}
          subtitle="Scheduled patient follow-ups and return visit tracking."
          minWidth="min-w-[900px]"
          refreshing={isFetching && tasks.length > 0}
          footer={
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          }
        >
          <thead>
            <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              <th className="whitespace-nowrap px-4 py-3">Patient</th>
              <th className="whitespace-nowrap px-4 py-3">Service Type</th>
              <th className="whitespace-nowrap px-4 py-3">Next Follow-up Date</th>
              <th className="whitespace-nowrap px-4 py-3">Status</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F8FAFC]">
            {filteredTasks.length > 0 ? (
              paginatedTasks.map((task) => (
                <FollowUpRow
                  key={task.id}
                  task={task}
                  onRecordVisit={() => recordFollowUpVisit(task)}
                  onReschedule={() => openRescheduleModal(task)}
                />
              ))
            ) : (
              <DataTableEmptyState
                colSpan={5}
                icon={<CalendarClock size={20} className="text-[#94A3B8]" />}
                title="No follow-ups yet."
                description="Follow-ups appear here when a record needs a return visit."
              />
            )}
          </tbody>
        </ModuleTableCard>
        )}
      </SoftLoadingArea>
    </DashboardLayout>
  );
}

function FollowUpRow({ task, onRecordVisit, onReschedule }) {
  const state = task.effectiveState;
  const actions = buildTaskActions(task, {
    onRecordVisit,
    onReschedule,
  });

  return (
    <tr className="group transition-colors duration-150 hover:bg-[#FAFBFD]">
      <td className="px-4 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#111827]">
            {formatDisplayValue(task.patientName, "Unnamed Patient")}
          </p>
          <p className="text-[11px] text-slate-400">{getPatientSubtext(task)}</p>
        </div>
      </td>

      <td className="px-4 py-3.5">
        <ClassificationBadge classification={getTaskServiceTypeLabel(task)} />
      </td>

      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
        {formatDate(task.dueDate)}
      </td>

      <td className="whitespace-nowrap px-4 py-3.5">
        <StateBadge state={state} />
      </td>

      <td className="px-4 py-3.5 text-right">
        <ActionMenu
          title={formatDisplayValue(task.patientName, "Unnamed Patient")}
          subtitle={`#${task.healthRecordId}`}
          actions={actions}
        />
      </td>
    </tr>
  );
}

function buildTaskActions(task, handlers) {
  const originalRecordLink = `/bhc/health-records/${task.healthRecordId}`;
  const latestRecordId =
    task.latestHealthRecordId || task.fulfilledByHealthRecordId || "";
  const actions = [];

  if (["fulfilled", "cancelled"].includes(task.effectiveState)) {
    actions.push({
      label: "View Records",
      to: latestRecordId
        ? `/bhc/health-records/${latestRecordId}`
        : originalRecordLink,
    });
    return actions;
  }

  if (["due_today", "no_show", "upcoming", "rescheduled"].includes(task.effectiveState)) {
    actions.push({
      label: "Record Visit",
      onClick: handlers.onRecordVisit,
    });
    actions.push({
      label: "Reschedule",
      onClick: handlers.onReschedule,
    });
  }

  actions.push({ label: "View Original Record", to: originalRecordLink });
  return actions;
}

function StateBadge({ state }) {
  const config = {
    due_today: ["Due Today", "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]"],
    upcoming: ["Pending", "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"],
    no_show: ["No Show", "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"],
    rescheduled: ["Pending", "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]"],
    fulfilled: ["Completed", "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"],
    cancelled: ["Cancelled", "border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]"],
  }[state] || ["Pending", "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"];

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${config[1]}`}
    >
      {config[0]}
    </span>
  );
}

function ClassificationBadge({ classification }) {
  const map = {
    "General Consultation": "bg-slate-100 text-slate-700",
    "Maternal / Prenatal": "bg-pink-50 text-pink-700",
    "Child Health / EPI": "bg-emerald-50 text-emerald-700",
    "Hypertension / Diabetic Monitoring": "bg-blue-50 text-blue-700",
    "Family Planning": "bg-purple-50 text-purple-700",
    "TB DOTS / TB Monitoring": "bg-amber-50 text-amber-700",
  };

  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${
        map[classification] || "bg-slate-100 text-slate-700"
      }`}
    >
      {classification}
    </span>
  );
}

function ActionModal({
  modal,
  saving,
  onClose,
  onRecordVisit,
  onReschedule,
  onOpenReschedule,
  onViewOriginal,
}) {
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    setNotes("");
    setDueDate("");
  }, [modal]);

  if (!modal) return null;

  if (modal.type === "details") {
    return (
      <FollowUpDetailsModal
        modal={modal}
        onClose={onClose}
        onRecordVisit={onRecordVisit}
        onOpenReschedule={onOpenReschedule}
        onViewOriginal={onViewOriginal}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">
              Reschedule Follow-up
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
              Remarks
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white"
              placeholder="Reason for rescheduling..."
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
            disabled={saving || !dueDate}
            onClick={() => onReschedule(modal.task, dueDate, notes)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw size={14} />
            {saving ? "Saving..." : "Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FollowUpDetailsModal({
  modal,
  onClose,
  onRecordVisit,
  onOpenReschedule,
  onViewOriginal,
}) {
  const { task } = modal;
  const isDueToday = modal.mode === "due";
  const isNoShow = modal.mode === "no_show";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[#0F172A]">
                {isDueToday
                  ? "Follow-up Due Today"
                  : isNoShow
                    ? "No-Show Follow-up"
                    : "Follow-up Details"}
              </h2>
              <StateBadge state={task.effectiveState} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {isDueToday
                ? "This patient has a scheduled follow-up today."
                : isNoShow
                  ? "This patient missed the scheduled follow-up date."
                  : "Review this scheduled follow-up."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-500"
            aria-label="Close follow-up details"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
          <DetailItem label="Patient" value={task.patientName} strong />
          <DetailItem
            label="Service Type"
            value={getTaskServiceTypeLabel(task)}
          />
          <DetailItem
            label="Next Follow-up Date"
            value={formatDate(task.dueDate)}
          />
          <DetailItem
            label="Status"
            value={formatStateLabel(task.effectiveState)}
          />
          <DetailItem label="Contact Number" value={task.contact} />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={() => onViewOriginal(task)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            View Health Record
          </button>
          {task.effectiveState !== "fulfilled" && (
            <>
              <button
                type="button"
                onClick={() => onOpenReschedule(task)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RefreshCcw size={14} />
                Reschedule
              </button>
              {["due_today", "no_show", "upcoming", "rescheduled"].includes(task.effectiveState) && (
                <button
                  type="button"
                  onClick={() => onRecordVisit(task)}
                  className="rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B]"
                >
                  Record Visit
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, strong = false }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-sm ${
          strong ? "font-bold text-[#0F172A]" : "font-semibold text-slate-700"
        }`}
      >
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}

function getEffectiveState(task) {
  if (task.state === "fulfilled") return "fulfilled";
  if (task.state === "no_show") return "no_show";
  if (task.state === "cancelled" || task.state === "canceled") return "cancelled";

  const dueDate = normalizeDate(task.dueDate);
  const today = normalizeDate(new Date());

  if (!dueDate) return "upcoming";
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "no_show";
  if (task.state === "rescheduled") return "rescheduled";
  return "upcoming";
}

function normalizeFilterState(value) {
  const map = {
    "Due Today": "due_today",
    Pending: "upcoming",
    "No Show": "no_show",
    Completed: "fulfilled",
    Cancelled: "cancelled",
  };

  return map[value] || "all_active";
}

function formatStateLabel(state) {
  const map = {
    due_today: "Due Today",
    upcoming: "Pending",
    no_show: "No Show",
    rescheduled: "Pending",
    fulfilled: "Completed",
    cancelled: "Cancelled",
  };

  return map[state] || "Pending";
}

function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(`${normalizeDate(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
