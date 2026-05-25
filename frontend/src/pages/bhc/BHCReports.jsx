import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Filter,
  HeartPulse,
  Printer,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";

export default function BHCReports() {
  const referralStatus = [
    { label: "Pending", value: 12, percent: 26, tone: "slate" },
    { label: "Received", value: 8, percent: 17, tone: "blue" },
    { label: "For Monitoring", value: 6, percent: 13, tone: "amber" },
    { label: "Completed", value: 18, percent: 38, tone: "emerald" },
    { label: "No-Show", value: 3, percent: 6, tone: "red" },
  ];

  const referralCategories = [
    { code: "A1", label: "Emergency", value: 6, level: "Critical" },
    { code: "A2", label: "Urgent", value: 4, level: "High" },
    { code: "B1", label: "Routine", value: 12, level: "Moderate" },
    { code: "B2", label: "Standard", value: 5, level: "Moderate" },
    { code: "C1", label: "Follow-up", value: 3, level: "Low" },
    { code: "C2", label: "Non-urgent", value: 8, level: "Low" },
  ];

  const patientCategories = [
    { label: "General Consultation", value: 45, icon: <FileText size={15} /> },
    { label: "Children", value: 28, icon: <Users size={15} /> },
    { label: "Immunization", value: 22, icon: <CheckCircle2 size={15} /> },
    { label: "Senior Citizen", value: 18, icon: <Activity size={15} /> },
    { label: "Pregnant Patient", value: 15, icon: <HeartPulse size={15} /> },
  ];

  const weeklyReferrals = [
    { day: "Mon", value: 4 },
    { day: "Tue", value: 7 },
    { day: "Wed", value: 5 },
    { day: "Thu", value: 9 },
    { day: "Fri", value: 6 },
    { day: "Sat", value: 2 },
  ];

  const recentReports = [
    {
      title: "Weekly Referrals Sent",
      description: "Summary of referrals submitted by BHC this week.",
      date: "May 13, 2026",
    },
    {
      title: "Patients for Monitoring",
      description: "List of patients requiring follow-up or monitoring.",
      date: "May 13, 2026",
    },
    {
      title: "Referral Category Summary",
      description: "Breakdown of referrals based on triage category.",
      date: "May 12, 2026",
    },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .anim-card {
          opacity: 0;
          animation: fadeInUp 0.45s ease-out forwards;
        }
      `}</style>

      <DashboardLayout role="bhc" title="Reports">
        {/* Header */}
        <div
          className="anim-card mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-start"
          style={{ animationDelay: "0ms" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
              <BarChart3 size={20} />
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
                Reports
              </h1>
              <p className="mt-1 text-sm text-[#6B7280]">
                Clinical overview for patient records, referrals, monitoring,
                and BHC coordination.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-[#E8ECF0] bg-white px-4 py-2 text-xs font-semibold text-[#0B2E59] transition-all hover:bg-[#F8FAFC]">
              <Printer size={14} />
              Print
            </button>

            <button className="inline-flex items-center gap-2 rounded-lg bg-[#0B2E59] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[#092347]">
              <Download size={14} />
              Export Report
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <section
          className="anim-card mb-6 rounded-xl border border-[#E8ECF0] bg-white p-5"
          style={{ animationDelay: "60ms" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06] text-[#0B2E59]">
              <Filter size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Report Filters
              </h2>
              <p className="text-[11px] text-[#9CA3AF]">
                Adjust the reporting view based on date, status, and category.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <FilterField label="Date Range" icon={<CalendarDays size={13} />}>
              <select className="report-input">
                <option>This Month</option>
                <option>This Week</option>
                <option>Last Month</option>
                <option>Custom Range</option>
              </select>
            </FilterField>

            <FilterField label="Report Type">
              <select className="report-input">
                <option>All Reports</option>
                <option>Referral Summary</option>
                <option>Patient Monitoring</option>
                <option>Health Records</option>
              </select>
            </FilterField>

            <FilterField label="Referral Status">
              <select className="report-input">
                <option>All Status</option>
                <option>Pending</option>
                <option>Received</option>
                <option>For Monitoring</option>
                <option>Completed</option>
                <option>No-Show</option>
              </select>
            </FilterField>

            <FilterField label="Category">
              <select className="report-input">
                <option>All Categories</option>
                <option>A1</option>
                <option>A2</option>
                <option>B1</option>
                <option>B2</option>
                <option>C1</option>
                <option>C2</option>
              </select>
            </FilterField>

            <div className="flex items-end">
              <button className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-xs font-semibold text-white transition-all hover:bg-[#092347]">
                <RefreshCw size={13} />
                Generate
              </button>
            </div>
          </div>
        </section>

        <style>{`
          .report-input {
            height: 40px;
            width: 100%;
            border-radius: 0.75rem;
            border: 1px solid #E8ECF0;
            background: #FAFBFC;
            padding: 0 0.85rem;
            font-size: 0.875rem;
            outline: none;
          }
          .report-input:focus {
            border-color: rgba(11, 46, 89, 0.25);
            background: white;
            box-shadow: 0 0 0 4px rgba(11, 46, 89, 0.04);
          }
        `}</style>

        {/* Analytics Cards */}
        <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Patients"
            value="128"
            icon={<Users size={16} />}
            color="navy"
            helper="Registered BHC patients"
            delay={0}
          />
          <StatCard
            title="Records This Month"
            value="64"
            icon={<FileText size={16} />}
            color="blue"
            helper="Health record entries"
            delay={1}
          />
          <StatCard
            title="Referrals This Month"
            value="42"
            icon={<ClipboardList size={16} />}
            color="slate"
            helper="BHC-to-RHU referrals"
            delay={2}
          />
          <StatCard
            title="For Monitoring"
            value="8"
            icon={<HeartPulse size={16} />}
            color="amber"
            helper="Needs follow-up"
            delay={3}
          />
        </div>

        {/* Main Report Grid */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-6">
            <section
              className="anim-card rounded-xl border border-[#E8ECF0] bg-white p-6"
              style={{ animationDelay: "180ms" }}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#0B2E59]">
                    Referral Status Overview
                  </h2>
                  <p className="mt-1 text-xs text-[#9CA3AF]">
                    Status distribution of BHC-to-RHU referrals for the selected
                    period.
                  </p>
                </div>

                <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                  47 total cases
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
                    Most Common Status
                  </p>
                  <p className="mt-3 text-3xl font-bold tracking-tight text-[#0B2E59]">
                    Completed
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                    18 referrals were marked completed, meaning RHU feedback or
                    service outcome has been recorded.
                  </p>
                </div>

                <div className="space-y-3">
                  {referralStatus.map((item) => (
                    <StatusProgress key={item.label} item={item} />
                  ))}
                </div>
              </div>
            </section>

            <section
              className="anim-card rounded-xl border border-[#E8ECF0] bg-white p-6"
              style={{ animationDelay: "240ms" }}
            >
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Referral Category Triage Summary
                </h2>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Category-based breakdown for referral prioritization and RHU
                  coordination.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {referralCategories.map((item) => (
                  <TriageCard key={item.code} item={item} />
                ))}
              </div>
            </section>

            <section
              className="anim-card rounded-xl border border-[#E8ECF0] bg-white p-6"
              style={{ animationDelay: "300ms" }}
            >
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Clinical Coordination Insights
                </h2>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Human-readable interpretation of important report indicators.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <InsightCard
                  title="High-priority watch"
                  value="4 cases"
                  description="Review urgent and sensitive referral cases first."
                  tone="red"
                />
                <InsightCard
                  title="Monitoring load"
                  value="8 patients"
                  description="Follow-up reminders should be checked by BHC staff."
                  tone="amber"
                />
                <InsightCard
                  title="Completed referrals"
                  value="18 cases"
                  description="Review RHU feedback for continuity of care."
                  tone="emerald"
                />
              </div>
            </section>
          </div>

          {/* Right Side */}
          <aside className="space-y-6">
            <section
              className="anim-card rounded-xl border border-[#E8ECF0] bg-white p-6"
              style={{ animationDelay: "210ms" }}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#0B2E59]">
                    Weekly Referral Trend
                  </h2>
                  <p className="mt-1 text-xs text-[#9CA3AF]">
                    Daily referral activity.
                  </p>
                </div>

                <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                  <TrendingUp size={16} />
                </div>
              </div>

              <WeeklyLineChart data={weeklyReferrals} />
            </section>

            <section
              className="anim-card rounded-xl border border-[#E8ECF0] bg-white p-6"
              style={{ animationDelay: "270ms" }}
            >
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Patient Care Groups
                </h2>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Patient categories handled by the BHC.
                </p>
              </div>

              <div className="space-y-3">
                {patientCategories.map((item) => (
                  <CareGroupCard key={item.label} item={item} />
                ))}
              </div>
            </section>

            <section
              className="anim-card rounded-xl border border-[#E8ECF0] bg-white p-6"
              style={{ animationDelay: "330ms" }}
            >
              <div className="mb-5 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06] text-[#0B2E59]">
                  <FileText size={15} />
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-[#0B2E59]">
                    Recent Reports
                  </h2>
                  <p className="text-[10px] text-[#9CA3AF]">
                    Latest generated views
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {recentReports.map((report) => (
                  <div
                    key={report.title}
                    className="rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] p-4 transition-all hover:border-[#0B2E59]/20 hover:bg-white hover:shadow-sm"
                  >
                    <p className="text-xs font-semibold text-[#0B2E59]">
                      {report.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#6B7280]">
                      {report.description}
                    </p>
                    <p className="mt-2.5 text-[9px] font-semibold uppercase tracking-wider text-[#BCC3CD]">
                      {report.date}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <div
          className="anim-card mt-6 rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] px-5 py-4"
          style={{ animationDelay: "420ms" }}
        >
          <p className="text-xs leading-relaxed text-[#6B7280]">
            <span className="font-semibold text-[#4B5563]">Note:</span> Reports
            are simplified for BHC workers and healthcare staff. The goal is to
            make priority cases, monitoring load, and referral flow easier to
            understand at a glance.
          </p>
        </div>
      </DashboardLayout>
    </>
  );
}

function FilterField({ label, icon, children }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function StatCard({ title, value, icon, color = "navy", helper, delay = 0 }) {
  const map = {
    navy: {
      border: "border-t-[#0B2E59]",
      iconBg: "bg-[#0B2E59]/[0.06]",
      iconText: "text-[#0B2E59]",
    },
    blue: {
      border: "border-t-blue-500",
      iconBg: "bg-blue-50",
      iconText: "text-blue-600",
    },
    slate: {
      border: "border-t-slate-400",
      iconBg: "bg-slate-100",
      iconText: "text-slate-500",
    },
    amber: {
      border: "border-t-amber-400",
      iconBg: "bg-amber-50",
      iconText: "text-amber-600",
    },
  };

  const c = map[color] || map.navy;

  return (
    <div
      className={`anim-card rounded-xl border border-[#E8ECF0] border-t-2 ${c.border} bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md`}
      style={{ animationDelay: `${100 + delay * 70}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div
          className={`flex-shrink-0 rounded-lg p-2 ${c.iconBg} ${c.iconText}`}
        >
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0B2E59]">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-[#9CA3AF]">{helper}</p>
    </div>
  );
}

function StatusProgress({ item }) {
  const toneMap = {
    slate: {
      bar: "bg-slate-500",
      bg: "bg-slate-100",
      text: "text-slate-600",
    },
    blue: {
      bar: "bg-blue-600",
      bg: "bg-blue-50",
      text: "text-blue-700",
    },
    amber: {
      bar: "bg-amber-500",
      bg: "bg-amber-50",
      text: "text-amber-700",
    },
    emerald: {
      bar: "bg-emerald-600",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
    red: {
      bar: "bg-red-600",
      bg: "bg-red-50",
      text: "text-red-700",
    },
  };

  const tone = toneMap[item.tone] || toneMap.slate;

  return (
    <div className="rounded-xl border border-[#E8ECF0] bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#0B2E59]">{item.label}</p>
          <p className="text-[10px] text-[#9CA3AF]">{item.percent}% of cases</p>
        </div>

        <span
          className={`rounded-md px-2 py-0.5 text-xs font-bold ${tone.bg} ${tone.text}`}
        >
          {item.value}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[#F3F4F6]">
        <div
          className={`h-full rounded-full ${tone.bar}`}
          style={{ width: `${item.percent}%` }}
        />
      </div>
    </div>
  );
}

function WeeklyLineChart({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value));
  const width = 300;
  const height = 140;
  const chartTop = 14;
  const chartBottom = 112;
  const chartLeft = 16;
  const chartRight = 286;

  const points = data.map((item, index) => {
    const x =
      chartLeft + (index / (data.length - 1)) * (chartRight - chartLeft);
    const y = chartBottom - (item.value / maxValue) * (chartBottom - chartTop);

    return { ...item, x, y };
  });

  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
        <line x1="16" y1="112" x2="286" y2="112" stroke="#E8ECF0" />
        <line
          x1="16"
          y1="80"
          x2="286"
          y2="80"
          stroke="#F3F4F6"
          strokeDasharray="4 4"
        />
        <line
          x1="16"
          y1="48"
          x2="286"
          y2="48"
          stroke="#F3F4F6"
          strokeDasharray="4 4"
        />

        <polyline
          points={pointString}
          fill="none"
          stroke="#0B2E59"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point) => (
          <g key={point.day}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#FFFFFF"
              stroke="#0B2E59"
              strokeWidth="3"
            />
            <text
              x={point.x}
              y={point.y - 12}
              textAnchor="middle"
              className="fill-[#0B2E59] text-[9px] font-bold"
            >
              {point.value}
            </text>
            <text
              x={point.x}
              y="132"
              textAnchor="middle"
              className="fill-[#6B7280] text-[9px] font-semibold"
            >
              {point.day}
            </text>
          </g>
        ))}
      </svg>

      <div className="rounded-lg bg-blue-50 px-4 py-3">
        <p className="text-xs leading-relaxed text-[#4B5563]">
          Peak referral activity is on Thursday. This helps BHC staff identify
          busy referral days and prepare patient coordination earlier.
        </p>
      </div>
    </div>
  );
}

function TriageCard({ item }) {
  const levelMap = {
    Critical: {
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-100",
      icon: <AlertTriangle size={14} />,
    },
    High: {
      bg: "bg-orange-50",
      text: "text-orange-700",
      border: "border-orange-100",
      icon: <AlertTriangle size={14} />,
    },
    Moderate: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-100",
      icon: <Activity size={14} />,
    },
    Low: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-100",
      icon: <CheckCircle2 size={14} />,
    },
  };

  const style = levelMap[item.level] || levelMap.Moderate;

  return (
    <div
      className={`rounded-xl border ${style.border} ${style.bg} p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-black tracking-tight text-[#0B2E59]">
            {item.code}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#4B5563]">
            {item.label}
          </p>
        </div>

        <div className={`rounded-lg bg-white/80 p-2 ${style.text}`}>
          {style.icon}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span
          className={`rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-semibold ${style.text}`}
        >
          {item.level}
        </span>

        <span className="text-lg font-bold text-[#0B2E59]">{item.value}</span>
      </div>
    </div>
  );
}

function CareGroupCard({ item }) {
  const max = 45;
  const percent = Math.round((item.value / max) * 100);

  return (
    <div className="rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] p-4 transition-all hover:bg-white hover:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06] text-[#0B2E59]">
            {item.icon}
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#0B2E59]">
              {item.label}
            </p>
            <p className="text-[10px] text-[#9CA3AF]">
              {percent}% of highest group
            </p>
          </div>
        </div>

        <p className="text-lg font-bold text-[#0B2E59]">{item.value}</p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8ECF0]">
        <div
          className="h-full rounded-full bg-[#0B2E59]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function InsightCard({ title, value, description, tone }) {
  const map = {
    red: "border-red-100 bg-red-50 text-red-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  };

  return (
    <div className={`rounded-xl border p-4 ${map[tone] || map.amber}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider">
        {title}
      </p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-[#4B5563]">
        {description}
      </p>
    </div>
  );
}
