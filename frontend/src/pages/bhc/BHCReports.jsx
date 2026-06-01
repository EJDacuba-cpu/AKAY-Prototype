import { useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Printer,
  SearchCheck,
  UsersRound,
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
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Chart, PolarArea } from "react-chartjs-2";

import DashboardLayout from "../../components/layout/DashboardLayout";
import ListToolbar from "../../components/common/list/ListToolbar";

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
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
  reportPeriod: "Weekly",
  classification: "All Classifications",
  referralStatus: "All Referral Status",
  dateReferred: "",
};

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

const smoothAnimation = {
  duration: 850,
  easing: "easeOutQuart",
};

const REPORT_DATA = {
  weekly: {
    label: "Weekly Referrals",
    shortLabel: "Weekly",
    description:
      "Weekly summary of referrals, case records, referral status, and RHU feedback.",
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
    label: "Monthly Referrals",
    shortLabel: "Monthly",
    description:
      "Monthly summary of referrals, case records, completed cases, no-show cases, and RHU feedback.",
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

export default function BHCReports() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const currentReportKey = getReportModeKey(filters.reportPeriod);
  const currentReport = REPORT_DATA[currentReportKey] || REPORT_DATA.weekly;

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

  const classificationSummary = useMemo(
    () => buildClassificationSummary(filteredReferralLogbook),
    [filteredReferralLogbook],
  );

  const reportSummary = useMemo(() => {
    const completed = filteredReferralLogbook.filter(
      (log) => normalizeStatus(log.status) === "Completed",
    ).length;

    const totalRegisteredPatients = new Set(
      filteredReferralLogbook
        .map((log) =>
          String(log.name || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ).size;

    return {
      totalRegisteredPatients,
      totalReferrals: filteredReferralLogbook.length,
      referralsByCases: casesSummary.length,
      completedCases: completed,
      topCase: casesSummary[0]?.label || "No data",
    };
  }, [casesSummary, filteredReferralLogbook]);

  const casesChartData = useMemo(
    () => buildChiefComplaintComboData(casesSummary.slice(0, 8)),
    [casesSummary],
  );

  const classificationChartData = useMemo(
    () => buildClassificationPolarData(classificationSummary),
    [classificationSummary],
  );

  const dropdownFilters = [
    {
      key: "reportPeriod",
      label: "Reporting Period",
      value: filters.reportPeriod,
      options: ["Weekly", "Monthly"],
    },
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
    filters.reportPeriod !== DEFAULT_FILTERS.reportPeriod && {
      key: "reportPeriod",
      label: `Period: ${filters.reportPeriod}`,
    },
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

  function applyDropdownFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      reportPeriod: DEFAULT_FILTERS.reportPeriod,
      classification: "All Classifications",
      referralStatus: "All Referral Status",
      dateReferred: "",
    };

    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  function printAsPdf() {
    window.print();
  }

  return (
    <DashboardLayout role="bhc" title="Reports">
      <div className="space-y-4">
        <ListToolbar
          searchValue={filters.search}
          onSearchChange={(value) =>
            setFilters((prev) => ({ ...prev, search: value }))
          }
          searchPlaceholder="Search patient, tracking ID, chief complaint, or status..."
          chip={`${filteredReferralLogbook.length.toLocaleString()} ${currentReport.shortLabel} Referral${
            filteredReferralLogbook.length === 1 ? "" : "s"
          }`}
          filters={dropdownFilters}
          activeFilterCount={activeFilterCount}
          activeFilters={activeFilters}
          onApplyFilters={applyDropdownFilters}
          onClearFilters={clearFilters}
          onRemoveFilter={removeFilter}
          actions={
            <ReportActionButtons onPdf={printAsPdf} onPrint={printAsPdf} />
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title="Total Registered Patients"
            value={reportSummary.totalRegisteredPatients}
            icon={<UsersRound size={16} />}
            tone="slate"
          />

          <StatCard
            title="Total Referrals"
            value={reportSummary.totalReferrals}
            icon={<ClipboardList size={16} />}
            tone="red"
          />

          <StatCard
            title="Referrals by Cases"
            value={reportSummary.referralsByCases}
            icon={<BarChart3 size={16} />}
            tone="amber"
          />

          <StatCard
            title="Completed Cases"
            value={reportSummary.completedCases}
            icon={<SearchCheck size={16} />}
            tone="emerald"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0 space-y-4">
            <ReportChartCard
              title="Referrals by Cases"
              description={`${currentReport.shortLabel} referral count grouped by chief complaint or case.`}
              icon={<BarChart3 size={15} />}
              rightLabel="Case count"
            >
              <FixedChartBox height="h-[340px]">
                {casesSummary.length === 0 ? (
                  <EmptyChartState
                    icon={<BarChart3 size={24} />}
                    title="No case records"
                    message="No chief complaint records match the current filters."
                  />
                ) : (
                  <Chart
                    type="bar"
                    data={casesChartData}
                    options={getChiefComplaintComboOptions()}
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <ReportChartCard
              title="Referrals by Patient Classification"
              description="Referral count by patient classification."
              icon={<UsersRound size={15} />}
              rightLabel="Classification"
            >
              <FixedChartBox height="h-[280px]">
                {classificationSummary.length === 0 ? (
                  <EmptyChartState
                    icon={<UsersRound size={24} />}
                    title="No classification data"
                    message="Filtered records will show classification counts here."
                  />
                ) : (
                  <PolarArea
                    data={classificationChartData}
                    options={classificationPolarOptions}
                  />
                )}
              </FixedChartBox>
            </ReportChartCard>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReportActionButtons({ onPdf, onPrint }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
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

function normalizeDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function normalizeStatus(status) {
  const value = String(status || "").trim();
  const normalized = value.toLowerCase();

  if (normalized.includes("complete")) return "Completed";
  if (normalized.includes("monitor")) return "For Monitoring";
  if (normalized.includes("receive")) return "Received";
  if (normalized.includes("no-show")) return "No-Show";
  if (normalized.includes("pending")) return "Pending";

  return value || "Pending";
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
  if (!records.length) return [];

  const counts = records.reduce((acc, record) => {
    const key = normalizeComplaintLabel(record.chiefComplaint);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([label, value]) => ({
      label,
      value,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function buildClassificationSummary(records) {
  const counts = records.reduce((acc, record) => {
    const key = record.classification || "Unclassified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([label, value]) => ({
      label,
      value,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function buildChiefComplaintComboData(cases) {
  return {
    labels: cases.map((item) => item.label),
    datasets: [
      {
        type: "bar",
        label: "Cases",
        data: cases.map((item) => item.value),
        yAxisID: "y",
        backgroundColor: (context) =>
          getChartGradient(
            context,
            ["rgba(254, 226, 226, 0.96)", chartPalette.red],
            "vertical",
          ),
        borderColor: "rgba(185, 28, 28, 0.22)",
        borderWidth: 1,
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 42,
      },
    ],
  };
}

function getChiefComplaintComboOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: smoothAnimation,
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
      tooltip: {
        ...buildTooltipOptions(),
        callbacks: {
          label: (context) => {
            const value = context.parsed?.y ?? 0;
            return `Cases: ${formatNumber(value)} record(s)`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: chartPalette.slate,
          font: { size: 11, weight: "700" },
          maxRotation: 0,
          minRotation: 0,
          callback: function (value) {
            const label = this.getLabelForValue(value);
            return label.length > 14 ? `${label.slice(0, 13)}…` : label;
          },
        },
      },
      y: {
        type: "linear",
        position: "left",
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: chartPalette.slate,
          font: { size: 11, weight: "700" },
        },
        grid: { color: chartPalette.grid, drawBorder: false },
        title: {
          display: true,
          text: "Case count",
          color: chartPalette.muted,
          font: { size: 10, weight: "700" },
        },
      },
    },
  };
}

function buildClassificationPolarData(items) {
  return {
    labels: items.map((item) => item.label),
    datasets: [
      {
        label: "Cases",
        data: items.map((item) => item.value),
        backgroundColor: (context) => getPolarGradient(context),
        borderColor: "#FFFFFF",
        borderWidth: 3,
        hoverBorderWidth: 4,
      },
    ],
  };
}

const classificationPolarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    animateRotate: true,
    animateScale: true,
    duration: 850,
    easing: "easeOutQuart",
  },
  scales: {
    r: {
      beginAtZero: true,
      ticks: {
        display: false,
        precision: 0,
      },
      grid: {
        color: "rgba(226, 232, 240, 0.8)",
      },
      angleLines: {
        color: "rgba(226, 232, 240, 0.75)",
      },
      pointLabels: {
        color: chartPalette.slate,
        font: { size: 10, weight: "700" },
      },
    },
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
    tooltip: buildTooltipOptions("case(s)"),
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

function getPolarGradient(context) {
  const { chart, dataIndex } = context;
  const { ctx, chartArea } = chart;

  const fallbackColors = [
    chartPalette.red,
    chartPalette.amber,
    chartPalette.emerald,
    chartPalette.slate,
    chartPalette.blue,
    chartPalette.redMid,
  ];

  if (!chartArea) return fallbackColors[dataIndex % fallbackColors.length];

  const gradientSets = [
    ["#FEE2E2", chartPalette.red],
    ["#FFEDD5", chartPalette.amber],
    ["#D1FAE5", chartPalette.emerald],
    ["#E2E8F0", chartPalette.slate],
    ["#DBEAFE", chartPalette.blue],
    ["#FECACA", chartPalette.redMid],
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
          context.parsed?.r ??
          context.parsed ??
          context.raw ??
          0;

        return `${context.dataset?.label || "Total"}: ${formatNumber(
          value,
        )} ${suffix}`;
      },
    },
  };
}

function getReportModeKey(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("month")) return "monthly";

  return "weekly";
}

function formatNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString();
}
