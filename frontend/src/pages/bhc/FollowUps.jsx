import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, RefreshCcw, UserX, X } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ActionMenu,
  ListToolbar,
  ModuleTableCard,
  TablePagination,
  TableSkeleton,
} from "../../components/common";
import {
  getFollowUpTasks,
  markFollowUpNoShow,
  rescheduleFollowUp,
} from "../../services/followUpTaskService";
import { formatDisplayValue } from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const DEFAULT_FILTERS = {
  search: "",
  state: "All Active",
};

const ITEMS_PER_PAGE = 5;

function getTaskClassification(task) {
  return formatDisplayValue(
    task.healthRecord?.category ||
      task.healthRecord?.patientClassification ||
      task.healthRecord?.recordType,
    "Unclassified",
  );
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
  } = useQuery({
    queryKey: queryKeys.followUpTasks("bhc"),
    queryFn: () => getFollowUpTasks(),
    staleTime: 30_000,
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
          ? ["upcoming", "due_today", "overdue", "rescheduled"].includes(
              task.effectiveState,
            )
          : task.effectiveState === normalizeFilterState(filters.state);

      const haystack = [
        task.patientName,
        task.patientId,
        task.healthRecordId,
        task.healthRecord?.chiefComplaint,
        getTaskClassification(task),
        task.contact,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!searchValue || haystack.includes(searchValue));
    });
  }, [tasks, filters]);

  const totalPages = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE);
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const loading = isLoading && tasks.length === 0;
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
      mode: requestedOpen === "due" ? "due" : "overdue",
    });
  }, [isLoading, requestedOpen, requestedTaskId, tasks]);

  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
    filters.state !== "All Active" && { key: "state", label: filters.state },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  const dropdownFilters = [
    {
      key: "state",
      label: "Follow-up State",
      value: filters.state,
      options: [
        "All Active",
        "Due Today",
        "Overdue",
        "Upcoming",
        "No-show",
        "Rescheduled",
        "Fulfilled",
      ],
    },
  ];

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      state: "All Active",
    };
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
    navigate(
      `/bhc/health-records/add?recordId=${task.healthRecordId}&mode=follow-up`,
    );
  }

  function openNoShowModal(task) {
    setModal({ type: "no_show", task });
  }

  function openRescheduleModal(task) {
    setModal({ type: "reschedule", task });
  }

  function viewOriginalRecord(task) {
    navigate(`/bhc/health-records/${task.healthRecordId}`);
  }

  async function handleNoShow(task, notes) {
    setSavingAction(true);
    try {
      await markFollowUpNoShow(task.id, notes);
      closeModal();
      await refreshTasks();
    } finally {
      setSavingAction(false);
    }
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

  return (
    <DashboardLayout role="bhc" title="Follow-ups">
      <ActionModal
        modal={modal}
        saving={savingAction}
        onClose={closeModal}
        onRecordVisit={recordFollowUpVisit}
        onNoShow={handleNoShow}
        onOpenNoShow={openNoShowModal}
        onReschedule={handleReschedule}
        onOpenReschedule={openRescheduleModal}
        onViewOriginal={viewOriginalRecord}
      />

      {routeNotice && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {routeNotice}
        </div>
      )}

      <ListToolbar
        searchValue={filters.search}
        onSearchChange={(value) => updateFilter("search", value)}
        searchPlaceholder="Search by patient, original record, or chief complaint..."
        filters={dropdownFilters}
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilters}
        onApplyFilters={(nextFilters) =>
          setFilters((prev) => ({ ...prev, ...nextFilters }))
        }
        onClearFilters={clearFilters}
        onRemoveFilter={removeFilter}
      />

      {loading ? (
        <TableSkeleton columns={8} rows={8} label="Loading follow-ups..." />
      ) : (
        <ModuleTableCard
          title="Follow-up Tracking"
          count={filteredTasks.length}
          subtitle="Scheduled patient follow-ups and return visit tracking."
          minWidth="min-w-[1180px]"
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
              <th className="whitespace-nowrap px-4 py-3">Original Record</th>
              <th className="whitespace-nowrap px-4 py-3">Chief Complaint</th>
              <th className="whitespace-nowrap px-4 py-3">Classification</th>
              <th className="whitespace-nowrap px-4 py-3">Follow-up Date</th>
              <th className="whitespace-nowrap px-4 py-3">Follow-up State</th>
              <th className="whitespace-nowrap px-4 py-3">Contact</th>
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
                  onNoShow={() => openNoShowModal(task)}
                  onReschedule={() => openRescheduleModal(task)}
                />
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-6 py-24 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
                    <CalendarClock size={20} className="text-[#94A3B8]" />
                  </div>
                  <p className="text-[13px] font-semibold text-[#334155]">
                    No follow-ups found
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-[11.5px] text-[#94A3B8]">
                    Scheduled follow-ups will appear here when a health record
                    is marked as Follow-up Required.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </ModuleTableCard>
      )}
    </DashboardLayout>
  );
}

