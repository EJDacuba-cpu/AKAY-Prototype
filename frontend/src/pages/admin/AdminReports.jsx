import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  HeartPulse,
  Download,
  FileCheck,
  Printer,
  RefreshCw,
  SearchCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Chart, Doughnut } from "react-chartjs-2";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ListToolbar } from "../../components/common";
import { refreshAdminAccounts } from "../../services/adminAccountsService";
import { getHealthRecords } from "../../services/healthRecordService";
import { refreshRhuMedicines } from "../../services/medicineService";
import { getPatients } from "../../services/patientService";
import { getReferrals } from "../../services/referrals";


ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
);

const DEFAULT_FILTERS = {
  search: "",
  barangay: "All Barangays",
  category: "All Categories",
  status: "All Status",
  date: "",
};

const BULAKAN_BARANGAYS = [
  "Bagumbayan",
  "Balubad",
  "Bambang",
  "Matungao",
  "Maysantol",
  "Perez",
  "Pitpitan",
  "San Francisco",
  "San Jose",
  "San Nicolas",
  "Santa Ana",
  "Santa Ines",
  "Taliptip",
  "Tibig",
];

const MAIN_RHU_NAME = "Rural Health Unit Bulakan";
const REPORT_SCOPE = "Municipal Health Office / Bulakan, Bulacan";

const EMPTY_REPORT_SOURCE = Object.freeze({
  referrals: [],
  patients: [],
  healthRecords: [],
  medicines: [],
  users: [],
  doctors: [],
});

const chartPalette = {
  red: "#B91C1C",
  redDark: "#7F1D1D",
  redSoft: "#FEE2E2",
  redMid: "#DC2626",
  slate: "#64748B",
  slateLight: "#CBD5E1",
  amber: "#F59E0B",
  emerald: "#10B981",
  blue: "#3B82F6",
  purple: "#8B5CF6",
  text: "#334155",
  muted: "#94A3B8",
  grid: "rgba(226, 232, 240, 0.85)",
};

const printStyles = `
  .print-only {
    display: none;
  }

  @media print {
    @page {
      size: A4;
      margin: 14mm;
    }

    body {
      background: #ffffff !important;
    }

    body * {
      visibility: hidden !important;
    }

    .mho-print-report,
    .mho-print-report * {
      visibility: visible !important;
    }

    .no-print {
      display: none !important;
    }

    .print-only {
      display: block !important;
    }

    .mho-print-report {
      position: absolute !important;
      inset: 0 auto auto 0 !important;
      width: 100% !important;
      color: #0f172a !important;
      background: #ffffff !important;
      font-family: Arial, sans-serif !important;
    }

    .mho-print-report table {
      width: 100%;
      border-collapse: collapse;
    }

    .mho-print-report th,
    .mho-print-report td {
      border: 1px solid #cbd5e1;
      padding: 7px 8px;
      font-size: 10px;
      text-align: left;
    }

    .mho-print-report th {
      background: #f1f5f9;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .mho-print-report tr,
    .mho-print-report section {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`;

