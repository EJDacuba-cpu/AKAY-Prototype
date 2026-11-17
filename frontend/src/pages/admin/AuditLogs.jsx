import { useEffect, useMemo, useState } from "react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  FixedTable,
  ListToolbar,
  RefreshingIndicator,
  SoftLoadingArea,
  TablePagination,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import { apiRequest, unwrapList } from "../../services/apiClient";
import { auditRow } from "../../utils/auditLogs";
import { errorStateVariant } from "../../utils/errorStateVariant";

const DEFAULT_FILTERS = {
  search: "",
  module: "All Modules",
  role: "All Roles",
  type: "All Types",
};

const LOGS_PER_PAGE = 10;

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ modules: [], types: [], roles: ["Admin", "BHC", "RHU"] });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    perPage: LOGS_PER_PAGE,
    total: 0,
    lastPage: 1,
  });
  const [hasLoadedData, setHasLoadedData] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      page: String(currentPage),
      per_page: String(LOGS_PER_PAGE),
    });
    const search = filters.search.trim();

    if (search) params.set("search", search);
    if (filters.module !== "All Modules") params.set("module", filters.module);
    if (filters.role !== "All Roles") params.set("role", filters.role);
    if (filters.type !== "All Types") params.set("type", filters.type);

    setIsLoading(true);
    setLoadError(null);

    apiRequest(`/audit-logs?${params.toString()}`)
      .then((response) => {
        if (!active) return;

        setLogs(unwrapList(response).map(auditRow));
        if (response.filter_options) setFilterOptions(response.filter_options);
        setPagination({
          currentPage: response.current_page || currentPage,
          perPage: response.per_page || LOGS_PER_PAGE,
          total: response.total || 0,
          lastPage: response.last_page || 1,
        });
        setHasLoadedData(true);
      })
      .catch((error) => {
        if (!active) return;

        setLoadError(error);
      })
      .finally(() => {
        if (!active) return;

        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentPage, filters, reloadKey]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setReloadKey((key) => key + 1);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const dropdownFilters = useMemo(
    () => [
      {
        key: "module",
        label: "Module",
        value: filters.module,
        options: ["All Modules", ...filterOptions.modules],
      },
      {
        key: "role",
        label: "Role",
        value: filters.role,
        options: ["All Roles", ...filterOptions.roles],
      },
      {
        key: "type",
        label: "Log Type",
        value: filters.type,
        options: ["All Types", ...filterOptions.types],
      },
    ],
    [filters.module, filters.role, filters.type, filterOptions],
  );

  const activeFilters = [
    filters.module !== "All Modules" && {
      key: "module",
      label: filters.module,
    },
    filters.role !== "All Roles" && {
      key: "role",
      label: filters.role,
    },
    filters.type !== "All Types" && {
      key: "type",
      label: filters.type,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  const paginatedLogs = logs;
  const totalPages = Math.max(1, pagination.lastPage);
  const isInitialLoading = isLoading && !hasLoadedData;
  const isRefreshing = isLoading && hasLoadedData;

  useEffect(() => {
    if (!isLoading && !loadError && hasLoadedData && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, isLoading, loadError, hasLoadedData]);

  function changePage(nextPage) {
    if (isLoading || nextPage === pagination.currentPage) return;
    // A failed request keeps its target page; retrying that target needs a new request.
    if (nextPage === currentPage) setReloadKey((key) => key + 1);
    else setCurrentPage(nextPage);
  }

  function updateFilters(updater) {
    setCurrentPage(1);
    setFilters(updater);
  }

  function applyDropdownFilters(nextFilters) {
    updateFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    updateFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      module: "All Modules",
      role: "All Roles",
      type: "All Types",
    };

    updateFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  if (!isInitialLoading && loadError && !hasLoadedData) {
    return (
      <DashboardLayout role="admin" title="Audit Logs">
        <ConnectionErrorState
          fullPage
          variant={errorStateVariant(loadError)}
          onRetry={() => setReloadKey((key) => key + 1)}
          retrying={isLoading}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" title="Audit Logs">
      <div className="mx-auto w-full max-w-[1500px]">
        <SoftLoadingArea skeleton="audit"
          isLoading={isInitialLoading}
          message="Loading audit logs..."
          scope="page"
        >
          {!isInitialLoading && (
            <ListToolbar
              heading={
                <div className="min-w-0">
                  <h1 className="text-[17px] font-bold leading-[1.3] tracking-tight text-ink-800">Audit logs</h1>
                  <p className="mt-1 text-[13px] text-neutral-600">Review recorded system activity by action, user, and module.</p>
                </div>
              }
              searchValue={filters.search}
              onSearchChange={(value) => {
                updateFilters((prev) => ({ ...prev, search: value }));
              }}
              searchPlaceholder="Search action, user, module, role, or details..."
              filters={dropdownFilters}
              activeFilterCount={activeFilterCount}
              activeFilters={activeFilters}
              onApplyFilters={applyDropdownFilters}
              onClearFilters={clearFilters}
              onRemoveFilter={removeFilter}
              disabled={isInitialLoading}
            />
          )}

          {!isInitialLoading && hasLoadedData && (
          <div aria-busy={isRefreshing} className="flex flex-col overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
            <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  Activity Logs
                </h2>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Records of significant account, consultation, patient, referral, and inventory activities.
                </p>
              </div>
              {isRefreshing && <RefreshingIndicator label="Updating logs..." />}
            </div>

            {loadError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-6 py-3 text-[13px] text-alert-700">
                <p>Could not update logs. The last loaded results are still shown.</p>
                <Button type="button" variant="secondary" size="compact" onClick={() => setReloadKey((key) => key + 1)} disabled={isLoading}>Retry</Button>
              </div>
            )}

            <FixedTable minWidth="min-w-[1050px]">
                <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-6">Log ID</th>
                    <th className="px-4">Action</th>
                    <th className="px-4">Module</th>
                    <th className="px-4">Performed By</th>
                    <th className="px-4">Role</th>
                    <th className="px-4">Details</th>
                    <th className="px-4">Date / Time</th>
                    <th className="px-4">Type</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-100">
                  {paginatedLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-0 text-center text-sm text-neutral-500"
                      >
                        <div className="flex min-h-[var(--akay-empty-h,260px)] items-center justify-center">
                          No audit logs found.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="h-14 transition-colors hover:bg-neutral-50"
                      >
                        <td className="px-6">
                          <span className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-xs font-medium text-ink-800">
                            {log.id}
                          </span>
                        </td>

                        <td className="px-4 text-sm font-semibold text-ink-800" title={log.rawAction}>
                          {log.action}
                        </td>

                        <td className="px-4 text-sm text-neutral-600">
                          {log.module}
                        </td>

                        <td className="px-4 text-sm text-neutral-600">
                          {log.performedBy}
                        </td>

                        <td className="px-4">
                          <RoleBadge role={log.role} tier={log.tier} />
                        </td>

                        <td className="max-w-[240px] px-4 text-sm text-neutral-600" title={log.details || undefined}>
                          {log.details || "-"}
                        </td>

                        <td className="px-4 text-sm text-neutral-500">
                          {log.dateTime || "-"}
                        </td>

                        <td className="px-4">
                          <TypeBadge type={log.level} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
            </FixedTable>

              <TablePagination
                currentPage={pagination.currentPage}
                totalPages={totalPages}
                onPageChange={changePage}
                disabled={isLoading}
              />
          </div>
          )}
        </SoftLoadingArea>
      </div>
    </DashboardLayout>
  );
}

function RoleBadge({ role, tier }) {
  const map = {
    Admin: "bg-purple-50 text-purple-700",
    BHC: "bg-red-50 text-red-700",
    RHU: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[tier] || "bg-slate-100 text-slate-600"
      }`}
    >
      {role}
    </span>
  );
}

function TypeBadge({ type }) {
  const map = {
    "Account Management": "bg-purple-50 text-purple-700",
    Referrals: "bg-red-50 text-red-700",
    "Status Update": "bg-amber-50 text-amber-700",
    Feedback: "bg-emerald-50 text-emerald-700",
    "Medicine and Supply": "bg-orange-50 text-orange-700",
    Security: "bg-red-50 text-red-700",
    Authentication: "bg-slate-100 text-slate-700",
    Consultations: "bg-slate-100 text-slate-700",
    "Patient Management": "bg-slate-100 text-slate-700",
    System: "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[type] || "bg-slate-100 text-slate-600"
      }`}
    >
      {type}
    </span>
  );
}
