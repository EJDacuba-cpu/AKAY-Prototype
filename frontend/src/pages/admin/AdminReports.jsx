import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Printer } from "lucide-react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { PageStateWrapper, RefreshingIndicator } from "../../components/common";
import ConnectionErrorState from "../../components/common/ConnectionErrorState";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { getPasswordInviteSummary } from "../../services/accountInviteService";
import { loadAdminAccountAnalytics } from "../../services/adminReportsService";
import {
  DEFAULT_ACCOUNT_FILTERS,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  buildAdminAccountReport,
  parseAccountAnalytics,
} from "../../utils/adminAccountReporting";
import { errorStateVariant } from "../../utils/errorStateVariant";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const ANALYTICS_QUERY_KEY = ["admin-reports", "account-analytics"];
const SUMMARY_QUERY_KEY = ["admin-reports", "password-invite-summary"];

const ROLE_COLORS = {
  admin: "#7F1D1D",
  bhc: "#DC2626",
  rhu: "#FCA5A5",
};

const ACTIVE_COLOR = "#B91C1C";
const INACTIVE_COLOR = "#CBD5E1";

const filterSelectClass =
  "h-8 w-auto min-w-[9.25rem] rounded-full border-neutral-200 px-3 py-0 text-[12px] text-neutral-800 shadow-xs sm:text-[12px]";

const PRINT_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  @media print {
    body * { visibility: hidden !important; }
    #admin-account-report-print,
    #admin-account-report-print * { visibility: visible !important; }
    #admin-account-report-print {
      position: absolute;
      inset: 0;
      width: 100%;
      background: #ffffff !important;
      color: #0f172a !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #admin-account-report-print table { width: 100%; border-collapse: collapse; }
    #admin-account-report-print th,
    #admin-account-report-print td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      font-size: 10px;
      text-align: left;
    }
    #admin-account-report-print th {
      background: #f8fafc;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    #admin-account-report-print td.num,
    #admin-account-report-print th.num { text-align: right; }
    #admin-account-report-print tr,
    #admin-account-report-print section { break-inside: avoid; page-break-inside: avoid; }
    .no-print { display: none !important; }
  }
