import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  Printer,
  RefreshCw,
  SearchCheck,
} from "lucide-react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

import DashboardLayout from "../../components/layout/DashboardLayout";
import StatCard from "../../components/common/cards/StatsCard";
import ListToolbar from "../../components/common/list/ListToolbar";

ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, Tooltip);

const DEFAULT_FILTERS = {
  search: "",
  classification: "All Classifications",
  referralStatus: "All Referral Status",
  dateReferred: "",
};

const chartPalette = {
  primary: "#B91C1C",
  primaryDark: "#7F1D1D",
  primaryMid: "#DC2626",
  primarySoft: "#FEE2E2",
  text: "#334155",
  mutedText: "#64748B",
  grid: "rgba(226, 232, 240, 0.85)",
};

const smoothAnimation = {
  duration: 850,
  easing: "easeOutQuart",
};

const REPORT_DATA = {
  weekly: {
    label: "Weekly Report",
    shortLabel: "Weekly",
    description:
      "Weekly summary focused on chief complaints/cases for BHC reporting and reconciliation.",
    logbook: [
      {
        trackingId: "AKY-257003",
        name: "Maria Santos",
        classification: "Maternal",
        chiefComplaint: "Pregnancy-related concern",
        status: "Completed",
        date: "May 13, 2026",
        feedback: "Managed at RHU",
      },
      {
        trackingId: "AKY-197393",
        name: "Juan Dela Cruz",
        classification: "General Consultation",
        chiefComplaint: "Hypertension check",
        status: "Pending",
        date: "May 12, 2026",
        feedback: "Awaiting RHU check-in",
      },
      {
        trackingId: "AKY-748385",
        name: "Ana Reyes",
        classification: "Maternal",
        chiefComplaint: "Headache and swelling",
        status: "For Monitoring",
        date: "May 12, 2026",
        feedback: "RHU monitoring ongoing",
      },
      {
        trackingId: "AKY-626573",
        name: "Pedro Lopez",
        classification: "Senior Citizen",
        chiefComplaint: "Diabetes maintenance",
        status: "Received",
        date: "May 11, 2026",
        feedback: "Patient received by RHU",
      },
      {
        trackingId: "AKY-547819",
        name: "Rosa Garcia",
        classification: "General Consultation",
        chiefComplaint: "Fever and cough",
        status: "Completed",
        date: "May 10, 2026",
        feedback: "Return slip received",
      },
      {
        trackingId: "AKY-703945",
        name: "Carlos Mendoza",
        classification: "General Consultation",
        chiefComplaint: "Chest discomfort",
        status: "Pending",
        date: "May 10, 2026",
        feedback: "Awaiting RHU check-in",
      },
    ],
  },
  monthly: {
    label: "Monthly Report",
    shortLabel: "Monthly",
    description:
      "Monthly summary focused on chief complaints/cases for end-of-month BHC reporting.",
    logbook: [
      {
        trackingId: "AKY-257003",
        name: "Maria Santos",
        classification: "Maternal",
        chiefComplaint: "Pregnancy-related concern",
        status: "Completed",
        date: "May 13, 2026",
        feedback: "Managed at RHU",
      },
      {
        trackingId: "AKY-197393",
        name: "Juan Dela Cruz",
        classification: "General Consultation",
        chiefComplaint: "Hypertension check",
        status: "Pending",
        date: "May 12, 2026",
        feedback: "Awaiting RHU check-in",
      },
      {
        trackingId: "AKY-748385",
        name: "Ana Reyes",
        classification: "Maternal",
        chiefComplaint: "Headache and swelling",
        status: "For Monitoring",
        date: "May 12, 2026",
        feedback: "RHU monitoring ongoing",
      },
      {
        trackingId: "AKY-626573",
        name: "Pedro Lopez",
        classification: "Senior Citizen",
        chiefComplaint: "Diabetes maintenance",
        status: "Received",
        date: "May 11, 2026",
        feedback: "Patient received by RHU",
      },
      {
        trackingId: "AKY-547819",
        name: "Rosa Garcia",
        classification: "General Consultation",
        chiefComplaint: "Fever and cough",
        status: "Completed",
        date: "May 10, 2026",
        feedback: "Return slip received",
      },
      {
        trackingId: "AKY-703945",
        name: "Carlos Mendoza",
        classification: "General Consultation",
        chiefComplaint: "Chest discomfort",
        status: "Pending",
        date: "May 10, 2026",
        feedback: "Awaiting RHU check-in",
      },
      {
        trackingId: "AKY-118204",
        name: "Elena Bautista",
        classification: "Immunization",
        chiefComplaint: "Vaccination visit",
        status: "Completed",
        date: "May 8, 2026",
        feedback: "Vaccine schedule reviewed",
      },
      {
        trackingId: "AKY-882410",
        name: "Lito Fernandez",
        classification: "General Consultation",
        chiefComplaint: "Fever and cough",
        status: "Completed",
        date: "May 7, 2026",
        feedback: "Return slip received",
      },
      {
        trackingId: "AKY-441927",
        name: "Carmen Flores",
        classification: "Senior Citizen",
        chiefComplaint: "Hypertension check",
        status: "No-Show",
        date: "May 6, 2026",
        feedback: "Patient did not arrive at RHU",
      },
      {
        trackingId: "AKY-672819",
        name: "Nora Villanueva",
        classification: "Maternal",
        chiefComplaint: "Maternal concern",
        status: "Completed",
        date: "May 5, 2026",
        feedback: "Managed at RHU",
      },
    ],
  },
};

function normalizeDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function createHorizontalGradient(ctx, chartArea, stops) {
  if (!chartArea) return stops[0]?.color || chartPalette.primary;

  const gradient = ctx.createLinearGradient(
    chartArea.left,
    0,
    chartArea.right,
    0,
  );

  stops.forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
  return gradient;
}

export default function BHCReports() {
  const [reportMode, setReportMode] = useState("weekly");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const currentReport = REPORT_DATA[reportMode];

  const filteredReferralLogbook = useMemo(() => {
    return currentReport.logbook.filter((log) => {
      const query = filters.search.trim().toLowerCase();
      const searchText = [
        log.trackingId,
        log.name,
        log.classification,
        log.chiefComplaint,
        log.status,
        log.feedback,
        log.date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchText.includes(query);
      const matchesClassification =
        filters.classification === "All Classifications" ||
        log.classification === filters.classification;
      const matchesStatus =
        filters.referralStatus === "All Referral Status" ||
        log.status === filters.referralStatus;
      const matchesDate =
        !filters.dateReferred ||
        normalizeDate(log.date) === filters.dateReferred;

      return (
        matchesSearch && matchesClassification && matchesStatus && matchesDate
      );
    });
  }, [currentReport.logbook, filters]);

  const casesSummary = useMemo(
    () => buildChiefComplaintSummary(filteredReferralLogbook),
    [filteredReferralLogbook],
  );

  const reportSummary = useMemo(() => {
    const completed = filteredReferralLogbook.filter(
      (log) => log.status === "Completed",
    ).length;

    return {
      totalReferrals: filteredReferralLogbook.length,
      casesRecorded: filteredReferralLogbook.length,
      complaintTypes: casesSummary.length,
      completedReferrals: completed,
      topCase: casesSummary[0]?.label || "No data",
    };
  }, [casesSummary, filteredReferralLogbook]);

  const dropdownFilters = [
    {
      key: "classification",
      label: "Classification",
      value: filters.classification,
      options: [
        "All Classifications",
        "General Consultation",
        "Maternal",
        "Immunization",
        "Senior Citizen",
      ],
    },
    {
      key: "referralStatus",
      label: "Referral Status",
      value: filters.referralStatus,
      options: [
        "All Referral Status",
        "Pending",
        "Received",
        "For Monitoring",
        "Completed",
        "No-Show",
      ],
    },
    {
      key: "dateReferred",
      label: "Date Referred",
      value: filters.dateReferred,
      type: "date",
    },
  ];

  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
    filters.classification !== "All Classifications" && {
      key: "classification",
      label: filters.classification,
    },
    filters.referralStatus !== "All Referral Status" && {
      key: "referralStatus",
      label: filters.referralStatus,
    },
    filters.dateReferred && {
      key: "dateReferred",
      label: filters.dateReferred,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  const casesChartData = useMemo(() => {
    const visibleCases = casesSummary.slice(0, 8);

    return {
      labels: visibleCases.map((item) => item.label),
      datasets: [
        {
          label: "Cases",
          data: visibleCases.map((item) => item.value),
          backgroundColor: (context) => {
            const { ctx, chartArea } = context.chart;
            return createHorizontalGradient(ctx, chartArea, [
              { offset: 0, color: "rgba(254, 226, 226, 0.96)" },
              { offset: 0.48, color: "rgba(220, 38, 38, 0.84)" },
              { offset: 1, color: chartPalette.primary },
            ]);
          },
          borderColor: "rgba(185, 28, 28, 0.22)",
          borderWidth: 1,
          borderRadius: 10,
          borderSkipped: false,
          barThickness: 24,
        },
      ],
    };
  }, [casesSummary]);

  function applyDropdownFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      classification: "All Classifications",
      referralStatus: "All Referral Status",
      dateReferred: "",
    };

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  return (
    <DashboardLayout role="bhc" title="Reports">
      <div className="space-y-4">
        <ReportHeader
          reportMode={reportMode}
          setReportMode={setReportMode}
          currentReport={currentReport}
        />

        <ListToolbar
          searchValue={filters.search}
          onSearchChange={(value) =>
            setFilters((prev) => ({ ...prev, search: value }))
          }
          searchPlaceholder="Search patient, tracking ID, chief complaint, or status..."
          chip={`● ${filteredReferralLogbook.length.toLocaleString()} ${
            currentReport.shortLabel
          } Record${filteredReferralLogbook.length === 1 ? "" : "s"}`}
          filters={dropdownFilters}
          activeFilterCount={activeFilterCount}
          activeFilters={activeFilters}
          onApplyFilters={applyDropdownFilters}
          onClearFilters={clearFilters}
          onRemoveFilter={removeFilter}
          actions={<ReportActionButtons />}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title={`${currentReport.shortLabel} Referrals`}
            value={reportSummary.totalReferrals}
            icon={<ClipboardList size={16} />}
            color="slate"
          />
          <StatCard
            title="Cases Recorded"
            value={reportSummary.casesRecorded}
            icon={<SearchCheck size={16} />}
            color="red"
          />
          <StatCard
            title="Complaint Types"
            value={reportSummary.complaintTypes}
            icon={<BarChart3 size={16} />}
            color="blue"
          />
          <StatCard
            title="Completed"
            value={reportSummary.completedReferrals}
            icon={<SearchCheck size={16} />}
            color="emerald"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_380px]">
          <ReportChartCard
            title="Chief Complaint Summary"
            description={`${currentReport.shortLabel} case count grouped by chief complaint.`}
            icon={<BarChart3 size={15} />}
            rightLabel="Primary report"
          >
            {casesSummary.length === 0 ? (
              <EmptyState message="No chief complaint records match the current filters." />
            ) : (
              <div className="h-[390px]">
                <Bar data={casesChartData} options={getCasesBarOptions()} />
              </div>
            )}
          </ReportChartCard>

          <CaseRankingCard
            cases={casesSummary}
            title={`${currentReport.shortLabel} Case Ranking`}
            total={filteredReferralLogbook.length}
          />
        </div>

        <ReferralLogbookTable
          records={filteredReferralLogbook}
          reportLabel={currentReport.shortLabel}
        />
      </div>
    </DashboardLayout>
  );
}

