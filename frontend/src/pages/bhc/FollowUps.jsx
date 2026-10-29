import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  FixedTable,
  ModuleToolbar,
  SoftLoadingArea,
  TablePagination,
} from "../../components/common";
import {
  cancelFollowUp,
  getFollowUpTasks,
  getFollowUpTasksCalendar,
  rescheduleFollowUp,
} from "../../services/followUpTaskService";
import { formatDisplayValue } from "../../utils/formatters";
import { matchesServiceTypeFilter } from "../../utils/healthRecordPrograms";
import { createActiveFilterChips } from "../../utils/filterUtils";
import { queryKeys } from "../../utils/queryKeys";
import usePagedRows from "../../hooks/usePagedRows";
import { tableBodyHeight } from "../../utils/tablePaging";
import ActionMenu from "../../components/common/tables/ActionMenu";
import {
  StateBadge,
  buildRecordFollowUpVisitPath,
  formatDate,
  formatFollowUpId,
  formatTimeLabel,
  getCalendarEffectiveState,
  getEffectiveState,
  getTaskClassification,
  getTaskServiceTypeLabel,
  normalizeFilterState,
} from "../../components/features/followups/followUpStatusStyles.jsx";
import {
  buildTaskActions,
  getCompletedFollowUpRecordId,
  getTaskNavigationTarget,
} from "../../components/features/followups/followUpActions";
import {
  addDays,
  addMonths,
  addWeeks,
  formatMonthLabel,
  formatWeekRangeLabel,
  getMonthGridDays,
  getTasksForDay,
  getWeekDays,
  getWeekStart,
  groupTasksByDay,
  toDateInputValue,
} from "../../components/features/followups/followUpCalendarUtils.js";
import FollowUpWeekCalendar from "../../components/features/followups/FollowUpWeekCalendar";
import FollowUpDayView from "../../components/features/followups/FollowUpDayView";
import FollowUpMonthCalendar from "../../components/features/followups/FollowUpMonthCalendar";
import FollowUpActionModal from "../../components/features/followups/FollowUpActionModal";
import { errorStateVariant } from "../../utils/errorStateVariant";

const DEFAULT_FILTERS = {
  search: "",
  serviceType: "",
  state: "All Active",
};

const VIEW_MODES = ["list", "day", "week", "month"];