`;

const chartLegend = {
  position: "bottom",
  onClick: () => {},
  labels: {
    boxWidth: 10,
    boxHeight: 10,
    color: "#334155",
    font: { size: 11 },
    padding: 14,
    usePointStyle: true,
    pointStyle: "circle",
  },
};

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: chartLegend },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "#334155", font: { size: 11 } },
      border: { display: false },
    },
    y: {
      beginAtZero: true,
      ticks: { precision: 0, color: "#64748b", font: { size: 11 } },
      grid: { color: "rgba(226, 232, 240, 0.9)" },
      border: { display: false },
    },
  },
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  cutout: "64%",
  plugins: { legend: chartLegend },
};

function formatCount(value) {
  return Number(value).toLocaleString("en-US");
}

function sameFilters(left, right) {
  return left.role === right.role && left.status === right.status;
}

function filtersAreClear(filters) {
  return sameFilters(filters, DEFAULT_ACCOUNT_FILTERS);
}

function emptyMessage(report) {
  if (report.emptyKind === "no-matches") return "No accounts match the current filters.";
  if (report.emptyKind !== "no-accounts") return "";
  if (report.databaseTotal > 0 || report.otherAccounts > 0) {
    return `No recognized-role accounts are registered. Database total: ${formatCount(report.databaseTotal)}.`;
  }
  return "No recognized-role accounts are registered.";
}

function otherWarning(report) {
  const noun = report.otherAccounts === 1 ? "account is" : "accounts are";
  return `${formatCount(report.otherAccounts)} ${noun} outside recognized roles or statuses and excluded from the charts and summary table. Database total ${formatCount(report.databaseTotal)}. Recognized-role total ${formatCount(report.recognizedTotal)}.`;
}

function registeredLabel(report) {
  return filtersAreClear(report.filters) ? "Total registered" : "Filtered total";
}

function registeredHint(report) {
  if (filtersAreClear(report.filters)) return "Recognized roles";
  return `${report.filterLabel} · of ${formatCount(report.recognizedTotal)} recognized`;
}

function analyticsErrorMessage(error) {
  if (!error || errorStateVariant(error) !== "error" || !error.isAnalyticsInvalid) return undefined;
  return error.message;
}

function accessError(error) {
  if (!error) return undefined;
  if (error instanceof Error) return error;
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return new Error(error.message);
  return new Error("Access summary unavailable");
}

async function loadValidatedAnalytics() {
  const payload = await loadAdminAccountAnalytics();
  const parsed = parseAccountAnalytics(payload?.account_analytics);
  if (!parsed.ok) {
    const error = new Error(parsed.error || "Account analytics is missing or malformed.");
    error.isAnalyticsInvalid = true;
    throw error;
  }
  return parsed.analytics;
}

function openPrintDialog() {
  window.print();
}

function FilterControls({ draft, applied, onDraftChange, onApply, onClear }) {
  const dirty = !sameFilters(draft, applied);
  const canClear = !filtersAreClear(draft) || !filtersAreClear(applied);

  return (
    <form onSubmit={onApply} className="no-print flex flex-col gap-2 lg:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12px] font-medium text-neutral-600">
          Role
          <Select
            className={filterSelectClass}
            value={draft.role}
            onChange={(event) => onDraftChange({ ...draft, role: event.target.value })}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-[12px] font-medium text-neutral-600">
          Account Status
          <Select
            className={filterSelectClass}
            value={draft.status}
            onChange={(event) => onDraftChange({ ...draft, status: event.target.value })}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant={dirty ? "brand" : "secondary"} size="compact" disabled={!dirty}>
          Apply
        </Button>
        <Button type="button" variant="ghost" size="compact" onClick={onClear} disabled={!canClear}>
          Clear
        </Button>
        <span className="mx-1 hidden h-5 w-px bg-neutral-200 sm:block" aria-hidden="true" />
        <Button
          type="button"
          variant="secondary"
          size="compact"
          title="Opens the browser print dialog. Choose Save as PDF."
          aria-describedby="admin-account-pdf-hint"
          onClick={openPrintDialog}
        >
          <FileText size={14} />
          Export PDF
        </Button>
        <Button type="button" variant="brand" size="compact" onClick={openPrintDialog}>
          <Printer size={14} />
          Print
        </Button>
      </div>
      <p id="admin-account-pdf-hint" className="max-w-md text-[11px] leading-relaxed text-neutral-500 lg:text-right">
        Export PDF and Print open the browser print dialog. Choose Save as PDF there to download this snapshot.
      </p>
    </form>
  );
}

function EmptyNotice({ report }) {
  if (report.emptyKind === "none") return null;
  return (
    <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-[13px] text-neutral-600" role="status">
      {emptyMessage(report)}
    </p>
  );
}

function RolePanel({ report }) {
  const chartLabel = `${report.roleChartTitle}. ${report.roleDistribution
    .map((row) => `${row.label} ${formatCount(row.total)}`)
    .join(", ")}`;
  const data = {
    labels: report.roleDistribution.map((row) => row.label),
    datasets: [
      {
        data: report.roleDistribution.map((row) => row.total),
        backgroundColor: report.roleDistribution.map((row) => ROLE_COLORS[row.role] || ACTIVE_COLOR),
        borderColor: "#ffffff",
        borderWidth: 2,
      },
    ],
  };

  return (
    <section className="flex h-full flex-col rounded-card border border-neutral-200 bg-white p-4 shadow-card lg:col-span-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{report.filterLabel}</p>
      <h2 className="mt-1 text-sm font-semibold text-neutral-900">{report.roleChartTitle}</h2>
      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{registeredLabel(report)}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-neutral-900">
          {formatCount(report.filteredRegisteredTotal)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">{registeredHint(report)}</p>
        <p className="mt-3 text-[12px] leading-relaxed text-neutral-600">
          Database total{" "}
          <span className="font-semibold tabular-nums text-neutral-900">{formatCount(report.databaseTotal)}</span>
          <span className="px-1.5 text-neutral-300" aria-hidden="true">·</span>
          Recognized-role total{" "}
          <span className="font-semibold tabular-nums text-neutral-900">{formatCount(report.recognizedTotal)}</span>
        </p>
      </div>
      <div className="mt-4 flex-1">
        {report.emptyKind === "none" ? (
          <>
            <div className="relative h-52" role="img" aria-label={chartLabel}>
              <Doughnut data={data} options={doughnutOptions} />
            </div>
            <ul className="mt-2 divide-y divide-neutral-100">
              {report.roleDistribution.map((row) => (
                <li key={row.role} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-neutral-700">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: ROLE_COLORS[row.role] || ACTIVE_COLOR }}
                      aria-hidden="true"
                    />
                    {row.label}
                  </span>
                  <span className="font-semibold tabular-nums text-neutral-900">{formatCount(row.total)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyNotice report={report} />
        )}
      </div>
    </section>
  );
}

function StatusPanel({ report }) {
  const chartLabel = report.statusByRole
    .map((row) => `${row.label}: ${formatCount(row.active)} active, ${formatCount(row.inactive)} inactive`)
    .join(". ");
  const data = {
    labels: report.statusByRole.map((row) => row.label),
    datasets: [
      {
        label: "Active",
        data: report.statusByRole.map((row) => row.active),
        backgroundColor: ACTIVE_COLOR,
        borderRadius: 4,
        maxBarThickness: 28,
      },
      {
        label: "Inactive",
        data: report.statusByRole.map((row) => row.inactive),
        backgroundColor: INACTIVE_COLOR,
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  };

  return (
    <section className="rounded-card border border-neutral-200 bg-white p-4 shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{report.filterLabel}</p>
      <h2 className="mt-1 text-sm font-semibold text-neutral-900">Active and inactive by role</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <article className="rounded-lg border border-red-100 bg-red-50/70 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-800/80">Total Active</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{formatCount(report.statusTotals.active)}</p>
        </article>
        <article className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Total Inactive</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{formatCount(report.statusTotals.inactive)}</p>
        </article>
      </div>
      <div className="mt-4">
        {report.emptyKind === "none" ? (
          <div className="relative h-52" role="img" aria-label={`Active and inactive by role. ${chartLabel}`}>
            <Bar data={data} options={barOptions} />
          </div>
        ) : (
          <EmptyNotice report={report} />
        )}
      </div>
    </section>
  );
}

function AccessPanel({ access, pending, retrying, onRetry }) {
  return (
    <section className="rounded-card border border-neutral-200 bg-white p-4 shadow-card">
      <h2 className="text-sm font-semibold text-neutral-900">Pending access requests</h2>
      <p className="mt-1 text-[12px] text-neutral-500">
        {access?.available ? access.scopeLabel : "System-wide counts, separate from the role and status filters."}
      </p>
      {pending ? (
        <p className="py-8 text-center text-sm text-neutral-500" role="status">
          Loading pending access requests…
        </p>
      ) : access?.available ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-lg border border-neutral-200 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Pending Invitations</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{formatCount(access.pendingInvitations)}</p>
          </article>
          <article className="rounded-lg border border-neutral-200 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Pending Password Resets</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{formatCount(access.pendingPasswordResets)}</p>
          </article>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-neutral-900">Unavailable</p>
          <p className="mt-1 text-[13px] text-neutral-500">{access?.reason || "Access summary unavailable"}</p>
          <Button type="button" variant="secondary" size="compact" className="mt-3" onClick={onRetry} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}
    </section>
  );
}

function SummaryTable({ report }) {
  return (
    <section className="rounded-card border border-neutral-200 bg-white shadow-card">
      <div className="border-b border-neutral-200 px-4 py-4">
        <h2 className="text-sm font-semibold text-neutral-900">Account summary</h2>
        <p className="mt-1 text-[12px] text-neutral-500">{report.roleChartTitle} · {report.filterLabel}</p>
        {report.emptyKind !== "none" ? (
          <p className="mt-2 text-[13px] text-neutral-600" role="status">{emptyMessage(report)}</p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              <th className="px-4 py-2.5 font-bold">Role</th>
              <th className="px-4 py-2.5 text-right font-bold">Total</th>
              <th className="px-4 py-2.5 text-right font-bold">Active</th>
              <th className="px-4 py-2.5 text-right font-bold">Inactive</th>
            </tr>
          </thead>
          <tbody>
            {report.summaryRows.map((row) => (
              <tr key={row.role} className="border-b border-neutral-100">
                <td className="px-4 py-2.5 font-medium text-neutral-900">{row.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-900">{formatCount(row.total)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-900">{formatCount(row.active)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-900">{formatCount(row.inactive)}</td>
              </tr>
            ))}
            <tr className="bg-neutral-50">
              <td className="px-4 py-2.5 font-semibold text-neutral-900">Total</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-neutral-900">{formatCount(report.summaryTotals.total)}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-neutral-900">{formatCount(report.summaryTotals.active)}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-neutral-900">{formatCount(report.summaryTotals.inactive)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrintCountTable({ caption, headers, rows }) {
  return (
    <table className="mt-2 w-full text-left text-[12px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header.label} className={header.numeric ? "num" : undefined}>
              {header.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, index) => (
              <td key={`${row.key}-${headers[index].label}`} className={cell.numeric ? "num" : undefined}>
                {cell.value}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintArticle({ report, generatedLabel, summaryPending }) {
  const access = report.accessRequests;
  const numeric = (value) => ({ value: formatCount(value), numeric: true });

  return (
    <article id="admin-account-report-print" className="print-only">
      <h1 className="text-base font-bold text-neutral-900">Account & Role Analytics</h1>
      <p className="mt-1 text-[12px] text-neutral-600">System Administration · Current Account Snapshot</p>
      <p className="mt-1 text-[11px] text-neutral-500">Generated {generatedLabel}</p>
      <p className="mt-1 text-[12px] text-neutral-700">Filters: {report.filterLabel}</p>
      <p className="mt-1 text-[12px] text-neutral-700">{report.roleChartTitle}</p>
      {report.showOtherWarning ? <p className="mt-3 text-[12px] text-neutral-800">{otherWarning(report)}</p> : null}
      {report.emptyKind !== "none" ? <p className="mt-2 text-[12px] text-neutral-800">{emptyMessage(report)}</p> : null}
      <p className="mt-3 text-[11px] text-neutral-500">
        Tabular figures are the record for this PDF. Charts on screen use the same applied view.
      </p>

      <section className="mt-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-neutral-700">Totals</h2>
        <PrintCountTable
          caption="Database, recognized, and filtered totals"
          headers={[{ label: "Measure" }, { label: "Count", numeric: true }]}
          rows={[
            { key: "database", cells: [{ value: "Database total" }, numeric(report.databaseTotal)] },
            { key: "recognized", cells: [{ value: "Recognized-role total" }, numeric(report.recognizedTotal)] },
            { key: "filtered", cells: [{ value: "Filtered registered total" }, numeric(report.filteredRegisteredTotal)] },
            { key: "other", cells: [{ value: "Unclassified accounts excluded" }, numeric(report.otherAccounts)] },
          ]}
        />
      </section>

      <section className="mt-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-neutral-700">Role breakdown</h2>
        <PrintCountTable
          caption="Accounts by recognized role"
          headers={[{ label: "Role" }, { label: "Accounts", numeric: true }]}
          rows={report.roleDistribution.map((row) => ({
            key: row.role,
            cells: [{ value: row.label }, numeric(row.total)],
          }))}
        />
      </section>

      <section className="mt-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-neutral-700">Status by role</h2>
        <PrintCountTable
          caption="Active and inactive accounts by role"
          headers={[
            { label: "Role" },
            { label: "Active", numeric: true },
            { label: "Inactive", numeric: true },
          ]}
          rows={[
            ...report.statusByRole.map((row) => ({
              key: row.role,
              cells: [{ value: row.label }, numeric(row.active), numeric(row.inactive)],
            })),
            {
              key: "totals",
              cells: [
                { value: "Total" },
                numeric(report.statusTotals.active),
                numeric(report.statusTotals.inactive),
              ],
            },
          ]}
        />
      </section>

      <section className="mt-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-neutral-700">Summary</h2>
        <PrintCountTable
          caption="Role summary with totals"
          headers={[
            { label: "Role" },
            { label: "Total", numeric: true },
            { label: "Active", numeric: true },
            { label: "Inactive", numeric: true },
          ]}
          rows={[
            ...report.summaryRows.map((row) => ({
              key: row.role,
              cells: [{ value: row.label }, numeric(row.total), numeric(row.active), numeric(row.inactive)],
            })),
            {
              key: "totals",
              cells: [
                { value: "Total" },
                numeric(report.summaryTotals.total),
                numeric(report.summaryTotals.active),
                numeric(report.summaryTotals.inactive),
              ],
            },
          ]}
        />
      </section>

      <section className="mt-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-neutral-700">Pending access requests</h2>
        {summaryPending ? (
          <p className="mt-2 text-[12px] text-neutral-700">Pending access counts are still loading.</p>
        ) : access?.available ? (
          <>
            <p className="mt-2 text-[12px] text-neutral-700">{access.scopeLabel}</p>
            <PrintCountTable
              caption="System-wide pending access requests"
              headers={[{ label: "Request" }, { label: "Pending", numeric: true }]}
              rows={[
                { key: "invites", cells: [{ value: "Pending invitations" }, numeric(access.pendingInvitations)] },
                { key: "resets", cells: [{ value: "Pending password resets" }, numeric(access.pendingPasswordResets)] },
              ]}
            />
          </>
        ) : (
          <p className="mt-2 text-[12px] text-neutral-800">
            Unavailable. {access?.reason || "Access summary unavailable"}
          </p>
        )}
      </section>
    </article>
  );
}

export default function AdminReports() {
  const [draftFilters, setDraftFilters] = useState(() => ({ ...DEFAULT_ACCOUNT_FILTERS }));
  const [appliedFilters, setAppliedFilters] = useState(() => ({ ...DEFAULT_ACCOUNT_FILTERS }));

  const analyticsQuery = useQuery({
    queryKey: ANALYTICS_QUERY_KEY,
    queryFn: loadValidatedAnalytics,
    retry: false,
  });
  const summaryQuery = useQuery({
    queryKey: SUMMARY_QUERY_KEY,
    queryFn: getPasswordInviteSummary,
    retry: false,
  });

  const report = useMemo(() => {
    if (!analyticsQuery.data) return null;
    return buildAdminAccountReport({
      analytics: analyticsQuery.data,
      accessSummary: summaryQuery.isSuccess ? summaryQuery.data : undefined,
      accessSummaryError: summaryQuery.isError ? accessError(summaryQuery.error) : undefined,
      filters: appliedFilters,
    });
  }, [
    analyticsQuery.data,
    appliedFilters,
    summaryQuery.data,
    summaryQuery.error,
    summaryQuery.isError,
    summaryQuery.isSuccess,
  ]);

  const generatedLabel = useMemo(() => {
    if (!analyticsQuery.dataUpdatedAt) return "";
    return new Date(analyticsQuery.dataUpdatedAt).toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [analyticsQuery.dataUpdatedAt]);

  const refreshing =
    (analyticsQuery.isFetching && !analyticsQuery.isLoading) ||
    (summaryQuery.isFetching && !summaryQuery.isPending);
  const summaryPending = summaryQuery.isPending;

  function applyFilters(event) {
    event.preventDefault();
    if (sameFilters(draftFilters, appliedFilters)) return;
    setAppliedFilters({ role: draftFilters.role, status: draftFilters.status });
  }

  function clearFilters() {
    setDraftFilters({ ...DEFAULT_ACCOUNT_FILTERS });
    setAppliedFilters({ ...DEFAULT_ACCOUNT_FILTERS });
  }

  return (
    <DashboardLayout role="admin" title="Reports">
      <PageStateWrapper
        skeleton="reports"
        isLoading={analyticsQuery.isLoading}
        isError={analyticsQuery.isError}
        isFetching={analyticsQuery.isFetching}
        hasData={analyticsQuery.dataUpdatedAt > 0}
        error={analyticsQuery.error}
        errorMessage={analyticsErrorMessage(analyticsQuery.error)}
        onRetry={() => analyticsQuery.refetch()}
        loadingMessage="Loading account analytics…"
      >
        {report?.ok ? (
          <div className="flex flex-col gap-5">
            <style>{PRINT_CSS}</style>
            <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-[17px] font-bold tracking-tight text-ink-800">Account & Role Analytics</h1>
                <p className="mt-1 text-[13px] text-neutral-600">System Administration · Current Account Snapshot</p>
                <p className="mt-2 text-[12px] font-medium text-neutral-700">View · {report.filterLabel}</p>
              </div>
              <FilterControls
                draft={draftFilters}
                applied={appliedFilters}
                onDraftChange={setDraftFilters}
                onApply={applyFilters}
                onClear={clearFilters}
              />
            </header>

            {refreshing ? (
              <div className="no-print flex justify-end">
                <RefreshingIndicator label="Updating account snapshot…" />
              </div>
            ) : null}

            {analyticsQuery.isError && analyticsQuery.data ? (
              <div
                role="alert"
                className="no-print flex flex-wrap items-center justify-between gap-3 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900"
              >
                <p>Account analytics could not be refreshed. The figures below are the last snapshot.</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => analyticsQuery.refetch()}
                  disabled={analyticsQuery.isFetching}
                >
                  Retry
                </Button>
              </div>
            ) : null}

            {report.showOtherWarning ? (
              <div
                role="status"
                className="flex gap-3 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-950"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden="true" />
                <p>{otherWarning(report)}</p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <RolePanel report={report} />
              <div className="flex flex-col gap-4 lg:col-span-7">
                <StatusPanel report={report} />
                <AccessPanel
                  access={report.accessRequests}
                  pending={summaryPending}
                  retrying={summaryQuery.isFetching}
                  onRetry={() => summaryQuery.refetch()}
                />
              </div>
            </div>

            <SummaryTable report={report} />
            <PrintArticle report={report} generatedLabel={generatedLabel} summaryPending={summaryPending} />
          </div>
        ) : (
          <ConnectionErrorState
            fullPage
            variant="error"
            message={report?.error || "Account analytics could not be prepared."}
            onRetry={() => analyticsQuery.refetch()}
            retrying={analyticsQuery.isFetching}
          />
        )}
      </PageStateWrapper>
    </DashboardLayout>
  );
}