function ReportHeader({ reportMode, setReportMode, currentReport }) {
  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
            <CalendarDays size={18} />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#0F172A]">
              Weekly and Monthly Case Reports
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748B]">
              {currentReport.description} Main output is the summary of chief
              complaints/cases.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-1">
          {[
            { key: "weekly", label: "Weekly Report" },
            { key: "monthly", label: "Monthly Report" },
          ].map((item) => {
            const isActive = reportMode === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setReportMode(item.key)}
                className={`h-9 rounded-lg px-3 text-xs font-bold transition-all ${
                  isActive
                    ? "bg-[#B91C1C] text-white shadow-sm"
                    : "text-[#64748B] hover:bg-white hover:text-[#B91C1C]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ReportActionButtons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] active:bg-[#7F1D1D]">
        <RefreshCw size={12} /> Generate
      </button>
      <button className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[11px] font-semibold text-[#374151] transition-colors hover:bg-[#F8FAFC]">
        <FileText size={12} className="text-red-600" /> PDF
      </button>
      <button className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[11px] font-semibold text-[#374151] transition-colors hover:bg-[#F8FAFC]">
        <Printer size={12} /> Print
      </button>
    </div>
  );
}

function ReportChartCard({ title, description, icon, rightLabel, children }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#1E293B]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#94A3B8]">
                {description}
              </p>
            )}
          </div>
        </div>

        {rightLabel && (
          <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            {rightLabel}
          </span>
        )}
      </div>

      {children}
    </div>
  );
}

function CaseRankingCard({ title, cases, total }) {
  const topCase = cases[0];

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#1E293B]">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#94A3B8]">
            Ranked chief complaints from the selected report period.
          </p>
        </div>
        <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          {total} cases
        </span>
      </div>

      {topCase ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Most Common Case
          </p>
          <p className="mt-2 text-base font-bold text-[#B91C1C]">
            {topCase.label}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            {topCase.value} record{topCase.value === 1 ? "" : "s"} ·{" "}
            {topCase.percent}% of current report
          </p>
        </div>
      ) : (
        <EmptyState message="No case records to rank yet." compact />
      )}

      <div className="space-y-2.5">
        {cases.slice(0, 7).map((item, index) => (
          <div
            key={item.label}
            className="rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#B91C1C] shadow-sm">
                  {index + 1}
                </span>
                <p className="truncate text-xs font-semibold text-[#334155]">
                  {item.label}
                </p>
              </div>
              <span className="text-xs font-bold tabular-nums text-[#B91C1C]">
                {item.value}
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
    </div>
  );
}

function ReferralLogbookTable({ records, reportLabel }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-[#B91C1C]" />
          <h2 className="text-sm font-semibold text-[#B91C1C]">
            {reportLabel} Referral Logbook
          </h2>
        </div>
        <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
          Supporting records
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            <tr>
              <th className="whitespace-nowrap px-4 py-2">Tracking ID</th>
              <th className="whitespace-nowrap px-4 py-2">Patient Name</th>
              <th className="whitespace-nowrap px-4 py-2">
                Chief Complaint / Case
              </th>
              <th className="whitespace-nowrap px-4 py-2">Classification</th>
              <th className="whitespace-nowrap px-4 py-2">Date Referred</th>
              <th className="whitespace-nowrap px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-xs text-[#94A3B8]"
                >
                  No report records match the current search or filters.
                </td>
              </tr>
            ) : (
              records.map((log) => (
                <tr
                  key={log.trackingId}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className="font-mono text-[11px] font-semibold text-[#B91C1C]">
                      {log.trackingId}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-[#1F2937]">
                    {log.name}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-2.5 font-medium text-[#374151]">
                    {log.chiefComplaint}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                      {log.classification}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[#6B7280]">
                    {log.date}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <ReferralStatusBadge status={log.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState({ message, compact = false }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] text-center ${
        compact ? "px-4 py-7" : "h-[300px] px-4"
      }`}
    >
      <p className="text-xs font-medium text-[#94A3B8]">{message}</p>
    </div>
  );
}