function FollowUpRow({ task, onRecordVisit, onNoShow, onReschedule }) {
  const state = task.effectiveState;
  const actions = buildTaskActions(task, {
    onRecordVisit,
    onNoShow,
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

      <td className="whitespace-nowrap px-4 py-3.5">
        <span
          className="inline-flex cursor-default rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-1.5 font-mono text-[11px] font-semibold text-[#475569]"
          aria-label={`Original record number ${task.healthRecordId}`}
        >
          #{task.healthRecordId}
        </span>
      </td>

      <td className="max-w-[240px] px-4 py-3.5 text-[13px] font-medium text-[#6B7280]">
        <span className="line-clamp-2">
          {formatDisplayValue(task.healthRecord?.chiefComplaint, "Not recorded")}
        </span>
      </td>

      <td className="px-4 py-3.5">
        <ClassificationBadge classification={getTaskClassification(task)} />
      </td>

      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
        {formatDate(task.dueDate)}
      </td>

      <td className="whitespace-nowrap px-4 py-3.5">
        <StateBadge state={state} />
      </td>

      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#6B7280]">
        {formatDisplayValue(task.contact, "Not recorded")}
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
  const actions = [];

  if (task.effectiveState === "fulfilled") {
    if (task.fulfilledByHealthRecordId) {
      actions.push({
        label: "View Follow-up Record",
        to: `/bhc/health-records/${task.fulfilledByHealthRecordId}`,
      });
    }
    actions.push({ label: "View Original Record", to: originalRecordLink });
    return actions;
  }

  if (["due_today", "overdue"].includes(task.effectiveState)) {
    actions.push({
      label: "Record Follow-up Visit",
      onClick: handlers.onRecordVisit,
    });
    actions.push({ label: "Mark as No-show", onClick: handlers.onNoShow });
    actions.push({
      label: "Reschedule Follow-up",
      onClick: handlers.onReschedule,
    });
  } else if (["upcoming", "no_show", "rescheduled"].includes(task.effectiveState)) {
    actions.push({
      label: "Reschedule Follow-up",
      onClick: handlers.onReschedule,
    });
  }

  actions.push({ label: "View Original Record", to: originalRecordLink });
  return actions;
}

function StateBadge({ state }) {
  const config = {
    due_today: ["Due Today", "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]"],
    overdue: ["Overdue", "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"],
    upcoming: ["Upcoming", "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"],
    no_show: ["No-show", "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]"],
    rescheduled: ["Rescheduled", "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]"],
    fulfilled: ["Fulfilled", "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"],
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
    "Maternal Care": "bg-pink-50 text-pink-700",
    Maternal: "bg-pink-50 text-pink-700",
    Immunization: "bg-emerald-50 text-emerald-700",
    "Senior Citizen": "bg-blue-50 text-blue-700",
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
  onNoShow,
  onOpenNoShow,
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
        onOpenNoShow={onOpenNoShow}
        onOpenReschedule={onOpenReschedule}
        onViewOriginal={onViewOriginal}
      />
    );
  }

  const isReschedule = modal.type === "reschedule";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">
              {isReschedule ? "Reschedule Follow-up" : "Mark as No-show"}
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
          {isReschedule && (
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
              placeholder={
                isReschedule
                  ? "Reason for rescheduling..."
                  : "No-show remarks..."
              }
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
            disabled={saving || (isReschedule && !dueDate)}
            onClick={() =>
              isReschedule
                ? onReschedule(modal.task, dueDate, notes)
                : onNoShow(modal.task, notes)
            }
            className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReschedule ? <RefreshCcw size={14} /> : <UserX size={14} />}
            {saving
              ? "Saving..."
              : isReschedule
                ? "Reschedule Follow-up"
                : "Mark as No-show"}
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
  onOpenNoShow,
  onOpenReschedule,
  onViewOriginal,
}) {
  const { task } = modal;
  const isDueToday = modal.mode === "due";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[#0F172A]">
                {isDueToday ? "Follow-up Due Today" : "Overdue Follow-up"}
              </h2>
              <StateBadge state={task.effectiveState} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {isDueToday
                ? "This patient has a scheduled follow-up today."
                : "This patient missed the scheduled follow-up date."}
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
            label="Original Record"
            value={task.healthRecordId ? `#${task.healthRecordId}` : ""}
          />
          <DetailItem
            label="Chief Complaint"
            value={task.healthRecord?.chiefComplaint}
          />
          <DetailItem
            label="Classification"
            value={getTaskClassification(task)}
          />
          <DetailItem
            label="Scheduled Follow-up Date"
            value={formatDate(task.dueDate)}
          />
          <DetailItem
            label="Follow-up State"
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
            View Original Record
          </button>
          <button
            type="button"
            onClick={() => onOpenReschedule(task)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCcw size={14} />
            Reschedule Follow-up
          </button>
          <button
            type="button"
            onClick={() => onOpenNoShow(task)}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
          >
            <UserX size={14} />
            Mark as No-show
          </button>
          <button
            type="button"
            onClick={() => onRecordVisit(task)}
            className="rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B]"
          >
            Record Follow-up Visit
          </button>
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
  if (task.state === "rescheduled") return "rescheduled";

  const dueDate = normalizeDate(task.dueDate);
  const today = normalizeDate(new Date());

  if (!dueDate) return "upcoming";
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "overdue";
  return "upcoming";
}

function normalizeFilterState(value) {
  const map = {
    "Due Today": "due_today",
    Overdue: "overdue",
    Upcoming: "upcoming",
    "No-show": "no_show",
    Rescheduled: "rescheduled",
    Fulfilled: "fulfilled",
  };

  return map[value] || "all_active";
}

function formatStateLabel(state) {
  const map = {
    due_today: "Due Today",
    overdue: "Overdue",
    upcoming: "Upcoming",
    no_show: "No-show",
    rescheduled: "Rescheduled",
    fulfilled: "Fulfilled",
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
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
