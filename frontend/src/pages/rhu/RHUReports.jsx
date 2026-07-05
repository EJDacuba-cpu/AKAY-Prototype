import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  FileText,
  HeartPulse,
  Printer,
  RefreshCw,
  SearchCheck,
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
  LogarithmicScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Chart, Doughnut } from "react-chartjs-2";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ListToolbar } from "../../components/common";
import { FamilyPlanningReportSection } from "../shared/FamilyPlanningList";
import { getRhuHealthRecords } from "../../services/healthRecordService";
import { getRhuPatients } from "../../services/patientService";
import { getReferrals } from "../../services/referrals";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
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

const EMPTY_REPORT_SOURCE = Object.freeze({
  referrals: [],
  patients: [],
  healthRecords: [],
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
  text: "#334155",
  muted: "#94A3B8",
  grid: "#E2E8F0",
};

export default function RHUReports() {
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
    window.addEventListener("akay:rhu-patients-updated", refreshReports);
    window.addEventListener("akay:patients-updated", refreshReports);
    window.addEventListener("akay:health-records-updated", refreshReports);
    window.addEventListener("akay:rhu-health-records-updated", refreshReports);

    return () => {
      window.removeEventListener("akay:referrals-updated", refreshReports);
      window.removeEventListener("akay:rhu-referrals-updated", refreshReports);
      window.removeEventListener("akay:rhu-patients-updated", refreshReports);
      window.removeEventListener("akay:patients-updated", refreshReports);
      window.removeEventListener("akay:health-records-updated", refreshReports);
      window.removeEventListener(
        "akay:rhu-health-records-updated",
        refreshReports,
      );
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadReportSource() {
      try {
        setLoadError("");

        const [referrals, patients, healthRecords] = await Promise.all([
          getReferrals(),
          getRhuPatients(),
          getRhuHealthRecords(),
        ]);

        if (!active) return;

        setReportSource({
          referrals: Array.isArray(referrals) ? referrals : [],
          patients: Array.isArray(patients) ? patients : [],
          healthRecords: Array.isArray(healthRecords) ? healthRecords : [],
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
    barangayReports,
    categoryReports,
    categoryRanking,
  } = reportSummary;

  const dropdownFilters = [
    {
      key: "barangay",
      label: "Barangay / Source",
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
      label: "Status",
      value: filters.status,
      options: dropdownOptions.statuses,
    },
    {
      key: "date",
      label: "Date",
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

  return (
    <DashboardLayout role="rhu" title="Reports">
      <div className="space-y-4">
        <ListToolbar
          searchValue={filters.search}
          onSearchChange={(value) =>
            setFilters((prev) => ({ ...prev, search: value }))
          }
          searchPlaceholder="Search barangay, tracking ID, patient, category, status, or chief complaint..."
          filters={dropdownFilters}
          activeFilterCount={activeFilterCount}
          activeFilters={activeFilters}
          onApplyFilters={applyDropdownFilters}
          onClearFilters={clearFilters}
          onRemoveFilter={removeFilter}
          actions={
            <ReportActionButtons
              onRefresh={refreshReports}
              onPdf={printAsPdf}
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
            title="Walk-in Patients"
            value={stats.walkIns}
            icon={<Users size={16} />}
            tone="slate"
          />
          <StatCard
            title="For Monitoring"
            value={stats.monitoring}
            icon={<HeartPulse size={16} />}
            tone="amber"
          />
          <StatCard
            title="Done"
            value={stats.completed}
            icon={<SearchCheck size={16} />}
            tone="emerald"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0 space-y-4">
            <ReportChartCard
              title="Patient Arrival Monitoring"
              description="Monthly view of incoming referrals, walk-in patients, and RHU health record activity."
              rightLabel="Monthly"
            >
              <FixedChartBox height="h-[300px]">
                {hasAnyValue(monthlyTrend.map((item) => item.value)) ? (
                  <Chart
                    type="line"
                    data={buildMonthlyLogLineData(monthlyTrend)}
                    options={monthlyLogLineOptions(monthlyTrend)}
                  />
                ) : (
                  <EmptyChartState
                    icon={<BarChart3 size={24} />}
                    title="No monthly referral activity yet"
                    message="Saved referrals, walk-ins, and health records will appear here."
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>

            <ReportChartCard
              title="Incoming Referrals by Barangay"
              description="Comparison of total, completed, and monitoring referrals by source barangay."
              rightLabel="Barangay summary"
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
                    title="No barangay referral data"
                    message="Incoming referral records with barangay or source facility will appear here."
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>

            <BarangayReferralTable barangayReports={barangayReports} />
          </main>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <ReportChartCard
              title="Referrals by Category"
              description="Doughnut chart showing referral category distribution."
              icon={<BarChart3 size={15} />}
              rightLabel="Category"
            >
              <FixedChartBox height="h-[280px]">
                {categoryReports.length > 0 ? (
                  <Doughnut
                    data={buildCategoryChartData(categoryReports)}
                    options={categoryChartOptions}
                  />
                ) : (
                  <EmptyChartState
                    icon={<BarChart3 size={24} />}
                    title="No category data"
                    message="Referral category values will appear once records are available."
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>

            <CategoryRankingCard
              categories={categoryRanking}
              total={stats.totalReferrals}
            />

            <ReportScopeCard
              filters={filters}
              referralCount={stats.totalReferrals}
              barangayCount={barangayReports.length}
              categoryCount={categoryReports.length}
            />
          </aside>
        </div>

        <FamilyPlanningReportSection
          role="rhu"
          basePath="/rhu"
          reportFilters={filters}
        />
      </div>
    </DashboardLayout>
  );
}

function ReportActionButtons({ onRefresh, onPdf, onPrint }) {
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
        onClick={onPdf}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[11px] font-semibold text-[#374151] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
      >
        <FileText size={12} className="text-red-600" />
        PDF
      </button>
      <button
        type="button"
        onClick={onPrint}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[11px] font-semibold text-[#374151] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
      >
        <Printer size={12} />
        Print
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
            Category Ranking
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
            Ranked referral categories from the current filters.
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

function ReportScopeCard({
  filters,
  referralCount,
  barangayCount,
  categoryCount,
}) {
  return (
    <section className="rounded-xl border border-[#E8ECF0] bg-white p-4 shadow-sm">
      <h2 className="text-sm font-black text-[#0F172A]">Report Filters</h2>
      <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
        Current report output after applying search and filters.
      </p>

      <div className="mt-4 space-y-2 text-[11px] text-[#64748B]">
        <ScopeRow label="Referrals" value={formatNumber(referralCount)} />
        <ScopeRow
          label="Barangay / Source"
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
          Table view of the referral summary based on the current filters.
        </p>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              <th className="px-5 py-3">Barangay / Source</th>
              <th className="px-4 py-3">Referrals</th>
              <th className="px-4 py-3">Done</th>
              <th className="px-4 py-3">Monitoring</th>
              <th className="px-4 py-3">Referral Count</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3F4F6]">
            {barangayReports.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-sm text-[#94A3B8]"
                >
                  No referral summary yet.
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
                    {item.completed}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {item.monitoring}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-full min-w-[110px] overflow-hidden rounded-full bg-[#E8ECF0]">
                        <div
                          className="h-full rounded-full bg-[#B91C1C]"
                          style={{ width: `${item.share}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-[11px] font-bold text-[#64748B]">
                        {formatNumber(item.referrals)}
                      </span>
                    </div>
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

function buildFilterOptions(source) {
  const barangays = [
    ...source.referrals.map(getReferralBarangay),
    ...source.patients.map(getPatientBarangay),
  ].filter(Boolean);

  const categories = [
    ...source.referrals.map(getReferralCategory),
    ...source.healthRecords.map(getRecordCategory),
  ].filter(Boolean);

  const statuses = [
    ...source.referrals.map(getRecordStatus),
    ...source.healthRecords.map(getRecordStatus),
  ].filter(Boolean);

  return {
    barangays: ["All Barangays", ...sortUnique(barangays)],
    categories: ["All Categories", ...sortUnique(categories)],
    statuses: [
      "All Status",
      ...sortUnique([
        ...statuses,
        "Pending",
        "Received",
        "Routine Monitoring",
        "Follow-up Required",
        "Completed",
        "No-Show",
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
    getPatientName(item),
    getChiefComplaint(item),
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

  const totalReferrals = referrals.length;
  const walkIns = patients.filter(isWalkInPatient).length;
  const monitoring =
    referrals.filter((item) => isMonitoringStatus(getRecordStatus(item)))
      .length +
    healthRecords.filter((item) => isMonitoringStatus(getRecordStatus(item)))
      .length;
  const completed =
    referrals.filter((item) => isCompleteStatus(getRecordStatus(item))).length +
    healthRecords.filter((item) => isCompleteStatus(getRecordStatus(item)))
      .length;

  const stats = {
    totalReferrals,
    walkIns,
    monitoring,
    completed,
  };

  const barangayReports = buildBarangayReports(referrals);
  const categoryReports = buildCategoryReports(referrals);
  const categoryRanking = buildCategoryRanking(categoryReports, totalReferrals);
  const monthlyTrend = buildMonthlyTrend(referrals, patients, healthRecords);

  return {
    stats,
    monthlyTrend,
    barangayReports,
    categoryReports,
    categoryRanking,
  };
}

function buildBarangayReports(referrals) {
  const groups = new Map();

  referrals.forEach((referral) => {
    const barangay = getReferralBarangay(referral);
    const current = groups.get(barangay) || {
      barangay,
      referrals: 0,
      completed: 0,
      monitoring: 0,
    };

    current.referrals += 1;

    const status = getRecordStatus(referral);
    if (isCompleteStatus(status)) current.completed += 1;
    if (isMonitoringStatus(status)) current.monitoring += 1;

    groups.set(barangay, current);
  });

  const items = Array.from(groups.values()).sort(
    (a, b) => b.referrals - a.referrals,
  );
  const max = Math.max(...items.map((item) => item.referrals), 1);

  return items.slice(0, 8).map((item) => ({
    ...item,
    share: Math.round((item.referrals / max) * 100),
  }));
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
    ...patients
      .filter(isWalkInPatient)
      .map((item) => ({ ...item, _reportType: "walk-in" })),
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

function buildMonthlyLogLineData(monthlyTrend) {
  return {
    labels: monthlyTrend.map((item) => item.label),
    datasets: [
      {
        label: "Patient Arrival Monitoring",
        data: monthlyTrend.map((item) => Math.max(Number(item.value || 0), 1)),
        actualData: monthlyTrend.map((item) => Number(item.value || 0)),
        borderColor: (context) =>
          getLineGradient(context, [chartPalette.red, chartPalette.redDark]),
        backgroundColor: "rgba(185, 28, 28, 0.12)",
        pointBackgroundColor: "#FFFFFF",
        pointBorderColor: chartPalette.red,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: false,
      },
    ],
  };
}

function monthlyLogLineOptions(monthlyTrend) {
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
          label: (context) => {
            const actualValue =
              context.dataset?.actualData?.[context.dataIndex] ??
              context.parsed?.y ??
              0;

            return `${context.dataset?.label || "Referral activity"}: ${formatNumber(actualValue)} record(s)`;
          },
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
        type: "logarithmic",
        min: 1,
        ticks: {
          color: chartPalette.slate,
          font: { size: 11, weight: "700" },
          callback: (value) => formatNumber(value),
        },
        grid: { color: chartPalette.grid, drawBorder: false },
        title: {
          display: true,
          text: "Referral count",
          color: chartPalette.muted,
          font: { size: 10, weight: "700" },
        },
      },
    },
  };
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
            ["rgba(254, 226, 226, 0.9)", chartPalette.red],
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
        label: "Monitoring",
        data: items.map((item) => item.monitoring),
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
          return label.length > 16 ? `${label.slice(0, 15)}â€¦` : label;
        },
      },
      grid: { display: false },
    },
  },
};

function buildCategoryChartData(items) {
  return {
    labels: items.map((item) => item.category),
    datasets: [
      {
        label: "Referrals",
        data: items.map((item) => item.count),
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

const categoryChartOptions = {
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
    tooltip: buildTooltipOptions("referral(s)"),
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

function getDoughnutGradient(context) {
  const { chart, dataIndex } = context;
  const { ctx, chartArea } = chart;

  const fallbackColors = [
    chartPalette.red,
    chartPalette.amber,
    chartPalette.emerald,
    chartPalette.slate,
    chartPalette.blue,
    chartPalette.redMid,
    chartPalette.slateLight,
    "#FCA5A5",
  ];

  if (!chartArea) return fallbackColors[dataIndex % fallbackColors.length];

  const gradientSets = [
    ["#FEE2E2", chartPalette.red],
    ["#FFEDD5", chartPalette.amber],
    ["#D1FAE5", chartPalette.emerald],
    ["#E2E8F0", chartPalette.slate],
    ["#DBEAFE", chartPalette.blue],
    ["#FECACA", chartPalette.redMid],
    ["#F1F5F9", chartPalette.slateLight],
    ["#FFE4E6", "#F43F5E"],
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

function isWalkInPatient(patient) {
  const source = [
    patient.source,
    patient.sourceType,
    patient.origin,
    patient.registrationType,
    patient.patientType,
    patient.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return source.includes("walk") || patient.isWalkIn === true;
}

function getPatientName(item) {
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

function getChiefComplaint(item) {
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

function getRecordStatus(item) {
  return normalizeStatus(
    item.status ||
      item.referralStatus ||
      item.followUpStatus ||
      item.monitoringStatus ||
      item.recordStatus ||
      "",
  );
}

function normalizeStatus(status) {
  const value = String(status || "").trim();
  const normalized = value.toLowerCase();

  if (!value) return "Unspecified";
  if (normalized.includes("complete") || normalized.includes("closed")) {
    return "Completed";
  }
  if (normalized.includes("follow")) return "Follow-up Required";
  if (normalized.includes("monitor") || normalized.includes("routine")) {
    return "Routine Monitoring";
  }
  return value;
}

function isCompleteStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized.includes("complete") || normalized.includes("closed");
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

function getReferralBarangay(referral) {
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

function getPatientBarangay(patient) {
  return (
    patient.barangay ||
    patient.patientBarangay ||
    patient.sourceBarangay ||
    patient.originBarangay ||
    cleanupFacilityName(patient.facilityName || patient.sourceFacility) ||
    "Unspecified"
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

function getReferralCategory(referral) {
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

function getRecordCategory(record) {
  return (
    record.category ||
    record.classification ||
    record.patientClassification ||
    record.recordType ||
    "Unspecified"
  );
}

function getRecordDate(item) {
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

function normalizeDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
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