function ReferralStatusBadge({ status }) {
  const toneMap = {
    Pending: "border-slate-200 bg-slate-50 text-slate-600",
    Received: "border-sky-200 bg-sky-50 text-sky-700",
    "For Monitoring": "border-amber-200 bg-amber-50 text-amber-700",
    Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "No-Show": "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide shadow-sm ${
        toneMap[status] || toneMap.Pending
      }`}
    >
      {status}
    </span>
  );
}

function normalizeComplaintLabel(value) {
  const label = value?.trim() || "Not specified";
  const lowerLabel = label.toLowerCase();

  if (lowerLabel.includes("fever") || lowerLabel.includes("cough")) {
    return "Fever / Cough";
  }

  if (lowerLabel.includes("hypertension")) {
    return "Hypertension Check";
  }

  if (lowerLabel.includes("pregnancy") || lowerLabel.includes("maternal")) {
    return "Maternal Concern";
  }

  if (lowerLabel.includes("vaccine") || lowerLabel.includes("vaccination")) {
    return "Vaccination Visit";
  }

  if (lowerLabel.includes("diabetes")) {
    return "Diabetes Monitoring";
  }

  return label;
}

function buildChiefComplaintSummary(records) {
  const total = records.length;

  if (!total) return [];

  const counts = records.reduce((acc, record) => {
    const key = normalizeComplaintLabel(record.chiefComplaint);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([label, value]) => ({
      label,
      value,
      percent: Math.round((value / total) * 100),
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getBaseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: smoothAnimation,
    transitions: {
      active: {
        animation: {
          duration: 220,
          easing: "easeOutQuart",
        },
      },
      resize: {
        animation: {
          duration: 350,
          easing: "easeOutQuart",
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "#1E293B",
        titleColor: "#FFFFFF",
        bodyColor: "#E2E8F0",
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        boxPadding: 5,
        titleFont: { size: 13, weight: "600", family: "Inter, sans-serif" },
        bodyFont: { size: 12, family: "Inter, sans-serif" },
        usePointStyle: true,
      },
    },
    interaction: {
      mode: "index",
      intersect: false,
    },
  };
}

function getCasesBarOptions() {
  return {
    ...getBaseChartOptions(),
    indexAxis: "y",
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: chartPalette.grid,
          borderDash: [4, 4],
          drawBorder: false,
        },
        ticks: {
          color: chartPalette.mutedText,
          font: { size: 11 },
          precision: 0,
        },
      },
      y: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          color: chartPalette.text,
          font: { size: 12, weight: "600" },
        },
      },
    },
    elements: {
      bar: {
        borderRadius: 10,
      },
    },
    plugins: {
      ...getBaseChartOptions().plugins,
      tooltip: {
        ...getBaseChartOptions().plugins.tooltip,
        callbacks: {
          label(context) {
            return ` ${context.raw} case(s)`;
          },
        },
      },
    },
  };
}