export default function AdminReports() {
  const [dataVersion, setDataVersion] = useState(0);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [reportSource, setReportSource] = useState(EMPTY_REPORT_SOURCE);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    function refreshReports() {
      setDataVersion((current) => current + 1);
    }

    window.addEventListener("akay:referrals-updated", refreshReports);
    window.addEventListener("akay:rhu-referrals-updated", refreshReports);
    window.addEventListener("akay:patients-updated", refreshReports);
    window.addEventListener("akay:bhc-patients-updated", refreshReports);
    window.addEventListener("akay:rhu-patients-updated", refreshReports);
    window.addEventListener("akay:health-records-updated", refreshReports);
    window.addEventListener("akay:bhc-health-records-updated", refreshReports);
    window.addEventListener("akay:rhu-health-records-updated", refreshReports);
    window.addEventListener("akay_bhc_medicines_updated", refreshReports);
    window.addEventListener("akay_rhu_medicines_updated", refreshReports);
    window.addEventListener("akay:admin-accounts-updated", refreshReports);

    return () => {
      window.removeEventListener("akay:referrals-updated", refreshReports);
      window.removeEventListener("akay:rhu-referrals-updated", refreshReports);
      window.removeEventListener("akay:patients-updated", refreshReports);
      window.removeEventListener("akay:bhc-patients-updated", refreshReports);
      window.removeEventListener("akay:rhu-patients-updated", refreshReports);
      window.removeEventListener("akay:health-records-updated", refreshReports);
      window.removeEventListener(
        "akay:bhc-health-records-updated",
        refreshReports,
      );
      window.removeEventListener(
        "akay:rhu-health-records-updated",
        refreshReports,
      );
      window.removeEventListener("akay_bhc_medicines_updated", refreshReports);
      window.removeEventListener("akay_rhu_medicines_updated", refreshReports);
      window.removeEventListener("akay:admin-accounts-updated", refreshReports);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadReportSource() {
      try {
        setLoadError("");

        const [referrals, patients, healthRecords, medicines, users] =
          await Promise.all([
            getReferrals(),
            getPatients(),
            getHealthRecords("admin"),
            refreshRhuMedicines(),
            refreshAdminAccounts(),
          ]);

        if (!active) return;

        const safeUsers = Array.isArray(users) ? users : [];

        setReportSource({
          referrals: Array.isArray(referrals) ? referrals : [],
          patients: Array.isArray(patients) ? patients : [],
          healthRecords: Array.isArray(healthRecords) ? healthRecords : [],
          medicines: Array.isArray(medicines) ? medicines : [],
          users: safeUsers,
          doctors: safeUsers.filter((user) =>
            String(user.position || "").toLowerCase().includes("doctor"),
          ),
        });
      } catch (error) {
        if (!active) return;
        setLoadError(error?.message || "Unable to load report data.");
        setReportSource(EMPTY_REPORT_SOURCE);
      }
    }

    loadReportSource();

    return () => {
      active = false;
    };
  }, [dataVersion]);

  const dropdownOptions = useMemo(
    () => buildFilterOptions(reportSource),
    [reportSource],
  );

  const filteredSource = useMemo(
    () => filterReportSource(reportSource, filters),
    [reportSource, filters],
  );

  const reportSummary = useMemo(
    () => buildReportSummary(filteredSource),
    [filteredSource],
  );

  const {
    stats,
    monthlyTrend,
    barangayReferralActivity,
    barangayReports,
    categoryReports,
    categoryRanking,
    medicineAlerts,
    facilitySummary,
    rhuSummary,
  } = reportSummary;

  const dropdownFilters = [
    {
      key: "barangay",
      label: "Barangay / BHC",
      value: filters.barangay,
      options: dropdownOptions.barangays,
    },
    {
      key: "category",
      label: "Referral Category",
      value: filters.category,
      options: dropdownOptions.categories,
    },
    {
      key: "status",
      label: "Referral Status",
      value: filters.status,
      options: dropdownOptions.statuses,
    },
    {
      key: "date",
      label: "Report Date",
      value: filters.date,
      type: "date",
    },
  ];

  const activeFilters = [
    filters.barangay !== "All Barangays" && {
      key: "barangay",
      label: filters.barangay,
    },
    filters.category !== "All Categories" && {
      key: "category",
      label: filters.category,
    },
    filters.status !== "All Status" && {
      key: "status",
      label: filters.status,
    },
    filters.date && { key: "date", label: filters.date },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  function applyDropdownFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      barangay: "All Barangays",
      category: "All Categories",
      status: "All Status",
      date: "",
    };

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  function refreshReports() {
    setDataVersion((current) => current + 1);
  }

  function printAsPdf() {
    window.print();
  }

  function exportSummaryCsv() {
    exportMunicipalReportCsv({
      filters,
      stats,
      barangayReports,
      rhuSummary,
    });
  }

  return (
    <DashboardLayout role="admin" title="MHO Reports">
      <style>{printStyles}</style>

      <div className="no-print space-y-4">
        <MhoReportHeader />

        <ListToolbar
          searchValue={filters.search}
          onSearchChange={(value) =>
            setFilters((prev) => ({ ...prev, search: value }))
          }
          searchPlaceholder="Search barangay, BHC, RHU, tracking ID, status, or category..."
          filters={dropdownFilters}
          activeFilterCount={activeFilterCount}
          activeFilters={activeFilters}
          onApplyFilters={applyDropdownFilters}
          onClearFilters={clearFilters}
          onRemoveFilter={removeFilter}
          actions={
            <ReportActionButtons
              onRefresh={refreshReports}
              onExport={exportSummaryCsv}
              onPrint={printAsPdf}
            />
          }
        />

        {loadError && (
          <div className="rounded-lg border border-red-100 bg-red-50/70 px-4 py-3 text-sm font-semibold text-[#B91C1C]">
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title="Total Referrals"
            value={stats.totalReferrals}
            icon={<ClipboardList size={16} />}
            tone="red"
          />
          <StatCard
            title="Pending Referrals"
            value={stats.pendingReferrals}
            icon={<AlertTriangle size={16} />}
            tone="slate"
          />
          <StatCard
            title="Completed"
            value={stats.completedCases}
            icon={<SearchCheck size={16} />}
            tone="amber"
          />
          <StatCard
            title="No-Show Cases"
            value={stats.noShowCases}
            icon={<Users size={16} />}
            tone="emerald"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0 space-y-4">
            <ReportChartCard
              title="Referral Activity by 14 Barangays"
              description={`Municipal BHC-to-${MAIN_RHU_NAME} referral activity across all 14 barangays.`}
              icon={<Building2 size={15} />}
              rightLabel="14 barangays"
            >
              <FixedChartBox height="h-[360px]">
                {hasAnyValue(
                  barangayReferralActivity.flatMap((item) => [
                    item.referrals,
                    item.completed,
                    item.pending,
                  ]),
                ) ? (
                  <Bar
                    data={buildFourteenBarangayChartData(
                      barangayReferralActivity,
                    )}
                    options={fourteenBarangayChartOptions}
                  />
                ) : (
                  <EmptyChartState
                    icon={<Building2 size={24} />}
                    title="No barangay referral activity yet"
                    message="The 14 barangays will appear here once BHC referrals are encoded."
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>

            <ReportChartCard
              title="Municipal Referral Summary"
              description="Monthly municipal activity across referrals, patient registration, and health records."
              icon={<SearchCheck size={15} />}
              rightLabel="Monthly"
            >
              <FixedChartBox height="h-[300px]">
                {hasAnyValue(monthlyTrend.map((item) => item.value)) ? (
                  <Chart
                    type="line"
                    data={buildMonthlyLineData(monthlyTrend)}
                    options={monthlyLineOptions(monthlyTrend)}
                  />
                ) : (
                  <EmptyChartState
                    icon={<BarChart3 size={24} />}
                    title="No monthly trend yet"
                    message="Records with dates will be grouped here once available."
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>

            <ReportChartCard
              title="Barangay Referral Summary"
              description={`Horizontal comparison of referrals, completed cases, and pending referrals sent to ${MAIN_RHU_NAME}.`}
              icon={<Building2 size={15} />}
              rightLabel="Barangay"
            >
              <FixedChartBox height="h-[340px]">
                {barangayReports.length > 0 ? (
                  <Bar
                    data={buildBarangayChartData(barangayReports)}
                    options={barangayChartOptions}
                  />
                ) : (
                  <EmptyChartState
                    icon={<ClipboardList size={24} />}
                    title="No barangay referral activity yet"
                    message="Barangay referral records will appear here once BHCs encode referrals."
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>

            <BarangayReferralTable barangayReports={barangayReports} />
          </main>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <ReportChartCard
              title="Municipal Service Coverage"
              description="Doughnut chart summarizing BHC, RHU, referral, and account report coverage."
              icon={<Building2 size={15} />}
              rightLabel="MHO view"
            >
              <FixedChartBox height="h-[280px]">
                {hasAnyValue(facilitySummary.map((item) => item.value)) ? (
                  <Doughnut
                    data={buildCoverageChartData(facilitySummary)}
                    options={coverageChartOptions}
                  />
                ) : (
                  <EmptyChartState
                    icon={<Building2 size={24} />}
                    title="No municipal coverage data"
                    message="Barangay and RHU report coverage will be summarized here."
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>

            <RhuReceivingSummaryCard summary={rhuSummary} />

            <CategoryRankingCard
              categories={categoryRanking}
              total={stats.totalReferrals}
            />

            <SystemResourceCard
              medicineAlerts={medicineAlerts}
              availableDoctors={stats.availableDoctors}
              totalDoctors={stats.totalDoctors}
              activeUsers={stats.activeUsers}
              totalUsers={stats.totalUsers}
            />

            <ReportScopeCard
              filters={filters}
              stats={stats}
              barangayCount={barangayReports.length}
              categoryCount={categoryReports.length}
            />
          </aside>
        </div>
      </div>

      <PrintableMhoReport
        filters={filters}
        stats={stats}
        barangayReports={barangayReports}
        rhuSummary={rhuSummary}
      />
    </DashboardLayout>
  );
}

function MhoReportHeader() {
  return (
    <section className="overflow-hidden ">
      <div className=" px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#B91C1C]">
              Municipal Health Officer Report
            </p>
            <h1 className="mt-1 text-xl font-black tracking-tight text-[#0F172A] sm:text-2xl">
              Municipal Referral Report
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#64748B]">
              MHO monitoring for all 14 barangays and BHCs, with receiving and
              processing visibility for {MAIN_RHU_NAME}.
            </p>
          </div>
   
        </div>
      </div>
    </section>
  );
}



function ReportActionButtons({ onRefresh, onExport, onPrint }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] active:bg-[#7F1D1D]"
      >
        <RefreshCw size={12} />
        Refresh
      </button>
      <button
        type="button"
        onClick={onExport}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[11px] font-semibold text-[#374151] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
      >
        <Download size={12} className="text-red-600" />
        Export CSV
      </button>
      <button
        type="button"
        onClick={onPrint}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[11px] font-semibold text-[#374151] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
      >
        <Printer size={12} />
        Print Report
      </button>
    </div>
  );
}

function StatCard({ title, value, icon, tone = "red" }) {
  const map = {
    red: "border-t-[#B91C1C] bg-[#FEF2F2] text-[#B91C1C]",
    slate: "border-t-slate-300 bg-slate-50 text-slate-700",
    amber: "border-t-amber-400 bg-amber-50 text-amber-700",
    emerald: "border-t-emerald-400 bg-emerald-50 text-emerald-700",
  };

  const selected = map[tone] || map.red;
  const [borderClass, bgClass, textClass] = selected.split(" ");

  return (
    <div
      className={`rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 shadow-sm ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bgClass} ${textClass}`}
        >
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0F172A]">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function ReportChartCard({ title, description, icon, rightLabel, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-red-100 hover:shadow-md">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8ECF0] bg-white px-5 py-4">
        <div className="flex min-w-0 items-start gap-2">
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-black text-[#0F172A]">
              {title}
            </h2>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#64748B]">
              {description}
            </p>
          </div>
        </div>

        {rightLabel && (
          <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            {rightLabel}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FixedChartBox({ height = "h-[300px]", children }) {
  return (
    <div
      className={`relative ${height} w-full overflow-hidden rounded-xl border border-[#F1F5F9] bg-white p-3`}
    >
      {children}
    </div>
  );
}

function EmptyChartState({ icon, title, message }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#F1F5F9] text-[#94A3B8]">
        {icon}
      </div>
      <p className="text-sm font-bold text-[#334155]">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#94A3B8]">
        {message}
      </p>
    </div>
  );
}

function CategoryRankingCard({ categories, total }) {
  const topCategory = categories[0];

  return (
    <section className="rounded-xl border border-[#E8ECF0] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-[#0F172A]">
            Referral Category Ranking
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
            Ranked BHC to RHU referral categories from the current filters.
          </p>
        </div>
        <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          {formatNumber(total)} total
        </span>
      </div>

      {topCategory ? (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50/70 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Most Common Category
          </p>
          <p className="mt-2 text-base font-bold text-[#B91C1C]">
            {topCategory.category}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            {formatNumber(topCategory.count)} referral
            {topCategory.count === 1 ? "" : "s"} in the current report
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-4 py-7 text-center text-xs font-medium text-[#94A3B8]">
          No category records to rank yet.
        </div>
      )}

      <div className="space-y-2.5">
        {categories.slice(0, 7).map((item, index) => (
          <div
            key={item.category}
            className="rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#B91C1C] shadow-sm">
                  {index + 1}
                </span>
                <p className="truncate text-xs font-semibold text-[#334155]">
                  {item.category}
                </p>
              </div>
              <span className="text-xs font-bold tabular-nums text-[#B91C1C]">
                {item.count}
              </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
              <div
                className="h-full rounded-full bg-[#B91C1C] transition-all duration-700"
                style={{ width: `${item.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SystemResourceCard({
  medicineAlerts,
  availableDoctors,
  totalDoctors,
  activeUsers,
  totalUsers,
}) {
  return (
    <section className="rounded-xl border border-[#E8ECF0] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-[#0F172A]">
            RHU Resources and Users
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
            RHU workforce and medicine readiness for MHO monitoring.
          </p>
        </div>
        <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          Admin view
        </span>
      </div>

      <div className="space-y-2.5">
        <ResourceRow
          icon={<Stethoscope size={13} />}
          label="Available Doctors"
          value={`${formatNumber(availableDoctors)} / ${formatNumber(totalDoctors)}`}
        />
        <ResourceRow
          icon={<Users size={13} />}
          label="Active Users"
          value={`${formatNumber(activeUsers)} / ${formatNumber(totalUsers)}`}
        />
        <ResourceRow
          icon={<AlertTriangle size={13} />}
          label="Medicine Alerts"
          value={formatNumber(medicineAlerts.length)}
        />
      </div>

      <div className="mt-4 space-y-2">
        {medicineAlerts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#E8ECF0] bg-[#F8FAFC] px-4 py-5 text-center text-xs text-[#94A3B8]">
            No low-stock or unavailable medicine alerts.
          </div>
        ) : (
          medicineAlerts
            .slice(0, 4)
            .map((item) => (
              <MedicineAlert key={item.id || item.name} item={item} />
            ))
        )}
      </div>
    </section>
  );
}

function ResourceRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-[11px] text-[#64748B]">
        <span className="text-[#B91C1C]">{icon}</span>
        {label}
      </span>
      <span className="shrink-0 font-semibold text-[#0F172A]">{value}</span>
    </div>
  );
}

function MedicineAlert({ item }) {
  const color =
    String(item.status || "")
      .toLowerCase()
      .includes("unavailable") ||
    String(item.status || "")
      .toLowerCase()
      .includes("expired")
      ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
      : "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]";

  return (
    <div className="rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[#0F172A]">
            {item.name}
          </p>
          <p className="mt-1 truncate text-[11px] text-[#9CA3AF]">
            {item.quantityLabel}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${color}`}
        >
          {item.status}
        </span>
      </div>
    </div>
  );
}

function RhuReceivingSummaryCard({ summary }) {
  return (
    <section className="rounded-xl border border-[#E8ECF0] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-[#0F172A]">
            RHU Receiving Summary
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
            {summary.name} receiving and processing status.
          </p>
        </div>
        <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          Main RHU
        </span>
      </div>

      <div className="space-y-2.5">
        <ResourceRow
          icon={<ClipboardList size={13} />}
          label="Incoming Referrals"
          value={formatNumber(summary.incomingReferrals)}
        />
        <ResourceRow
          icon={<SearchCheck size={13} />}
          label="Received Cases"
          value={formatNumber(summary.receivedCases)}
        />
        <ResourceRow
          icon={<HeartPulse size={13} />}
          label="Completed"
          value={formatNumber(summary.completedCases)}
        />
        <ResourceRow
          icon={<FileCheck size={13} />}
          label="Feedback Submitted"
          value={formatNumber(summary.feedbackSubmitted)}
        />
        <ResourceRow
          icon={<AlertTriangle size={13} />}
          label="No-Show Cases"
          value={formatNumber(summary.noShowCases)}
        />
      </div>

      {summary.incomingReferrals === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-[#E8ECF0] bg-[#F8FAFC] px-4 py-5 text-center text-xs text-[#94A3B8]">
          No RHU processing data available yet.
        </div>
      )}
    </section>
  );
}

function ReportScopeCard({ filters, stats, barangayCount, categoryCount }) {
  return (
    <section className="rounded-xl border border-[#E8ECF0] bg-white p-4 shadow-sm">
      <h2 className="text-sm font-black text-[#0F172A]">MHO Report Scope</h2>
      <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
        Current municipal report output after applying filters.
      </p>

      <div className="mt-4 space-y-2 text-[11px] text-[#64748B]">
        <ScopeRow label="Report scope" value={REPORT_SCOPE} />
        <ScopeRow label="Barangays / BHCs" value="14" />
        <ScopeRow label="Receiving RHU" value={MAIN_RHU_NAME} />
        <ScopeRow
          label="Summary records"
          value={formatNumber(stats.totalRecords)}
        />
        <ScopeRow
          label="Barangays with referrals"
          value={formatNumber(barangayCount)}
        />
        <ScopeRow label="Categories" value={formatNumber(categoryCount)} />
        <ScopeRow label="Barangay filter" value={filters.barangay} />
        <ScopeRow label="Category filter" value={filters.category} />
        <ScopeRow label="Status filter" value={filters.status} />
        <ScopeRow label="Date filter" value={filters.date || "Any date"} />
      </div>
    </section>
  );
}

function ScopeRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] px-3 py-2">
      <span>{label}</span>
      <span className="max-w-[170px] truncate text-right font-semibold text-[#0F172A]">
        {value}
      </span>
    </div>
  );
}

function BarangayReferralTable({ barangayReports }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white shadow-sm">
      <div className="border-b border-[#E8ECF0] bg-[#FFF7F7] px-5 py-4">
        <h2 className="text-sm font-black text-[#0F172A]">
          Barangay Referral Summary
        </h2>
        <p className="mt-1 text-xs text-[#64748B]">
          Table view of BHC to RHU referral activity based on the current
          filters.
        </p>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              <th className="px-5 py-3">Barangay / BHC</th>
              <th className="px-4 py-3">Total Referrals</th>
              <th className="px-4 py-3">Pending</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">No-Show</th>
              <th className="px-4 py-3">Last Activity</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3F4F6]">
            {barangayReports.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-sm text-[#94A3B8]"
                >
                  No barangay referral activity yet.
                </td>
              </tr>
            ) : (
              barangayReports.map((item) => (
                <tr key={item.barangay} className="hover:bg-[#F9FAFB]">
                  <td className="px-5 py-3.5 text-sm font-semibold text-[#1A1A1A]">
                    {item.barangay}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {item.referrals}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {item.pending}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {item.received}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {item.completed}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {item.noShow}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {formatDisplayDate(item.lastActivity)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrintableMhoReport({ filters, stats, barangayReports, rhuSummary }) {
  return (
    <article className="mho-print-report print-only">
      <header className="mb-6 border-b-2 border-slate-900 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em]">
          AKAY Community EHR System
        </p>
        <h1 className="mt-1 text-2xl font-black">Municipal Referral Report</h1>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
          <PrintMeta label="Report scope" value={REPORT_SCOPE} />
          <PrintMeta label="Generated" value={formatDateTime(new Date())} />
          <PrintMeta label="MHO role" value="Admin / Municipal Health Officer" />
          <PrintMeta label="Receiving RHU" value={MAIN_RHU_NAME} />
          <PrintMeta label="Barangay filter" value={filters.barangay} />
          <PrintMeta label="Referral status" value={filters.status} />
          <PrintMeta label="Category" value={filters.category} />
          <PrintMeta label="Date range" value={filters.date || "Any date"} />
        </div>
      </header>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-black uppercase tracking-wide">
          Summary Metrics
        </h2>
        <div className="grid grid-cols-4 gap-2">
          <PrintMetric label="Total Referrals" value={stats.totalReferrals} />
          <PrintMetric label="Pending Referrals" value={stats.pendingReferrals} />
          <PrintMetric label="Completed" value={stats.completedCases} />
          <PrintMetric label="No-Show Cases" value={stats.noShowCases} />
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-black uppercase tracking-wide">
          Barangay Referral Summary
        </h2>
        <table>
          <thead>
            <tr>
              <th>Barangay / BHC</th>
              <th>Total Referrals</th>
              <th>Pending</th>
              <th>Received</th>
              <th>Completed</th>
              <th>No-Show</th>
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {barangayReports.map((item) => (
              <tr key={item.barangay}>
                <td>{item.barangay}</td>
                <td>{formatNumber(item.referrals)}</td>
                <td>{formatNumber(item.pending)}</td>
                <td>{formatNumber(item.received)}</td>
                <td>{formatNumber(item.completed)}</td>
                <td>{formatNumber(item.noShow)}</td>
                <td>{formatDisplayDate(item.lastActivity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black uppercase tracking-wide">
          RHU Receiving and Processing Summary
        </h2>
        <table>
          <thead>
            <tr>
              <th>RHU Name</th>
              <th>Incoming Referrals</th>
              <th>Received</th>
              <th>Completed</th>
              <th>Feedback Submitted</th>
              <th>No-Show</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{rhuSummary.name}</td>
              <td>{formatNumber(rhuSummary.incomingReferrals)}</td>
              <td>{formatNumber(rhuSummary.receivedCases)}</td>
              <td>{formatNumber(rhuSummary.completedCases)}</td>
              <td>{formatNumber(rhuSummary.feedbackSubmitted)}</td>
              <td>{formatNumber(rhuSummary.noShowCases)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </article>
  );
}

function PrintMeta({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="min-w-[92px] font-bold">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function PrintMetric({ label, value }) {
  return (
    <div className="border border-slate-300 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
        {label}
      </p>
      <p className="mt-2 text-xl font-black">{formatNumber(value)}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   REPORT DATA BUILDING
───────────────────────────────────────────── */
function buildFilterOptions(source) {
  const barangays = [
    ...source.referrals.map(getReferralBarangay),
    ...source.patients.map(getPatientBarangay),
    ...source.healthRecords.map(getPatientBarangay),
  ].filter(Boolean);

  const categories = [
    ...source.referrals.map(getReferralCategory),
    ...source.patients.map(getRecordCategory),
    ...source.healthRecords.map(getRecordCategory),
  ].filter(Boolean);

  const statuses = [
    ...source.referrals.map(getRecordStatus),
    ...source.healthRecords.map(getRecordStatus),
    ...source.patients.map(getRecordStatus),
  ].filter(Boolean);

  return {
    barangays: [
      "All Barangays",
      ...sortUnique([...BULAKAN_BARANGAYS, ...barangays]),
    ],
    categories: ["All Categories", ...sortUnique(categories)],
    statuses: [
      "All Status",
      ...sortUnique([
        ...statuses,
        "Pending",
        "Received",
        "Routine Monitoring",
        "Follow-up Required",
        "Complete",
        "Completed",
        "No-Show",
        "Active",
        "Inactive",
      ]),
    ],
  };
}

function filterReportSource(source, filters) {
  return {
    referrals: source.referrals.filter((item) =>
      matchesReportFilters(item, filters, "referral"),
    ),
    patients: source.patients.filter((item) =>
      matchesReportFilters(item, filters, "patient"),
    ),
    healthRecords: source.healthRecords.filter((item) =>
      matchesReportFilters(item, filters, "record"),
    ),
    medicines: source.medicines.filter((item) =>
      matchesReportFilters(item, filters, "medicine"),
    ),
    users: source.users.filter((item) =>
      matchesReportFilters(item, filters, "user"),
    ),
    doctors: source.doctors.filter((item) =>
      matchesReportFilters(item, filters, "doctor"),
    ),
  };
}

function matchesReportFilters(item, filters, type) {
  const query = filters.search.trim().toLowerCase();
  const barangay =
    type === "referral" ? getReferralBarangay(item) : getPatientBarangay(item);
  const category =
    type === "referral" ? getReferralCategory(item) : getRecordCategory(item);
  const status = getRecordStatus(item);
  const date = getRecordDate(item);

  const searchText = [
    item.id,
    item._id,
    item.trackingId,
    item.tracking_id,
    item.referralId,
    item.patientId,
    getPatientName(item),
    getChiefComplaint(item),
    getMedicineName(item),
    getDoctorName(item),
    item.email,
    item.role,
    barangay,
    category,
    status,
    date,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matchesSearch = !query || searchText.includes(query);
  const matchesBarangay =
    filters.barangay === "All Barangays" || barangay === filters.barangay;
  const matchesCategory =
    filters.category === "All Categories" || category === filters.category;
  const matchesStatus =
    filters.status === "All Status" || status === filters.status;
  const matchesDate = !filters.date || date === filters.date;

  return (
    matchesSearch &&
    matchesBarangay &&
    matchesCategory &&
    matchesStatus &&
    matchesDate
  );
}

function buildReportSummary(source) {
  const referrals = source.referrals;
  const patients = source.patients;
  const healthRecords = source.healthRecords;
  const medicines = source.medicines;
  const users = source.users;
  const doctors = source.doctors;

  const bhcPatients = patients.filter((item) => getSourceRole(item) === "BHC");
  const rhuPatients = patients.filter((item) => getSourceRole(item) === "RHU");
  const bhcHealthRecords = healthRecords.filter(
    (item) => getSourceRole(item) === "BHC",
  );
  const rhuHealthRecords = healthRecords.filter(
    (item) => getSourceRole(item) === "RHU",
  );

  const monitoring =
    referrals.filter((item) => isMonitoringStatus(getRecordStatus(item)))
      .length +
    healthRecords.filter((item) => isMonitoringStatus(getRecordStatus(item)))
      .length;

  const completed =
    referrals.filter((item) => isCompleteStatus(getRecordStatus(item))).length +
    healthRecords.filter((item) => isCompleteStatus(getRecordStatus(item)))
      .length;

  const pendingReferrals = referrals.filter((item) =>
    isPendingStatus(getRecordStatus(item)),
  ).length;
  const receivedReferrals = referrals.filter((item) =>
    isReceivedStatus(getRecordStatus(item)),
  ).length;
  const completedCases = referrals.filter((item) =>
    isCompleteStatus(getRecordStatus(item)),
  ).length;
  const noShowCases = referrals.filter((item) =>
    isNoShowStatus(getRecordStatus(item)),
  ).length;
  const feedbackSubmitted = referrals.filter(hasFeedbackSubmitted).length;

  const medicineAlerts = medicines
    .map(normalizeMedicineAlert)
    .filter(Boolean)
    .sort(
      (a, b) =>
        getMedicineAlertWeight(b.status) - getMedicineAlertWeight(a.status),
    );

  const activeUsers = users.filter((item) =>
    isActiveStatus(getRecordStatus(item)),
  ).length;
  const availableDoctors = doctors.filter(
    (item) => getRecordStatus(item) === "Available",
  ).length;

  const stats = {
    totalRecords:
      referrals.length +
      patients.length +
      healthRecords.length +
      medicines.length +
      users.length +
      doctors.length,
    totalReferrals: referrals.length,
    totalPatients: patients.length,
    totalHealthRecords: healthRecords.length,
    monitoring,
    completed,
    pendingReferrals,
    receivedReferrals,
    completedCases,
    noShowCases,
    feedbackSubmitted,
    medicineAlerts: medicineAlerts.length,
    activeUsers,
    totalUsers: users.length,
    availableDoctors,
    totalDoctors: doctors.length,
  };

  const facilitySummary = [
    {
      label: "BHC Activity",
      value: bhcPatients.length + bhcHealthRecords.length,
    },
    {
      label: "RHU Processing",
      value: rhuPatients.length + rhuHealthRecords.length + medicines.length,
    },
    {
      label: "Referral Activity",
      value: referrals.length,
    },
    {
      label: "Workforce Resources",
      value: users.length + doctors.length,
    },
  ];

  const barangayReferralActivity = buildBarangayReferralActivity(referrals);
  const barangayReports = buildBarangayReports(referrals);
  const categoryReports = buildCategoryReports(referrals);
  const categoryRanking = buildCategoryRanking(
    categoryReports,
    referrals.length,
  );
  const monthlyTrend = buildMonthlyTrend(referrals, patients, healthRecords);
  const rhuSummary = buildRhuSummary(referrals);

  return {
    stats,
    monthlyTrend,
    barangayReferralActivity,
    barangayReports,
    categoryReports,
    categoryRanking,
    medicineAlerts,
    facilitySummary,
    rhuSummary,
  };
}

function buildBarangayReferralActivity(referrals) {
  const groups = new Map(
    BULAKAN_BARANGAYS.map((barangay) => [
      barangay.toLowerCase(),
      { barangay, referrals: 0, completed: 0, pending: 0 },
    ]),
  );

  referrals.forEach((referral) => {
    const matchedBarangay = findBulakanBarangay(getReferralBarangay(referral));
    if (!matchedBarangay) return;

    const current = groups.get(matchedBarangay.toLowerCase());
    const status = getRecordStatus(referral);

    current.referrals += 1;
    if (isCompleteStatus(status)) current.completed += 1;
    if (isPendingStatus(status)) current.pending += 1;
  });

  return BULAKAN_BARANGAYS.map((barangay) =>
    groups.get(barangay.toLowerCase()),
  );
}

function buildBarangayReports(referrals) {
  const groups = new Map(
    BULAKAN_BARANGAYS.map((barangay) => [
      barangay.toLowerCase(),
      {
        barangay,
        referrals: 0,
        pending: 0,
        received: 0,
        completed: 0,
        noShow: 0,
        lastActivity: "",
      },
    ]),
  );

  referrals.forEach((referral) => {
    const matchedBarangay = findBulakanBarangay(getReferralBarangay(referral));
    if (!matchedBarangay) return;

    const current = groups.get(matchedBarangay.toLowerCase());

    current.referrals += 1;

    const status = getRecordStatus(referral);
    const activityDate = getRecordDate(referral);

    if (isPendingStatus(status)) current.pending += 1;
    if (isReceivedStatus(status)) current.received += 1;
    if (isCompleteStatus(status)) current.completed += 1;
    if (isNoShowStatus(status)) current.noShow += 1;
    if (activityDate && activityDate > current.lastActivity) {
      current.lastActivity = activityDate;
    }
  });

  const items = BULAKAN_BARANGAYS.map((barangay) =>
    groups.get(barangay.toLowerCase()),
  );
  const max = Math.max(...items.map((item) => item.referrals), 1);

  return items.map((item) => ({
    ...item,
    share: Math.round((item.referrals / max) * 100),
    totalCases: item.referrals,
  }));
}

function buildRhuSummary(referrals) {
  return {
    name: MAIN_RHU_NAME,
    incomingReferrals: referrals.length,
    receivedCases: referrals.filter((item) =>
      isReceivedStatus(getRecordStatus(item)),
    ).length,
    completedCases: referrals.filter((item) =>
      isCompleteStatus(getRecordStatus(item)),
    ).length,
    feedbackSubmitted: referrals.filter(hasFeedbackSubmitted).length,
    noShowCases: referrals.filter((item) =>
      isNoShowStatus(getRecordStatus(item)),
    ).length,
  };
}

function buildCategoryReports(referrals) {
  const groups = new Map();

  referrals.forEach((referral) => {
    const category = getReferralCategory(referral);
    groups.set(category, (groups.get(category) || 0) + 1);
  });

  return Array.from(groups.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .slice(0, 8);
}

function buildCategoryRanking(categoryReports, totalReferrals) {
  const total = Math.max(totalReferrals, 1);

  return categoryReports.map((item) => ({
    ...item,
    percent: Math.round((item.count / total) * 100),
  }));
}

function buildMonthlyTrend(referrals, patients, healthRecords) {
  const months = getLastMonths(12);
  const counts = new Map(months.map((month) => [month.key, 0]));

  [
    ...referrals.map((item) => ({ ...item, _reportType: "referral" })),
    ...patients.map((item) => ({ ...item, _reportType: "patient" })),
    ...healthRecords.map((item) => ({ ...item, _reportType: "health-record" })),
  ].forEach((item) => {
    const monthKey = getRecordMonthKey(item);
    if (!counts.has(monthKey)) return;
    counts.set(monthKey, counts.get(monthKey) + 1);
  });

  return months.map((month) => ({
    ...month,
    value: counts.get(month.key) || 0,
  }));
}

function getLastMonths(count) {
  const today = new Date();
  const months = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "short" }),
      fullLabel: date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    });
  }

  return months;
}

/* ─────────────────────────────────────────────
   CHARTS
───────────────────────────────────────────── */
function buildFourteenBarangayChartData(items) {
  return {
    labels: items.map((item) => item.barangay),
    datasets: [
      {
        label: "Referrals",
        data: items.map((item) => item.referrals),
        backgroundColor: (context) =>
          getChartGradient(
            context,
            ["rgba(254, 226, 226, 0.94)", chartPalette.red],
            "vertical",
          ),
        borderColor: chartPalette.red,
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 24,
      },
      {
        label: "Completed",
        data: items.map((item) => item.completed),
        backgroundColor: (context) =>
          getChartGradient(
            context,
            ["rgba(209, 250, 229, 0.95)", chartPalette.emerald],
            "vertical",
          ),
        borderColor: chartPalette.emerald,
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 24,
      },
      {
        label: "Pending",
        data: items.map((item) => item.pending),
        backgroundColor: (context) =>
          getChartGradient(
            context,
            ["rgba(254, 243, 199, 0.95)", chartPalette.amber],
            "vertical",
          ),
        borderColor: chartPalette.amber,
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 24,
      },
    ],
  };
}

const fourteenBarangayChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  animation: { duration: 850, easing: "easeOutQuart" },
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        usePointStyle: true,
        boxWidth: 8,
        color: chartPalette.slate,
        font: { size: 11, weight: "700" },
      },
    },
    tooltip: buildTooltipOptions(),
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: chartPalette.slate,
        font: { size: 10, weight: "700" },
        maxRotation: 45,
        minRotation: 0,
      },
    },
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0,
        color: chartPalette.slate,
        font: { size: 11, weight: "700" },
      },
      grid: { color: chartPalette.grid, drawBorder: false },
      title: {
        display: true,
        text: "Referral activity count",
        color: chartPalette.muted,
        font: { size: 10, weight: "700" },
      },
    },
  },
};

function buildMonthlyLineData(monthlyTrend) {
  return {
    labels: monthlyTrend.map((item) => item.label),
    datasets: [
      {
        label: "Municipal Activity",
        data: monthlyTrend.map((item) => Number(item.value || 0)),
        borderColor: (context) =>
          getLineGradient(context, [chartPalette.red, chartPalette.redDark]),
        backgroundColor: (context) =>
          getAreaGradient(
            context,
            "rgba(185, 28, 28, 0.2)",
            "rgba(185, 28, 28, 0.02)",
          ),
        pointBackgroundColor: "#FFFFFF",
        pointBorderColor: chartPalette.red,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
      },
    ],
  };
}

function monthlyLineOptions(monthlyTrend) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 850, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...buildTooltipOptions("record(s)"),
        callbacks: {
          title: (items) => {
            const index = items?.[0]?.dataIndex ?? 0;
            return monthlyTrend[index]?.fullLabel || "";
          },
          label: (context) =>
            `${context.dataset?.label || "Activity"}: ${formatNumber(context.parsed?.y || 0)} record(s)`,
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: { display: false },
        ticks: {
          color: chartPalette.slate,
          font: { size: 11, weight: "700" },
          maxRotation: 0,
          minRotation: 0,
        },
      },
      y: {
        display: true,
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: chartPalette.slate,
          font: { size: 11, weight: "700" },
          callback: (value) => formatNumber(value),
        },
        grid: { color: chartPalette.grid, drawBorder: false },
      },
    },
  };
}

function buildBarangayChartData(items) {
  return {
    labels: items.map((item) => item.barangay),
    datasets: [
      {
        label: "Referrals",
        data: items.map((item) => item.referrals),
        backgroundColor: (context) =>
          getChartGradient(
            context,
            ["rgba(254, 226, 226, 0.92)", chartPalette.red],
            "horizontal",
          ),
        borderColor: chartPalette.red,
        borderWidth: 1,
        borderRadius: 9,
        borderSkipped: false,
        maxBarThickness: 28,
      },
      {
        label: "Completed",
        data: items.map((item) => item.completed),
        backgroundColor: (context) =>
          getChartGradient(
            context,
            ["rgba(209, 250, 229, 0.9)", chartPalette.emerald],
            "horizontal",
          ),
        borderColor: chartPalette.emerald,
        borderWidth: 1,
        borderRadius: 9,
        borderSkipped: false,
        maxBarThickness: 28,
      },
      {
        label: "Pending",
        data: items.map((item) => item.pending),
        backgroundColor: (context) =>
          getChartGradient(
            context,
            ["rgba(254, 243, 199, 0.95)", chartPalette.amber],
            "horizontal",
          ),
        borderColor: chartPalette.amber,
        borderWidth: 1,
        borderRadius: 9,
        borderSkipped: false,
        maxBarThickness: 28,
      },
    ],
  };
}

const barangayChartOptions = {
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "nearest", axis: "y", intersect: false },
  animation: { duration: 850, easing: "easeOutQuart" },
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        usePointStyle: true,
        boxWidth: 8,
        color: chartPalette.slate,
        font: { size: 11, weight: "700" },
      },
    },
    tooltip: buildTooltipOptions(),
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: {
        precision: 0,
        color: chartPalette.slate,
        font: { size: 11, weight: "700" },
      },
      grid: { color: chartPalette.grid, drawBorder: false },
    },
    y: {
      ticks: {
        color: chartPalette.slate,
        font: { size: 11, weight: "700" },
        callback: function (value) {
          const label = this.getLabelForValue(value);
          return label.length > 16 ? `${label.slice(0, 15)}…` : label;
        },
      },
      grid: { display: false },
    },
  },
};

function buildCoverageChartData(items) {
  return {
    labels: items.map((item) => item.label),
    datasets: [
      {
        label: "Records",
        data: items.map((item) => item.value),
        backgroundColor: (context) => getDoughnutGradient(context),
        borderColor: "#FFFFFF",
        borderWidth: 4,
        hoverBorderWidth: 5,
        hoverOffset: 7,
        spacing: 2,
      },
    ],
  };
}

const coverageChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "64%",
  radius: "88%",
  animation: {
    animateRotate: true,
    animateScale: true,
    duration: 850,
    easing: "easeOutQuart",
  },
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        usePointStyle: true,
        boxWidth: 8,
        color: chartPalette.slate,
        font: { size: 11, weight: "700" },
      },
    },
    tooltip: buildTooltipOptions("record(s)"),
  },
};

function getChartGradient(context, colors, direction = "vertical") {
  const { chart } = context;
  const { ctx, chartArea } = chart;

  if (!chartArea) return colors[colors.length - 1];

  const gradient =
    direction === "horizontal"
      ? ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
      : ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);

  colors.forEach((color, index) => {
    gradient.addColorStop(index / Math.max(colors.length - 1, 1), color);
  });

  return gradient;
}

function getLineGradient(context, colors) {
  const { chart } = context;
  const { ctx, chartArea } = chart;

  if (!chartArea) return colors[0];

  const gradient = ctx.createLinearGradient(
    chartArea.left,
    0,
    chartArea.right,
    0,
  );

  colors.forEach((color, index) => {
    gradient.addColorStop(index / Math.max(colors.length - 1, 1), color);
  });

  return gradient;
}

function getAreaGradient(context, startColor, endColor) {
  const { chart } = context;
  const { ctx, chartArea } = chart;

  if (!chartArea) return startColor;

  const gradient = ctx.createLinearGradient(
    0,
    chartArea.top,
    0,
    chartArea.bottom,
  );
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);

  return gradient;
}

function getDoughnutGradient(context) {
  const { chart, dataIndex } = context;
  const { ctx, chartArea } = chart;

  const fallbackColors = [
    chartPalette.red,
    chartPalette.amber,
    chartPalette.emerald,
    chartPalette.slate,
    chartPalette.blue,
    chartPalette.purple,
    chartPalette.redMid,
    chartPalette.slateLight,
  ];

  if (!chartArea) return fallbackColors[dataIndex % fallbackColors.length];

  const gradientSets = [
    ["#FEE2E2", chartPalette.red],
    ["#FFEDD5", chartPalette.amber],
    ["#D1FAE5", chartPalette.emerald],
    ["#E2E8F0", chartPalette.slate],
    ["#DBEAFE", chartPalette.blue],
    ["#EDE9FE", chartPalette.purple],
    ["#FECACA", chartPalette.redMid],
    ["#F1F5F9", chartPalette.slateLight],
  ];

  const [startColor, endColor] = gradientSets[dataIndex % gradientSets.length];
  const gradient = ctx.createLinearGradient(
    chartArea.left,
    chartArea.top,
    chartArea.right,
    chartArea.bottom,
  );
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);

  return gradient;
}

function buildTooltipOptions(suffix = "record(s)") {
  return {
    backgroundColor: "#0F172A",
    titleColor: "#FFFFFF",
    bodyColor: "#E2E8F0",
    padding: 12,
    cornerRadius: 8,
    displayColors: false,
    callbacks: {
      label: (context) => {
        const value =
          context.parsed?.y ??
          context.parsed?.x ??
          context.parsed ??
          context.raw ??
          0;

        return `${context.dataset?.label || "Total"}: ${formatNumber(value)} ${suffix}`;
      },
    },
  };
}

/* ─────────────────────────────────────────────
   LOCAL STORAGE HELPERS
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   FIELD NORMALIZATION
───────────────────────────────────────────── */
function getSourceRole(item = {}) {
  const key = String(item._storageKey || "").toLowerCase();
  const bhcId =
    item.barangayHealthCenterId ||
    item.barangay_health_center_id ||
    item.barangay_health_center?.id ||
    item.barangayHealthCenter?.id ||
    item.patient?.barangayHealthCenterId ||
    item.patient?.barangay_health_center_id;
  const rhuId =
    item.ruralHealthUnitId ||
    item.rural_health_unit_id ||
    item.rural_health_unit?.id ||
    item.ruralHealthUnit?.id ||
    item.patient?.ruralHealthUnitId ||
    item.patient?.rural_health_unit_id;
  const raw = [
    item.createdByRole,
    item.role,
    item.backendRole,
    item.facilityRole,
    item.facilityType,
    item.sourceType,
    item.origin,
    item.registrationType,
    item.patientType,
    item.type,
    item.sourceFacility,
    item.referringFacility,
    item.receivingFacility,
    item.facilityName,
    item.facility,
    item.patient?.facility,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (bhcId) return "BHC";
  if (rhuId) return "RHU";

  if (key.includes("rhu") || raw.includes("rhu") || raw.includes("rural")) {
    return "RHU";
  }

  if (
    key.includes("bhc") ||
    raw.includes("bhc") ||
    raw.includes("barangay health")
  ) {
    return "BHC";
  }

  if (item._reportCollection === "referrals") return "BHC";
  if (
    item._reportCollection === "doctors" ||
    item._reportCollection === "medicines"
  ) {
    return "RHU";
  }

  return "Unspecified";
}

function getPatientName(item = {}) {
  return (
    item.patientName ||
    item.patient_name ||
    item.name ||
    item.fullName ||
    item.patient?.name ||
    [item.firstName, item.middleName, item.lastName]
      .filter(Boolean)
      .join(" ") ||
    ""
  );
}

function getDoctorName(item = {}) {
  return item.doctorName || item.name || "";
}

function getMedicineName(item = {}) {
  return item.name || item.item || item.medicineName || "";
}

function getChiefComplaint(item = {}) {
  return (
    item.chiefComplaint ||
    item.chief_complaint ||
    item.concern ||
    item.reasonForReferral ||
    item.referralReason ||
    item.diagnosis ||
    ""
  );
}

function getRecordStatus(item = {}) {
  return normalizeStatus(
    item.status ||
      item.accountStatus ||
      item.availabilityStatus ||
      item.referralStatus ||
      item.followUpStatus ||
      item.monitoringStatus ||
      item.recordStatus ||
      item.stockStatus ||
      item.expiryStatus ||
      "",
  );
}

function normalizeStatus(status) {
  const value = String(status || "").trim();
  const normalized = value.toLowerCase();

  if (!value) return "Unspecified";
  if (
    normalized.includes("no-show") ||
    normalized.includes("no show") ||
    normalized.includes("noshow")
  ) {
    return "No-Show";
  }
  if (normalized.includes("complete") || normalized.includes("closed")) {
    return "Complete";
  }
  if (normalized.includes("received") || normalized.includes("checked in")) {
    return "Received";
  }
  if (normalized.includes("pending") || normalized.includes("queued")) {
    return "Pending";
  }
  if (normalized.includes("follow")) return "Follow-up Required";
  if (normalized.includes("monitor") || normalized.includes("routine")) {
    return "Routine Monitoring";
  }
  if (normalized.includes("available") && !normalized.includes("not")) {
    return "Available";
  }
  if (normalized.includes("not available")) return "Not Available";
  if (normalized === "active") return "Active";
  if (normalized === "inactive") return "Inactive";

  return value;
}

function isCompleteStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized.includes("complete") || normalized.includes("closed");
}

function isPendingStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized.includes("pending") || normalized.includes("queue");
}

function isReceivedStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return (
    normalized.includes("received") ||
    normalized.includes("checked in") ||
    normalized.includes("check-in")
  );
}

function isNoShowStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return (
    normalized.includes("no-show") ||
    normalized.includes("no show") ||
    normalized.includes("noshow")
  );
}

function isMonitoringStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return (
    normalized.includes("monitor") ||
    normalized.includes("routine") ||
    normalized.includes("follow-up") ||
    normalized.includes("follow up")
  );
}

function hasFeedbackSubmitted(referral = {}) {
  const feedbackText = [
    referral.feedbackStatus,
    referral.feedback_status,
    referral.returnSlipStatus,
    referral.return_slip_status,
    referral.feedbackSubmitted,
    referral.feedback_submitted,
    referral.feedback,
    referral.returnSlip,
    referral.return_slip,
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();

  return (
    feedbackText.includes("submitted") ||
    feedbackText.includes("complete") ||
    feedbackText === "true" ||
    referral.feedbackSubmitted === true ||
    referral.feedback_submitted === true
  );
}

function isActiveStatus(status) {
  const normalized = String(status || "").toLowerCase();

  if (
    normalized.includes("inactive") ||
    normalized.includes("disabled") ||
    normalized.includes("not available")
  ) {
    return false;
  }

  return (
    normalized.includes("active") ||
    normalized.includes("available") ||
    normalized === "enabled"
  );
}

function getReferralBarangay(referral = {}) {
  return (
    referral.barangay ||
    referral.patientBarangay ||
    referral.referringBarangay ||
    referral.sourceBarangay ||
    referral.originBarangay ||
    referral.bhcBarangay ||
    cleanupFacilityName(
      referral.referringFacility ||
        referral.sourceFacility ||
        referral.originFacility ||
        referral.facilityName,
    ) ||
    "Unspecified"
  );
}

function getPatientBarangay(item = {}) {
  return (
    item.barangay ||
    item.patientBarangay ||
    item.sourceBarangay ||
    item.originBarangay ||
    cleanupFacilityName(item.facilityName || item.sourceFacility) ||
    "Unspecified"
  );
}

function findBulakanBarangay(value) {
  const cleaned = String(value || "")
    .replace(/barangay health center/gi, "")
    .replace(/barangay/gi, "")
    .replace(/brgy\.?/gi, "")
    .replace(/bgy\.?/gi, "")
    .replace(/\bBHC\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!cleaned) return "";

  return (
    BULAKAN_BARANGAYS.find((barangay) => barangay.toLowerCase() === cleaned) ||
    BULAKAN_BARANGAYS.find((barangay) =>
      cleaned.includes(barangay.toLowerCase()),
    ) ||
    ""
  );
}

function cleanupFacilityName(value) {
  if (!value) return "";
  return String(value)
    .replace(/barangay health center/gi, "")
    .replace(/rural health unit/gi, "")
    .replace(/\bBHC\b/gi, "")
    .replace(/\bRHU\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getReferralCategory(referral = {}) {
  return (
    referral.category ||
    referral.referralCategory ||
    referral.categoryCode ||
    referral.priority ||
    referral.urgency ||
    referral.classification ||
    referral.patientClassification ||
    "Unspecified"
  );
}

function getRecordCategory(record = {}) {
  return (
    record.category ||
    record.classification ||
    record.patientClassification ||
    record.patientCategory ||
    record.recordType ||
    record.doctorType ||
    record.role ||
    record.position ||
    "Unspecified"
  );
}

function getRecordDate(item = {}) {
  return normalizeDate(
    item.dateOfReferral ||
      item.referralDate ||
      item.dateSubmitted ||
      item.submittedAt ||
      item.receivedAt ||
      item.dateOfVisit ||
      item.visitDate ||
      item.dateRegistered ||
      item.registeredAt ||
      item.createdAt ||
      item.updatedAt ||
      item.date ||
      "",
  );
}

function getRecordMonthKey(item) {
  const normalized = getRecordDate(item);
  if (!normalized) return "";
  return normalized.slice(0, 7);
}

function normalizeMedicineAlert(item) {
  const status = String(
    item.status ||
      item.availabilityStatus ||
      item.stockStatus ||
      item.expiryStatus ||
      "",
  );

  const quantity = Number(item.qty ?? item.quantity ?? item.stock ?? 0);
  const expiryStatus = String(item.expiryStatus || item.expiry_status || "");
  const isLow =
    status.toLowerCase().includes("low") ||
    status.toLowerCase().includes("unavailable") ||
    status.toLowerCase().includes("expired") ||
    expiryStatus.toLowerCase().includes("expired") ||
    (Number.isFinite(quantity) && quantity > 0 && quantity <= 20);

  if (!isLow) return null;

  return {
    id: item.id || item.itemId || item.name || item.medicineName,
    name: getMedicineName(item) || "Unnamed medicine",
    status:
      status ||
      (expiryStatus.toLowerCase().includes("expired")
        ? "Expired"
        : quantity === 0
          ? "Unavailable"
          : "Low Stock"),
    quantityLabel: formatMedicineQuantity(item, quantity),
  };
}

function formatMedicineQuantity(item, quantity) {
  if (item.quantityLabel) return item.quantityLabel;
  if (item.qtyLabel) return item.qtyLabel;

  const unit = item.unit || item.measurementUnit || item.stockUnit || "unit(s)";
  const value = Number.isFinite(quantity)
    ? quantity
    : item.qty || item.quantity || item.stock || 0;

  return `${value} ${unit}`;
}

function getMedicineAlertWeight(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized.includes("unavailable") || normalized.includes("expired")) {
    return 3;
  }

  if (normalized.includes("low")) return 2;

  return 1;
}

function normalizeDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function exportMunicipalReportCsv({
  filters,
  stats,
  barangayReports,
  rhuSummary,
}) {
  const generatedAt = new Date();
  const rows = [
    ["AKAY Community EHR System"],
    ["Municipal Referral Report"],
    ["Generated date", formatDateTime(generatedAt)],
    ["Report scope", REPORT_SCOPE],
    ["Receiving RHU", MAIN_RHU_NAME],
    ["Barangay / BHC filter", filters.barangay],
    ["Referral category filter", filters.category],
    ["Referral status filter", filters.status],
    ["Date filter", filters.date || "Any date"],
    [],
    ["Summary Metrics"],
    ["Total Referrals", stats.totalReferrals],
    ["Pending Referrals", stats.pendingReferrals],
    ["Completed", stats.completedCases],
    ["No-Show Cases", stats.noShowCases],
    [],
    [
      "Barangay",
      "Total Referrals",
      "Pending",
      "Received",
      "Completed",
      "No-Show",
      "Last Activity",
    ],
    ...barangayReports.map((item) => [
      item.barangay,
      item.referrals,
      item.pending,
      item.received,
      item.completed,
      item.noShow,
      formatDisplayDate(item.lastActivity),
    ]),
    [],
    [
      "RHU Name",
      "Incoming Referrals",
      "Received",
      "Completed",
      "Feedback Submitted",
      "No-Show",
    ],
    [
      rhuSummary.name,
      rhuSummary.incomingReferrals,
      rhuSummary.receivedCases,
      rhuSummary.completedCases,
      rhuSummary.feedbackSubmitted,
      rhuSummary.noShowCases,
    ],
  ];

  downloadCsv(
    rows,
    `akay-municipal-referral-report-${formatFileDate(generatedAt)}.csv`,
  );
}

function downloadCsv(rows, filename) {
  if (typeof window === "undefined") return;

  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  window.URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDisplayDate(value) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFileDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "generated";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function sortUnique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

function hasAnyValue(values) {
  return values.some((value) => Number(value) > 0);
}

function formatNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString();
}
