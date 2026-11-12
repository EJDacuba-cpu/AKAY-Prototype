import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  DataTableEmptyState,
  FixedTable,
  SoftLoadingArea,
  RefreshingIndicator,
  TablePagination,
} from "../../components/common";
import { Button } from "../../components/ui/button";
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
import ActionMenu from "../../components/common/tables/ActionMenu";
import {
  StateBadge,
  buildRecordFollowUpVisitPath,
  formatDate,
  formatFollowUpId,
  formatTimeLabel,
  getCalendarEffectiveState,
  getEffectiveState,
  getTaskServiceTypeLabel,
  normalizeFilterState,
} from "../../components/features/followups/followUpStatusStyles.jsx";
import { getFollowUpReasonDisplay } from "../../components/features/followups/followUpListDisplay.js";
import { matchesFollowUpSearch } from "../../components/features/followups/followUpSearch.js";
import {
  buildTaskActions,
  getCompletedFollowUpRecordId,
  getTaskNavigationTarget,
} from "../../components/features/followups/followUpActions";
import {
  addDays,
  addMonths,
  addWeeks,
  formatCalendarBoardHeading,
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
import FollowUpToolbar from "../../components/features/followups/FollowUpToolbar";
import "../../components/features/followups/followups.css";
import { errorStateVariant } from "../../utils/errorStateVariant";

const DEFAULT_FILTERS = {
  search: "",
  serviceType: "",
  state: "All Active",
};

const BOARD_MODES = ["list", "calendar"];
const DEFAULT_CALENDAR_SPAN = "week";
const CALENDAR_SPAN_LABELS = {
  day: "Day",
  week: "Week",
  month: "Month",
};

export default function FollowUps({ role = "bhc" }) {
  const navigate = useNavigate();
  const basePath = `/${role}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [boardMode, setBoardMode] = useState("list");
  const [calendarSpan, setCalendarSpan] = useState(DEFAULT_CALENDAR_SPAN);
  const viewMode = boardMode === "list" ? "list" : calendarSpan;
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [modal, setModal] = useState(null);
  const [routeNotice, setRouteNotice] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  const {
    data: tasksData,
    isPending: isLoading,
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

      return (
        matchesFilter &&
        matchesServiceType &&
        matchesFollowUpSearch(task, searchValue)
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

      return (
        matchesFilter &&
        matchesServiceType &&
        matchesFollowUpSearch(task, searchValue)
      );
    });
  }, [calendarTasksData, filters]);

  const groupedByDay = useMemo(
    () => groupTasksByDay(filteredCalendarTasks),
    [filteredCalendarTasks],
  );
  const loading = isLoading && tasks.length === 0;
  const hasLoadError = Boolean(loadError) && !loading && !Array.isArray(tasksData);
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
    // Notifications and ?task= links stay on this list; the dedicated
    // Follow-up Details page is retired for both BHC and RHU.
    cleanTaskQuery();
  }, [isLoading, requestedOpen, requestedTaskId, tasks]);

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
  const dataFilterChips = createActiveFilterChips(filters, dropdownFilters);
  const calendarSpanChip =
    boardMode === "calendar" && calendarSpan !== DEFAULT_CALENDAR_SPAN
      ? [
          {
            key: "calendarSpan",
            label: `Calendar: ${CALENDAR_SPAN_LABELS[calendarSpan] || calendarSpan}`,
          },
        ]
      : [];
  const activeFilters = [...calendarSpanChip, ...dataFilterChips];

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    if (boardMode === "calendar") {
      setCalendarSpan(DEFAULT_CALENDAR_SPAN);
    }
  }

  function removeFilter(key) {
    if (key === "calendarSpan") {
      setCalendarSpan(DEFAULT_CALENDAR_SPAN);
      return;
    }
    updateFilter(key, DEFAULT_FILTERS[key]);
  }

  function applyToolbarFilters(next) {
    const { calendarSpan: nextSpan, ...rest } = next;
    setFilters((previous) => ({ ...previous, ...rest }));
    if (boardMode === "calendar" && nextSpan) {
      setCalendarSpan(nextSpan);
    }
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
    setBoardMode("calendar");
    setCalendarSpan("day");
  }

  if (hasLoadError) {
    return (
      <DashboardLayout role={role} title="Follow-ups" contentClassName="followups-page">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={errorStateVariant(loadError)}
        />
      </DashboardLayout>
    );
  }

  const calendarHeading = formatCalendarBoardHeading(
    viewMode,
    currentDate,
    weekStart,
    weekDays[6],
  );
  const boardCount =
    viewMode === "list" ? filteredTasks.length : filteredCalendarTasks.length;
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
    <DashboardLayout role={role} title="Follow-ups" contentClassName="followups-page">
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

      {isFetching && !loading && <RefreshingIndicator label="Updating follow-ups..." />}
      {loadError && Array.isArray(tasksData) && <p role="status" className="mb-3 text-sm text-neutral-600">Unable to refresh follow-ups. Showing the last list that loaded.</p>}

      <SoftLoadingArea skeleton="follow-ups"
        skeletonOptions={{ role, view: viewMode }}
        isLoading={loading}
        message="Loading follow-ups..."
        scope="area"
      >
        {!loading && (
          <FollowUpToolbar
            filters={filters}
            config={dropdownFilters}
            activeFilters={activeFilters}
            calendar={boardMode === "calendar"}
            calendarSpan={calendarSpan}
            onSearch={(value) => updateFilter("search", value)}
            onApply={applyToolbarFilters}
            onRemove={removeFilter}
            onClear={clearFilters}
          />
        )}

        {!loading && (
          <div className="followup-board anim-fade-up rounded-xl border border-[#E5E7EB] bg-white shadow-sm shadow-black/[0.02]">
            <div className="followup-board-header">
              <div className="followup-board-heading min-w-0 flex-1">
                {viewMode === "list" ? (
                  <h2 className="truncate text-[15px] font-semibold text-[#0F172A]">
                    Scheduled Return Visits
                  </h2>
                ) : (
                  <h2 className="fu-cal-title min-w-0 text-[15px] font-semibold text-[#0F172A]">
                    <span className="fu-cal-primary block truncate">
                      {calendarHeading.primary}
                    </span>
                  </h2>
                )}
                <p
                  aria-live="polite"
                  className="followup-board-count mt-1 text-xs tabular-nums text-neutral-600"
                >
                  {boardCount} follow-up{boardCount === 1 ? "" : "s"}
                </p>
              </div>

              <div className="fu-header-controls flex shrink-0 flex-nowrap items-center gap-2">
                {viewMode !== "list" ? (
                  <div className="followup-date-navigation flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-white p-0.5">
                    <button
                      type="button"
                      onClick={goToPrevious}
                      aria-label="Previous"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={goToToday}
                      className="h-7 rounded-full px-2.5 text-[11px] font-semibold text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={goToNext}
                      aria-label="Next"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ) : null}

                <div
                  className="followup-view-switch flex items-center gap-0.5 rounded-full bg-neutral-100 p-1"
                  role="group"
                  aria-label="Follow-up view"
                >
                  {BOARD_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setBoardMode(mode)}
                      aria-pressed={boardMode === mode}
                      className={`h-8 rounded-full px-3 text-[12px] font-medium capitalize transition-colors ${
                        boardMode === mode
                          ? "bg-white text-ink-800 shadow-sm"
                          : "text-neutral-600 hover:text-ink-800"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="followup-board-body">
              {viewMode === "list" && (
                <FollowUpList
                  tasks={filteredTasks}
                  resetKey={filters}
                  handlers={taskHandlers}
                  basePath={basePath}
                  narrowed={
                    Boolean(filters.search.trim()) || activeFilters.length > 0
                  }
                  onClearFilters={clearFilters}
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

function FollowUpList({
  tasks,
  resetKey,
  handlers,
  basePath = "/bhc",
  narrowed = false,
  onClearFilters,
}) {
  const { page, setPage, totalPages, pageRows } = usePagedRows(tasks, resetKey);
  const empty = tasks.length === 0;

  const tableBody = (
    <>
      <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
        <tr>
          <th className="px-4">Patient</th>
          <th className="px-3">Follow-up Reason</th>
          <th className="px-3">Schedule</th>
          <th className="px-3">Status</th>
          <th className="px-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {!empty ? (
          pageRows.map((task) => {
            const patientName = formatDisplayValue(
              task.patientName,
              "Unnamed Patient",
            );
            const timeLabel = formatTimeLabel(task.dueTime);
            const followUpId = formatFollowUpId(task);
            const reason = getFollowUpReasonDisplay(task);
            const actions = buildTaskActions(task, {
              onRecordVisit: () => handlers.onRecordVisit(task),
              onReschedule: () => handlers.onReschedule(task),
              onCancel: () => handlers.onCancel(task),
              onViewRecord: () => handlers.onViewRecord(task),
              basePath,
            });

            return (
              <tr
                key={task.id}
                className="h-14 transition-colors hover:bg-neutral-50"
              >
                <td className="px-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {patientName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-600">
                      {followUpId}
                    </p>
                  </div>
                </td>
                <td className="px-3">
                  <div className="min-w-0">
                    {reason.condition ? (
                      <p className="truncate text-sm font-medium text-ink-800">
                        {reason.condition}
                      </p>
                    ) : null}
                    {reason.purpose ? (
                      <p className={`truncate text-sm ${reason.condition ? "mt-0.5 text-[11px] text-neutral-600" : "font-medium text-ink-800"}`}>
                        {reason.purpose}
                      </p>
                    ) : null}
                    {!reason.condition && !reason.purpose ? (
                      <p className="text-sm text-neutral-400">—</p>
                    ) : null}
                  </div>
                </td>
                <td className="px-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">
                      {formatDate(task.dueDate)}
                    </p>
                    {timeLabel ? (
                      <p className="mt-0.5 truncate text-[11px] text-neutral-600">
                        {timeLabel}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-3">
                  <StateBadge state={task.effectiveState} appearance="plain" />
                </td>
                <td className="px-2 text-right">
                  {actions.length > 0 ? (
                    <ActionMenu
                      title={patientName}
                      subtitle={followUpId}
                      actions={actions}
                    />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
              </tr>
            );
          })
        ) : (
          <DataTableEmptyState
            colSpan={5}
            title={narrowed ? "No follow-ups match" : "No follow-ups yet."}
            description={
              narrowed
                ? "Try a different search, or clear filters to see the full list again."
                : "Scheduled return visits will appear here."
            }
            action={
              narrowed ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onClearFilters}
                >
                  Clear search and filters
                </Button>
              ) : null
            }
          />
        )}
      </tbody>
    </>
  );

  return (
    <div className="followup-list-sheet">
      <FixedTable minWidth="min-w-[760px]">
        {tableBody}
      </FixedTable>
      {!empty ? (
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
