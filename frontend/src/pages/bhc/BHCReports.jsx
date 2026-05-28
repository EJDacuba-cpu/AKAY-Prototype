import {
  ClipboardList,
  HeartPulse,
  Printer,
  Users,
  BookOpen,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  RefreshCw,
  CheckCircle2, // Added missing import
  XCircle, // Added missing import
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import StatCard from "../../components/common/cards/StatsCard";

export default function BHCReports() {
  const referralStatus = [
    { label: "Pending", value: 12, percent: 26, tone: "slate" },
    { label: "Received", value: 8, percent: 17, tone: "blue" },
    { label: "For Monitoring", value: 6, percent: 13, tone: "amber" },
    { label: "Completed", value: 18, percent: 38, tone: "emerald" },
    { label: "No-Show", value: 3, percent: 6, tone: "red" },
  ];

  const referralCategories = [
    {
      label: "Maternal Cases",
      value: 8,
      monthly: 32,
      percent: 19,
      tone: "pink",
    },
    {
      label: "Senior Citizen Cases",
      value: 4,
      monthly: 16,
      percent: 10,
      tone: "slate",
    },
    { label: "A1 Cases", value: 6, monthly: 24, percent: 14, tone: "red" },
    { label: "A2 Cases", value: 4, monthly: 16, percent: 10, tone: "orange" },
    { label: "B1 Cases", value: 12, monthly: 48, percent: 29, tone: "blue" },
    { label: "B2 Cases", value: 5, monthly: 20, percent: 12, tone: "blue" },
    {
      label: "High-Risk Cases",
      value: 4,
      monthly: 16,
      percent: 10,
      tone: "red",
    },
    {
      label: "Monitoring Cases",
      value: 6,
      monthly: 24,
      percent: 14,
      tone: "amber",
    },
  ];

  const referralLogbook = [
    {
      name: "Maria Santos",
      category: "A1",
      status: "Completed",
      date: "May 13, 2026",
      rhu: "RHU Central",
      monitoring: "Stable",
      followUp: "May 20, 2026",
      remarks: "Normal delivery",
    },
    {
      name: "Juan Dela Cruz",
      category: "B1",
      status: "Pending",
      date: "May 12, 2026",
      rhu: "RHU North",
      monitoring: "For Follow-up",
      followUp: "May 19, 2026",
      remarks: "Hypertension check",
    },
    {
      name: "Ana Reyes",
      category: "Maternal",
      status: "For Monitoring",
      date: "May 12, 2026",
      rhu: "RHU Central",
      monitoring: "High Risk",
      followUp: "May 15, 2026",
      remarks: "Pre-eclampsia risk",
    },
    {
      name: "Pedro Lopez",
      category: "B2",
      status: "Received",
      date: "May 11, 2026",
      rhu: "RHU South",
      monitoring: "Routine",
      followUp: "June 11, 2026",
      remarks: "Diabetes maintenance",
    },
    {
      name: "Rosa Garcia",
      category: "Senior Citizen",
      status: "Completed",
      date: "May 10, 2026",
      rhu: "RHU North",
      monitoring: "Stable",
      followUp: "Aug 10, 2026",
      remarks: "Follow-up clear",
    },
    {
      name: "Carlos Mendoza",
      category: "A2",
      status: "Pending",
      date: "May 10, 2026",
      rhu: "RHU Central",
      monitoring: "Urgent",
      followUp: "May 13, 2026",
      remarks: "Chest pain evaluation",
    },
  ];

  const weeklyReconciliation = [
    { label: "Total Weekly Referrals", value: 33 },
    { label: "Completed Referrals", value: 18 },
    { label: "Pending Referrals", value: 12 },
    { label: "Monitoring Cases", value: 6 },
    { label: "No-Show Cases", value: 3 },
    { label: "Completion Rate", value: "54.5%", isRate: true },
  ];

  const weeklyReferrals = [
    { day: "Mon", value: 4 },
    { day: "Tue", value: 7 },
    { day: "Wed", value: 5 },
    { day: "Thu", value: 9 },
    { day: "Fri", value: 6 },
    { day: "Sat", value: 2 },
  ];

  return (
    <DashboardLayout role="bhc" title="Reports">
      <div className="space-y-4">
        {/* Unified Filters & Actions Toolbar */}
        <div className="rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
          {/* Smart Filters */}
          <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3 lg:grid-cols-6 border-b border-[#F3F4F6]">
            <select className="h-8 w-full appearance-none rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] text-[#1F2937] outline-none focus:border-[#9CA3AF]">
              <option>This Month</option>
              <option>This Week</option>
              <option>Last Month</option>
              <option>Custom Range</option>
            </select>
            <select className="h-8 w-full appearance-none rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] text-[#1F2937] outline-none focus:border-[#9CA3AF]">
              <option>All Categories</option>
              <option>Maternal</option>
              <option>Senior Citizen</option>
              <option>A1</option>
              <option>A2</option>
              <option>B1</option>
              <option>B2</option>
            </select>
            <select className="h-8 w-full appearance-none rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] text-[#1F2937] outline-none focus:border-[#9CA3AF]">
              <option>All Status</option>
              <option>Pending</option>
              <option>Received</option>
              <option>For Monitoring</option>
              <option>Completed</option>
              <option>No-Show</option>
            </select>
            <select className="h-8 w-full appearance-none rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] text-[#1F2937] outline-none focus:border-[#9CA3AF]">
              <option>All Barangays</option>
              <option>Barangay 1</option>
              <option>Barangay 2</option>
              <option>Barangay 3</option>
            </select>
            <select className="h-8 w-full appearance-none rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] text-[#1F2937] outline-none focus:border-[#9CA3AF]">
              <option>All Midwives</option>
              <option>Midwife Cruz</option>
              <option>Midwife Reyes</option>
            </select>
            <select className="h-8 w-full appearance-none rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] text-[#1F2937] outline-none focus:border-[#9CA3AF]">
              <option>All RHU Branches</option>
              <option>RHU Central</option>
              <option>RHU North</option>
              <option>RHU South</option>
            </select>
          </div>

          {/* Automated Report Generation Actions */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-[#F9FAFB]">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Generate:
            </span>
            <button className="inline-flex items-center gap-1 rounded-md bg-[#0B2E59] px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#092347]">
              <RefreshCw size={11} /> Weekly Report
            </button>
            <button className="inline-flex items-center gap-1 rounded-md bg-[#0B2E59] px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#092347]">
              <RefreshCw size={11} /> Monthly Report
            </button>
            <button className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]">
              Referral Summary
            </button>
            <button className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]">
              Monitoring Report
            </button>

            <div className="mx-1 h-4 w-px bg-[#E5E7EB]"></div>

            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Export:
            </span>
            <button className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]">
              <FileText size={11} className="text-red-500" /> PDF
            </button>
            <button className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]">
              <FileSpreadsheet size={11} className="text-emerald-600" /> Excel
            </button>
            <button className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]">
              <Printer size={11} /> Print
            </button>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            title="Total Patients"
            value="128"
            icon={<Users size={16} />}
            color="navy"
          />
          <StatCard
            title="Total Referrals"
            value="47"
            icon={<ClipboardList size={16} />}
            color="slate"
          />
          <StatCard
            title="Completed"
            value="18"
            icon={<CheckCircle2 size={16} />}
            color="emerald"
          />
          <StatCard
            title="Monitoring"
            value="6"
            icon={<HeartPulse size={16} />}
            color="amber"
          />
          <StatCard
            title="No-Show"
            value="3"
            icon={<XCircle size={16} />}
            color="red"
          />
          <StatCard
            title="High-Risk"
            value="4"
            icon={<AlertTriangle size={16} />}
            color="red"
          />
        </div>

        {/* Main Analytics Grid */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Referral Status Overview */}
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Referral Status Overview
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                47 total cases
              </span>
            </div>
            <div className="space-y-2.5">
              {referralStatus.map((item) => (
                <StatusProgress key={item.label} item={item} />
              ))}
            </div>
          </div>

          {/* Automated Case Categories */}
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Automated Case Categories
              </h2>
              <div className="flex items-center gap-2 text-[10px] font-medium text-[#9CA3AF]">
                <span>Weekly</span> / <span>Monthly</span>
              </div>
            </div>
            <div className="space-y-2">
              {referralCategories.map((item) => (
                <CaseCategoryCard key={item.label} item={item} />
              ))}
            </div>
          </div>
        </div>

        {/* Digital Referral Logbook Table */}
        <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <BookOpen size={14} className="text-[#0B2E59]" />
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Digital Referral Logbook
              </h2>
            </div>
            <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
              Automated Entry
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <tr>
                  <th className="px-4 py-2 whitespace-nowrap">Patient Name</th>
                  <th className="px-4 py-2 whitespace-nowrap">Category</th>
                  <th className="px-4 py-2 whitespace-nowrap">Status</th>
                  <th className="px-4 py-2 whitespace-nowrap">Date Referred</th>
                  <th className="px-4 py-2 whitespace-nowrap">Assigned RHU</th>
                  <th className="px-4 py-2 whitespace-nowrap">Monitoring</th>
                  <th className="px-4 py-2 whitespace-nowrap">
                    Follow-Up Schedule
                  </th>
                  <th className="px-4 py-2 whitespace-nowrap">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {referralLogbook.map((log) => (
                  <tr
                    key={log.name}
                    className="transition-colors hover:bg-[#F9FAFB]"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap font-medium text-[#1F2937]">
                      {log.name}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                        {log.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[#6B7280]">
                      {log.status}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[#6B7280]">
                      {log.date}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[#6B7280]">
                      {log.rhu}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-medium ${
                          log.monitoring === "Stable" ||
                          log.monitoring === "Routine"
                            ? "text-emerald-600"
                            : log.monitoring === "For Follow-up"
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {log.monitoring}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[#6B7280]">
                      {log.followUp}
                    </td>
                    <td className="max-w-[150px] truncate px-4 py-2.5 whitespace-nowrap text-[11px] text-[#9CA3AF]">
                      {log.remarks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Grid: Activity & Reconciliation */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Weekly Activity */}
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-[#0B2E59]">
              Weekly Referral Activity
            </h2>
            <WeeklyLineChart data={weeklyReferrals} />
          </div>

          {/* Automated Reconciliation */}
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-[#0B2E59]">
              Automated Weekly Reconciliation
            </h2>
            <div className="overflow-hidden rounded-md border border-[#E5E7EB]">
              {weeklyReconciliation.map((item, index) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between px-4 py-3 ${index !== weeklyReconciliation.length - 1 ? "border-b border-[#F3F4F6]" : ""} ${
                    item.isRate ? "bg-[#F9FAFB]" : ""
                  }`}
                >
                  <p className="text-xs text-[#374151]">{item.label}</p>
                  {item.isRate ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E5E7EB]">
                        <div className="h-full w-[54.5%] rounded-full bg-[#0B2E59]" />
                      </div>
                      <span className="text-xs font-bold tabular-nums text-[#0B2E59]">
                        {item.value}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold tabular-nums text-[#0B2E59]">
                      {item.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#9CA3AF]">
              Auto-generated summary replacing manual weekly logbook counting
              for midwife sign-off.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ── Helper Components ── */

function StatusProgress({ item }) {
  const toneMap = {
    slate: { bar: "bg-slate-500", bg: "bg-slate-100", text: "text-slate-600" },
    blue: { bar: "bg-blue-600", bg: "bg-blue-50", text: "text-blue-700" },
    amber: { bar: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
    emerald: {
      bar: "bg-emerald-600",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
    red: { bar: "bg-red-600", bg: "bg-red-50", text: "text-red-700" },
  };
  const tone = toneMap[item.tone] || toneMap.slate;

  return (
    <div className="flex items-center gap-3 rounded-md border border-[#F3F4F6] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-[#374151]">{item.label}</p>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.bg} ${tone.text}`}
          >
            {item.value}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
          <div
            className={`h-full rounded-full ${tone.bar}`}
            style={{ width: `${item.percent}%` }}
          />
        </div>
      </div>
      <span className="w-8 text-right text-[11px] tabular-nums text-[#9CA3AF]">
        {item.percent}%
      </span>
    </div>
  );
}

function CaseCategoryCard({ item }) {
  const toneMap = {
    red: "bg-red-500",
    orange: "bg-orange-500",
    blue: "bg-blue-600",
    slate: "bg-slate-500",
    pink: "bg-pink-500",
    amber: "bg-amber-500",
  };
  const barColor = toneMap[item.tone] || "bg-slate-500";

  return (
    <div className="flex items-center gap-3 rounded-md border border-[#F3F4F6] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-[#374151]">{item.label}</p>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-semibold text-[#0B2E59]">
              {item.value} <span className="font-normal text-[#9CA3AF]">W</span>
            </span>
            <span className="font-medium text-[#6B7280]">
              {item.monthly}{" "}
              <span className="font-normal text-[#9CA3AF]">M</span>
            </span>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${item.percent}%` }}
          />
        </div>
      </div>
      <span className="w-8 text-right text-[11px] tabular-nums text-[#9CA3AF]">
        {item.percent}%
      </span>
    </div>
  );
}

function WeeklyLineChart({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value));
  const width = 280;
  const height = 120;
  const chartTop = 10;
  const chartBottom = 95;
  const chartLeft = 10;
  const chartRight = 270;

  const points = data.map((item, index) => {
    const x =
      chartLeft + (index / (data.length - 1)) * (chartRight - chartLeft);
    const y = chartBottom - (item.value / maxValue) * (chartBottom - chartTop);
    return { ...item, x, y };
  });

  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <line x1="10" y1="95" x2="270" y2="95" stroke="#F3F4F6" />
      <polyline
        points={pointString}
        fill="none"
        stroke="#0B2E59"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point) => (
        <g key={point.day}>
          <circle
            cx={point.x}
            cy={point.y}
            r="3"
            fill="#FFFFFF"
            stroke="#0B2E59"
            strokeWidth="2"
          />
          <text
            x={point.x}
            y={point.y - 8}
            textAnchor="middle"
            className="fill-[#0B2E59] text-[8px] font-semibold"
          >
            {point.value}
          </text>
          <text
            x={point.x}
            y="110"
            textAnchor="middle"
            className="fill-[#9CA3AF] text-[8px]"
          >
            {point.day}
          </text>
        </g>
      ))}
    </svg>
  );
}