export default function FollowUps({ role = "bhc" }) {
  const navigate = useNavigate();
  const basePath = `/${role}`;
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
    queryKey: queryKeys.followUpTasks(role),
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
      const matchesServiceType = matchesServiceTypeFilter(
        filters.serviceType,
        task.healthRecord,
        getTaskServiceTypeLabel(task),
      );

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

  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  // Part A.4/B.3: the Calendar (week/day/month) needs the full history for
  // its visible range - including rows the List view excludes because a
  // reschedule superseded them - so it fetches from the dedicated
  // /follow-up-tasks/calendar endpoint rather than reusing the active-only
  // `tasks` list above. Range covers the full month grid (42 cells) for
  // month view so leading/trailing days from adjacent months load too.
  const calendarRange = useMemo(() => {
    if (viewMode === "day") {
      const day = toDateInputValue(currentDate);
      return { start: day, end: day };
    }
    if (viewMode === "month") {
      const gridDays = getMonthGridDays(currentDate);
      return {
        start: toDateInputValue(gridDays[0]),
        end: toDateInputValue(gridDays[gridDays.length - 1]),
      };
    }
    return {
      start: toDateInputValue(weekStart),
      end: toDateInputValue(weekDays[6]),
    };
  }, [viewMode, currentDate, weekStart, weekDays]);

  const { data: calendarTasksData = [] } = useQuery({
    queryKey: queryKeys.followUpTasksCalendar(
      role,
      calendarRange.start,
      calendarRange.end,
    ),
    queryFn: () => getFollowUpTasksCalendar(calendarRange),
    enabled: viewMode !== "list",
    staleTime: 30_000,
    retry: false,
  });

  const filteredCalendarTasks = useMemo(() => {
    const searchValue = filters.search.trim().toLowerCase();
    const tasksWithState = (
      Array.isArray(calendarTasksData) ? calendarTasksData : []
    ).map((task) => ({
      ...task,
      effectiveState: getCalendarEffectiveState(task),
    }));

    return tasksWithState.filter((task) => {
      // Unlike the List view, the Calendar's default ("All Active") must not
      // hide fulfilled/cancelled/superseded entries - Part A.4.4 requires
      // nothing to be hidden until the BHW explicitly narrows by status.
      const matchesFilter =
        filters.state === "All Active" ||
        task.effectiveState === normalizeFilterState(filters.state);
      const matchesServiceType = matchesServiceTypeFilter(
        filters.serviceType,
        task.healthRecord,
        getTaskServiceTypeLabel(task),
      );

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
  }, [calendarTasksData, filters]);

  const groupedByDay = useMemo(
    () => groupTasksByDay(filteredCalendarTasks),
    [filteredCalendarTasks],
  );
  const loading = isLoading && tasks.length === 0;
  const hasLoadError = Boolean(loadError) && !loading;
  const requestedTaskId = searchParams.get("task") || "";
  const requestedOpen = searchParams.get("open") || "";

  function cleanTaskQuery() {
    if (!requestedTaskId && !requestedOpen) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("task");
    nextParams.delete("open");
    setSearchParams(nextParams, { replace: true });
  }

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
      return;
    }
    // RHU still has Follow-up Details. BHC notifications and ?task= links
    // stay on this list instead of opening the retired details page.
    if (role === "rhu") {
      navigate(`${basePath}/follow-ups/${requestedTask.id}`, { replace: true });
      return;
    }
    cleanTaskQuery();
  }, [basePath, isLoading, navigate, requestedOpen, requestedTaskId, role, tasks]);

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
      queryKey: queryKeys.followUpTasks(role),
    });
    await queryClient.invalidateQueries({
      queryKey: ["follow-up-tasks-calendar", role],
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.healthRecords(role),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.dashboardSummary("bhc"),
    });
  }

  function closeModal() {
    setModal(null);
    cleanTaskQuery();
  }

  function recordFollowUpVisit(task) {
    navigate(buildRecordFollowUpVisitPath(task, basePath));
  }

  function openRescheduleModal(task) {
    setModal({ type: "reschedule", task });
  }

  function handleTaskClick(task) {
    const target = getTaskNavigationTarget(task, basePath);
    if (target) navigate(target);
  }

  function viewCompletedHealthRecord(task) {
    const recordId = getCompletedFollowUpRecordId(task);
    if (recordId) navigate(`${basePath}/health-records/${recordId}`);
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
      <DashboardLayout role={role} title="Follow-ups">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={errorStateVariant(loadError)}
        />
      </DashboardLayout>
    );
  }

  const headerLabel =
    viewMode === "day"
      ? currentDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : viewMode === "month"
        ? formatMonthLabel(currentDate)
        : formatWeekRangeLabel(weekStart, weekDays[6]);
  // One handler set for the List menu and every Calendar event, so all four
  // views drive the same record / reschedule / cancel flows.
  const taskHandlers = {
    onTaskClick: handleTaskClick,
    onRecordVisit: recordFollowUpVisit,
    onReschedule: openRescheduleModal,
    onCancel: openCancelModal,
    onViewRecord: viewCompletedHealthRecord,
    basePath,
  };

  return (
    <DashboardLayout role={role} title="Follow-ups">
      <FollowUpActionModal
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

      <SoftLoadingArea skeleton="follow-ups"
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
          <div className="anim-fade-up rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col gap-3 border-b border-[#F1F5F9] pb-4 lg:flex-row lg:items-center lg:justify-between">
              {viewMode === "list" ? (
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold text-[#0F172A]">
                    Scheduled Return Visits
                  </h2>
                  <p className="mt-0.5 text-[12px] text-[#64748B]">
                    Scheduled follow-up visits due for this patient list. Use
                    the menu to record or reschedule a visit.
                  </p>
                </div>
              ) : (
                <h2 className="text-[15px] font-bold text-[#0F172A]">
                  {headerLabel}
                </h2>
              )}

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

            <div className="pt-4">
              {viewMode === "list" && (
                <FollowUpList
                  tasks={filteredTasks}
                  resetKey={filters}
                  handlers={taskHandlers}
                  basePath={basePath}
                />
              )}
              {viewMode === "week" && (
                <FollowUpWeekCalendar
                  weekStart={weekStart}
                  groupedByDay={groupedByDay}
                  {...taskHandlers}
                />
              )}

              {viewMode === "day" && (
                <FollowUpDayView
                  date={currentDate}
                  tasksForDay={getTasksForDay(groupedByDay, currentDate)}
                  {...taskHandlers}
                />
              )}

              {viewMode === "month" && (
                <FollowUpMonthCalendar
                  monthDate={currentDate}
                  groupedByDay={groupedByDay}
                  onSelectDay={handleSelectDayFromMonth}
                  {...taskHandlers}
                />
              )}
            </div>
          </div>
        )}
      </SoftLoadingArea>
    </DashboardLayout>
  );
}

