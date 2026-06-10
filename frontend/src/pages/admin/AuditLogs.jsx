import { useEffect, useMemo, useState } from "react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ListToolbar, TablePagination } from "../../components/common";
import { apiRequest, unwrapList } from "../../services/apiClient";

const DEFAULT_FILTERS = {
  search: "",
  module: "All Modules",
  role: "All Roles",
  type: "All Types",
};

const LOGS_PER_PAGE = 10;

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    perPage: LOGS_PER_PAGE,
    total: 0,
    lastPage: 1,
  });

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
    setLoadError("");

    apiRequest(`/audit-logs?${params.toString()}`)
      .then((response) => {
        if (!active) return;

        setLogs(
          unwrapList(response)
            .map((log) => {
              const role =
                log.user?.role === "bhw"
                  ? "BHC"
                  : log.user?.role === "rhu_staff"
                    ? "RHU"
                    : "Admin";

              return {
                id: `LOG-${String(log.id).padStart(3, "0")}`,
                sortDate: getDateValue(log.created_at),
                action: log.action || "System activity",
                module: log.module || "System",
                performedBy: log.user?.name || "System",
                role,
                details: log.description || "",
                dateTime: formatAuditDateTime(log.created_at),
                level: getLogType(log),
              };
            })
            .sort((a, b) => b.sortDate - a.sortDate),
        );
        setPagination({
          currentPage: response.current_page || currentPage,
          perPage: response.per_page || LOGS_PER_PAGE,
          total: response.total || 0,
          lastPage: response.last_page || 1,
        });
      })
      .catch(() => {
        if (!active) return;

        setLogs([]);
        setPagination({
          currentPage: 1,
          perPage: LOGS_PER_PAGE,
          total: 0,
          lastPage: 1,
        });
        setLoadError("Unable to load audit logs.");
      })
      .finally(() => {
        if (!active) return;

        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentPage, filters]);

  const dropdownFilters = useMemo(
    () => [
      {
        key: "module",
        label: "Module",
        value: filters.module,
        options: buildModuleOptions(logs, filters.module),
      },
      {
        key: "role",
        label: "Role",
        value: filters.role,
        options: ["All Roles", "Admin", "BHC", "RHU"],
      },
      {
        key: "type",
        label: "Log Type",
        value: filters.type,
        options: [
          "All Types",
          "Auth",
          "Account",
          "Referral",
          "Status Update",
          "Feedback",
          "Inventory",
          "Security",
          "System",
        ],
      },
    ],
    [filters.module, filters.role, filters.type, logs],
  );

  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
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

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  return (
    <DashboardLayout role="admin" title="Audit Logs">
      <div className="space-y-4">
        <ListToolbar
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
        />

        <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
          <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Activity Logs
              </h2>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Records of significant account, referral, and RHU feedback
                actions.
              </p>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead>
                <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  <th className="px-6 py-3">Log ID</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Performed By</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">Date / Time</th>
                  <th className="px-4 py-3">Type</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F3F4F6]">
                {isLoading ? (
                  <>
                    {Array.from({ length: LOGS_PER_PAGE }).map((_, index) => (
                      <tr key={`audit-log-skeleton-${index}`}>
                        <td className="px-6 py-4">
                          <div className="h-6 w-16 animate-pulse rounded-md bg-[#F1F5F9]" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-20 animate-pulse rounded bg-[#F1F5F9]" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-16 animate-pulse rounded bg-[#F1F5F9]" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-24 animate-pulse rounded bg-[#F1F5F9]" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-5 w-14 animate-pulse rounded-md bg-[#F1F5F9]" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-40 animate-pulse rounded bg-[#F1F5F9]" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-28 animate-pulse rounded bg-[#F1F5F9]" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-5 w-16 animate-pulse rounded-md bg-[#F1F5F9]" />
                        </td>
                      </tr>
                    ))}
                  </>
                ) : loadError ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-12 text-center text-sm text-[#B91C1C]"
                    >
                      {loadError}
                    </td>
                  </tr>
                ) : paginatedLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-12 text-center text-sm text-[#9CA3AF]"
                    >
                      No audit logs found.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-[#F9FAFB]"
                    >
                      <td className="whitespace-nowrap px-6 py-3.5">
                        <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0F172A]">
                          {log.id}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-sm font-semibold text-[#1A1A1A]">
                        {log.action}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                        {log.module}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                        {log.performedBy}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5">
                        <RoleBadge role={log.role} />
                      </td>

                      <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                        {log.details || "-"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#9CA3AF]">
                        {log.dateTime || "-"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5">
                        <TypeBadge type={log.level} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && !loadError && pagination.total > 0 && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function RoleBadge({ role }) {
  const map = {
    Admin: "bg-purple-50 text-purple-700",
    BHC: "bg-red-50 text-red-700",
    RHU: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[role] || "bg-slate-100 text-slate-600"
      }`}
    >
      {role}
    </span>
  );
}

function TypeBadge({ type }) {
  const map = {
    Account: "bg-purple-50 text-purple-700",
    Referral: "bg-red-50 text-red-700",
    "Status Update": "bg-amber-50 text-amber-700",
    Feedback: "bg-emerald-50 text-emerald-700",
    Inventory: "bg-orange-50 text-orange-700",
    Security: "bg-red-50 text-red-700",
    Auth: "bg-slate-100 text-slate-700",
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

function getLogType(log) {
  const module = String(log.module || "").toLowerCase();
  const action = String(log.action || "").toLowerCase();
  const description = String(log.description || "").toLowerCase();
  const text = `${module} ${action} ${description}`;

  if (text.includes("auth") || text.includes("login") || text.includes("logout")) {
    return "Auth";
  }

  if (text.includes("account") || text.includes("user")) {
    return "Account";
  }

  if (text.includes("referral")) {
    return "Referral";
  }

  if (text.includes("status")) {
    return "Status Update";
  }

  if (text.includes("feedback") || text.includes("return")) {
    return "Feedback";
  }

  if (text.includes("medicine") || text.includes("inventory")) {
    return "Inventory";
  }

  if (text.includes("security")) {
    return "Security";
  }

  return log.module || "System";
}

function getDateValue(value) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatAuditDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const dateText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  const timeText = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${dateText} \u2022 ${timeText}`;
}

function buildModuleOptions(logs, selectedModule) {
  const modules = logs.map((log) => log.module).filter(Boolean);
  if (selectedModule !== "All Modules") modules.push(selectedModule);

  return ["All Modules", ...sortUnique(modules)];
}

function sortUnique(values) {
  return Array.from(new Set(values)).sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}