function FollowUpList({ tasks, resetKey, handlers, basePath = "/bhc" }) {
  const { page, setPage, totalPages, pageRows } = usePagedRows(tasks, resetKey);

  if (tasks.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 text-center text-sm text-slate-500"
        style={{ minHeight: tableBodyHeight() }}
      >
        No follow-ups match the current filters.
      </div>
    );
  }

  return (
    <div>
      <FixedTable minWidth="min-w-[820px]">
        <thead>
          <tr className="border-b border-[#F1F5F9] text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
            <th className="px-3 pb-3 font-bold">Follow-up ID</th>
            <th className="px-3 pb-3 font-bold">Patient</th>
            <th className="px-3 pb-3 font-bold">Program</th>
            <th className="px-3 pb-3 font-bold">Follow-up Date</th>
            <th className="px-3 pb-3 font-bold">Status</th>
            <th className="px-3 pb-3 font-bold">Recorded From</th>
            <th className="px-3 pb-3 text-right font-bold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1F5F9]">
          {pageRows.map((task) => {
            const patientName = formatDisplayValue(task.patientName, "Unnamed Patient");
            const timeLabel = formatTimeLabel(task.dueTime);
            const actions = buildTaskActions(task, {
              onRecordVisit: () => handlers.onRecordVisit(task),
              onReschedule: () => handlers.onReschedule(task),
              onCancel: () => handlers.onCancel(task),
              onViewRecord: () => handlers.onViewRecord(task),
              basePath,
            });

            return (
              <tr key={task.id} className="transition-colors hover:bg-[#F8FAFC]">
                <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[12px] font-semibold text-[#475569]">
                  {formatFollowUpId(task)}
                </td>
                <td className="px-3 py-3.5">
                  <p className="font-semibold text-[#0F172A]">{patientName}</p>
                  <p className="mt-0.5 text-[11.5px] text-[#94A3B8]">
                    Patient #{formatDisplayValue(task.patientId, "—")}
                  </p>
                </td>
                <td className="px-3 py-3.5 text-[#334155]">
                  {getTaskServiceTypeLabel(task)}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5">
                  <p className="text-[#334155]">{formatDate(task.dueDate)}</p>
                  {timeLabel && (
                    <p className="mt-0.5 text-[11.5px] text-[#94A3B8]">{timeLabel}</p>
                  )}
                </td>
                <td className="px-3 py-3.5">
                  <StateBadge state={task.effectiveState} />
                </td>
                <td className="whitespace-nowrap px-3 py-3.5">
                  {task.healthRecordId ? (
                    <Link
                      to={`${basePath}/health-records/${task.healthRecordId}`}
                      className="font-semibold text-[#B91C1C] hover:underline"
                    >
                      Record #{task.healthRecordId}
                    </Link>
                  ) : (
                    <span className="text-[#94A3B8]">—</span>
                  )}
                </td>
                <td className="px-3 py-3.5 text-right">
                  {actions.length > 0 ? (
                    <ActionMenu
                      title={patientName}
                      subtitle={formatFollowUpId(task)}
                      actions={actions}
                    />
                  ) : (
                    <span className="text-[#94A3B8]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </FixedTable>
      <TablePagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
