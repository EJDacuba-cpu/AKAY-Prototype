import {
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  FileText,
  HeartPulse,
  Pill,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";

import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

/* Layout */
import DashboardLayout from "../../components/layout/DashboardLayout";

/* Cards */
import SideCard from "../../components/common/cards/SideCard";
import MedicineAlert from "../../components/common/cards/MedicineAlert";

/* Services */
import {
  getDashboardStats,
  getMedicineAlerts,
  getRecentReferrals,
} from "../../services/dashboardService";
import {
  formatDoctorAvailabilityDate,
  formatDoctorAvailabilitySummary,
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
} from "../../services/doctorAvailability";
import { getRhuVolumeSnapshot } from "../../services/volumeService";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const ACTIVE_REFERRAL_STATUSES = new Set([
  "Pending",
  "Received",
  "For Monitoring",
  "No-Show",
]);

function getTopChiefComplaints(referrals) {
  if (!Array.isArray(referrals) || referrals.length === 0) return [];

  const counts = referrals.reduce((acc, referral) => {
    const complaint = getReferralConcern(referral);
    if (!complaint || complaint === "No chief complaint recorded") return acc;

    const key = String(complaint).trim();
    if (!key) return acc;

    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

const stagger = (index) => ({
  animationDelay: `${index * 65}ms`,
});

export default function BHCDashboard() {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [medicineAlerts, setMedicineAlerts] = useState([]);
  const [doctorAvailability, setDoctorAvailability] = useState(() =>
    getDoctorAvailability(),
  );
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);

        const [statsData, referralsData, medicineData] = await Promise.all([
          getDashboardStats(),
          getRecentReferrals(),
          getMedicineAlerts(),
        ]);

        setStats(statsData || {});
        setReferrals(Array.isArray(referralsData) ? referralsData : []);
        setMedicineAlerts(Array.isArray(medicineData) ? medicineData : []);
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  useEffect(() => {
    return listenDoctorAvailabilityUpdates(setDoctorAvailability);
  }, []);

  const uniqueReferrals = useMemo(
    () => getUniqueReferrals(referrals),
    [referrals],
  );

  const rhuVolumeSnapshot = getRhuVolumeSnapshot();
  const userName = useMemo(() => getCurrentUserDisplayName(), []);

  const activeReferrals = useMemo(() => {
    return uniqueReferrals
      .filter((referral) =>
        ACTIVE_REFERRAL_STATUSES.has(getReferralStatus(referral)),
      )
      .sort(sortByReferralDateDesc)
      .slice(0, 6);
  }, [uniqueReferrals]);

  const followUpItems = useMemo(() => {
    return activeReferrals
      .filter((referral) =>
        ["Received", "For Monitoring", "No-Show"].includes(
          getReferralStatus(referral),
        ),
      )
      .slice(0, 4);
  }, [activeReferrals]);

  if (loading || !stats) {
    return (
      <DashboardLayout role="bhc" title="Dashboard">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="rounded-xl border border-[#FEE2E2] bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-semibold text-[#B91C1C]">
              Loading BHC workboard...
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Dashboard">
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <BHCWorkboardHeader userName={userName} now={now} />

        <CareSnapshot stats={stats} />

        <RhuVolumeWorkloadPanel snapshot={rhuVolumeSnapshot} />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <ChiefComplaintSummaryCard
              activeCount={activeReferrals.length}
              referrals={activeReferrals}
            />
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <RHUReadinessCard
              availability={doctorAvailability}
              medicineAlerts={medicineAlerts}
            />

            <MedicineAvailabilityCard medicineAlerts={medicineAlerts} />
          </aside>
        </section>
      </div>
    </DashboardLayout>
  );
}

function BHCWorkboardHeader({ userName, now }) {
  const greeting = getGreeting(now);
  const today = formatToday(now);
  const currentTime = formatCurrentTime(now);

  return (
    <section className="anim-fade-up" style={stagger(0)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#B91C1C]">
            <span>{today}</span>
            <span className="h-1 w-1 rounded-full bg-[#FCA5A5]" />
            <span>{currentTime}</span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-[#0F172A] md:text-3xl">
            {greeting}, {userName}
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#64748B]">
            Monitor today&apos;s BHC referral status, RHU workload, follow-up
            watchlist, and medicine/doctor readiness in one clean view.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <HeaderAction
            to="/bhc/patients/add"
            icon={<UserPlus size={14} />}
            label="Register Patient"
            primary
          />
        </div>
      </div>
    </section>
  );
}

function HeaderAction({ to, icon, label, primary = false }) {
  return (
    <Link
      to={to}
      className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold transition-all ${
        primary
          ? "bg-[#B91C1C] text-white shadow-sm hover:-translate-y-0.5 hover:bg-[#991B1B]"
          : "border border-[#FECACA] bg-white text-[#991B1B] hover:-translate-y-0.5 hover:bg-[#FEF2F2]"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

function CareSnapshot({ stats }) {
  const cards = [
    {
      title: "Patients in Registry",
      value: safeNumber(stats.totalPatients),
      description: "BHC patient profiles",
      icon: <Users size={17} />,
      tone: "red",
    },
    {
      title: "Health Records",
      value: safeNumber(stats.healthRecords),
      description: "saved visit records",
      icon: <FileText size={17} />,
      tone: "slate",
    },
    {
      title: "Pending Referrals",
      value: safeNumber(stats.pendingReferrals),
      description: "waiting for RHU",
      icon: <ClipboardList size={17} />,
      tone: "slate",
    },
    {
      title: "For Monitoring",
      value: safeNumber(stats.monitoringPatients),
      description: "needs follow-up watch",
      icon: <HeartPulse size={17} />,
      tone: "amber",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card, index) => (
        <div
          key={card.title}
          className="anim-fade-up group relative overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#FECACA] hover:shadow-md"
          style={stagger(index + 1)}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#B91C1C] via-[#DC2626] to-[#FCA5A5] opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                {card.title}
              </p>
              <p className="mt-3 text-xl font-black tabular-nums text-[#0F172A]">
                {card.value}
              </p>
              <p className="mt-1 truncate text-[11px] font-medium text-[#64748B]">
                {card.description}
              </p>
            </div>
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${getMetricTone(card.tone)}`}
            >
              {card.icon}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}

function ChiefComplaintSummaryCard({ activeCount, referrals }) {
  const topComplaints = getTopChiefComplaints(referrals);
  const chartData = {
    labels: topComplaints.map((item) => item.label),
    datasets: [
      {
        label: "Cases",
        data: topComplaints.map((item) => item.value),
        backgroundColor: (context) => {
          const { ctx, chartArea } = context.chart;
          if (!chartArea) return "rgba(185, 28, 28, 0.82)";

          const gradient = ctx.createLinearGradient(0, 0, chartArea.right, 0);
          gradient.addColorStop(0, "rgba(254, 226, 226, 0.95)");
          gradient.addColorStop(0.55, "rgba(220, 38, 38, 0.82)");
          gradient.addColorStop(1, "rgba(185, 28, 28, 0.96)");
          return gradient;
        },
        borderColor: "#B91C1C",
        borderWidth: 1,
        borderRadius: 10,
        borderSkipped: false,
        barThickness: 24,
        maxBarThickness: 28,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 700,
      easing: "easeOutQuart",
    },
    indexAxis: "y",
    layout: {
      padding: {
        top: 4,
        right: 10,
        bottom: 4,
        left: 0,
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "#0F172A",
        titleColor: "#FFFFFF",
        bodyColor: "#E2E8F0",
        displayColors: false,
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (context) => `${context.parsed.x || 0} case(s)`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grace: "15%",
        ticks: {
          precision: 0,
          color: "#64748B",
          font: {
            size: 11,
            weight: 700,
          },
        },
        grid: {
          color: "rgba(226, 232, 240, 0.9)",
          drawBorder: false,
        },
        border: {
          display: false,
        },
      },
      y: {
        ticks: {
          color: "#334155",
          font: {
            size: 11,
            weight: 800,
          },
          callback: function (value) {
            const label = this.getLabelForValue(value);
            return label.length > 22 ? `${label.slice(0, 22)}...` : label;
          },
        },
        grid: {
          display: false,
          drawBorder: false,
        },
        border: {
          display: false,
        },
      },
    },
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#F1F5F9] bg-[#FFF7F7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black text-[#0F172A]">
            Chief Complaint Summary
          </h2>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[#94A3B8]">
            Top reported complaints from active BHC referrals that still need
            tracking.
          </p>
        </div>

        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#B91C1C] shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#B91C1C]" />
          {activeCount} active
        </span>
      </div>

      <div className="p-4">
        {topComplaints.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-4 text-center">
            <div>
              <ClipboardList
                className="mx-auto mb-2 text-[#CBD5E1]"
                size={28}
              />
              <p className="text-sm font-bold text-[#334155]">
                No chief complaints to summarize
              </p>
              <p className="mt-1 text-xs text-[#94A3B8]">
                Active referrals with chief complaints will appear in this
                chart.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative h-[260px] w-full overflow-hidden rounded-xl border border-[#F1F5F9] bg-[#F8FAFC]/60 p-3">
            <Bar data={chartData} options={chartOptions} />
          </div>
        )}
      </div>
    </section>
  );
}

function RhuVolumeWorkloadPanel({ snapshot }) {
  const status = getVolumeStatus(snapshot);
  const score = getVolumeScore(snapshot);
  const percent = getVolumePercent(snapshot, score);
  const tone = getVolumeTone(status);
  const counts = [
    {
      label: "Incoming referrals",
      value: getVolumeCount(snapshot, [
        "incomingReferralsToday",
        "incomingReferrals",
        "referralsToday",
      ]),
    },
    {
      label: "Priority cases",
      value: getVolumeCount(snapshot, [
        "highPriorityReferrals",
        "urgentReferrals",
        "priorityReferrals",
      ]),
    },
    {
      label: "Walk-in patients",
      value: getVolumeCount(snapshot, [
        "walkInPatientsToday",
        "walkInsToday",
        "walkIns",
      ]),
    },
    {
      label: "For monitoring",
      value: getVolumeCount(snapshot, [
        "patientsForMonitoring",
        "monitoringPatients",
        "forMonitoring",
      ]),
    },
  ];

  return (
    <section
      className="anim-fade-up overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm"
      style={stagger(5)}
    >
      <div className="flex flex-col gap-2 border-b border-[#F1F5F9] bg-[#FFF7F7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-[#0F172A]">
            RHU Patient Volume
          </h2>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            Based on today&apos;s RHU workload before sending referrals.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#B91C1C] shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live workload
        </span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <div className={`rounded-xl border p-4 ${tone.panel}`}>
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}
            >
              <HeartPulse size={18} />
            </span>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#94A3B8]">
                Current status
              </p>
              <p className="mt-1 text-2xl font-black tracking-tight text-[#0F172A]">
                {status} Volume
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#64748B]">
                {getVolumeMessage(status)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC]/70 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#94A3B8]">
                  Workload score
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Based on referrals, walk-ins, priority cases, and monitoring.
                </p>
              </div>

              <span className="text-2xl font-black tabular-nums text-[#0F172A]">
                {score}
              </span>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-[#E5E7EB]">
              <div
                className={`h-full rounded-full ${tone.bar}`}
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
              <span>Low</span>
              <span>Normal</span>
              <span>High</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {counts.map((item) => (
              <div
                key={item.label}
                className="min-w-0 rounded-xl border border-[#F1F5F9] bg-white px-3 py-3 shadow-sm"
              >
                <p className="truncate text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                  {item.label}
                </p>
                <p className="mt-1 text-xl font-black tabular-nums text-[#0F172A]">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RHUReadinessCard({ availability, medicineAlerts }) {
  const unavailableMedicines = medicineAlerts.filter((medicine) =>
    String(medicine.status || "")
      .toLowerCase()
      .includes("unavailable"),
  ).length;

  return (
    <SideCard title="RHU Readiness" badge="coordination">
      <div className="space-y-3">
        <div className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C]">
              <Stethoscope size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    availability.status === "Not Available"
                      ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
                      : "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
                  }`}
                >
                  {availability.status}
                </span>
                <span className="text-[11px] font-bold text-[#64748B]">
                  {availability.availableDoctorCount} of{" "}
                  {availability.totalDoctorCount}
                </span>
              </div>
              <p className="mt-2 text-xs font-bold text-[#334155]">
                {formatDoctorAvailabilitySummary(availability)}.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
                {availability.note || "No RHU note provided."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniReadinessMetric
            label="Medicine alerts"
            value={medicineAlerts.length}
            icon={<Pill size={14} />}
          />
          <MiniReadinessMetric
            label="Unavailable meds"
            value={unavailableMedicines}
            icon={<Pill size={14} />}
          />
        </div>

        <p className="text-[10px] font-medium text-[#94A3B8]">
          Updated by {availability.updatedBy || "RHU Staff"} ·{" "}
          {formatDoctorAvailabilityDate(availability.updatedAt)}
        </p>
      </div>
    </SideCard>
  );
}

function MiniReadinessMetric({ label, value, icon }) {
  return (
    <div className="rounded-xl border border-[#F1F5F9] bg-white p-3">
      <div className="mb-2 flex items-center justify-between text-[#B91C1C]">
        {icon}
        <span className="text-lg font-black tabular-nums text-[#0F172A]">
          {value}
        </span>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </p>
    </div>
  );
}

function MedicineAvailabilityCard({ medicineAlerts }) {
  return (
    <SideCard
      title="Medicine Availability"
      badge={`${medicineAlerts.length} items`}
    >
      <p className="mb-4 text-xs leading-relaxed text-[#94A3B8]">
        Read-only RHU medicine status for referral coordination.
      </p>

      {medicineAlerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-4 py-6 text-center">
          <Pill className="mx-auto mb-2 text-[#CBD5E1]" size={26} />
          <p className="text-xs font-semibold text-[#64748B]">
            No medicine alerts
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {medicineAlerts.slice(0, 3).map((medicine) => (
            <MedicineAlert
              key={medicine.name}
              name={medicine.name}
              status={medicine.status}
              qty={medicine.qty}
            />
          ))}
        </div>
      )}

      <Link
        to="/bhc/medicine-availability"
        className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#991B1B]"
      >
        View Medicine Availability
        <ArrowRight size={13} />
      </Link>
    </SideCard>
  );
}

function ReferralStatusBadge({ status }) {
  const map = {
    Pending: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Received: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "For Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "No-Show": "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
    Completed: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
  };

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
        map[status] || map.Pending
      }`}
    >
      {status || "Pending"}
    </span>
  );
}

function getCurrentUserDisplayName() {
  if (typeof window === "undefined") return "BHC Worker";

  const possibleKeys = ["akay_user", "user", "currentUser", "authUser"];

  for (const key of possibleKeys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const user = JSON.parse(raw);
      const name =
        user?.fullName ||
        user?.full_name ||
        user?.name ||
        user?.displayName ||
        user?.profile?.name ||
        user?.profile?.fullName;

      if (name) return firstNameOnly(name);
    } catch {
      // Ignore malformed localStorage entries and use the default label.
    }
  }

  return "BHC Worker";
}

function firstNameOnly(name) {
  return String(name).trim().split(/\s+/)[0] || "BHC Worker";
}

function getGreeting(date) {
  const hour = date.getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatToday(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrentTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getVolumeStatus(snapshot) {
  const raw =
    snapshot?.status ||
    snapshot?.volumeStatus ||
    snapshot?.currentStatus ||
    snapshot?.level ||
    "Low";
  const normalized = String(raw).trim().toLowerCase();

  if (normalized.includes("high")) return "High";
  if (normalized.includes("normal") || normalized.includes("moderate")) {
    return "Normal";
  }
  return "Low";
}

function getVolumeScore(snapshot) {
  const value =
    snapshot?.workloadScore ??
    snapshot?.score ??
    snapshot?.loadScore ??
    snapshot?.capacityScore ??
    0;
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;
  return Number.isInteger(parsed) ? parsed : Number(parsed.toFixed(1));
}

function getVolumePercent(snapshot, score) {
  const value =
    snapshot?.capacityPercent ??
    snapshot?.percent ??
    snapshot?.usagePercent ??
    (score / 25) * 100;
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function getVolumeCount(snapshot, keys) {
  for (const key of keys) {
    const directValue = snapshot?.[key];
    const nestedValue = snapshot?.counts?.[key] ?? snapshot?.components?.[key];
    const value = directValue ?? nestedValue;
    const parsed = Number(value);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function getVolumeMessage(status) {
  const map = {
    Low: "RHU currently has manageable patient flow and can accommodate referrals efficiently.",
    Normal:
      "RHU has moderate activity. Referrals can proceed, but BHC should monitor updates.",
    High: "RHU workload is high. BHC should prioritize urgent referrals and check availability first.",
  };

  return map[status] || map.Low;
}

function getVolumeTone(status) {
  const map = {
    Low: {
      panel: "border-emerald-100 bg-emerald-50/55",
      icon: "bg-white text-[#B91C1C] ring-1 ring-emerald-100",
      badge: "bg-emerald-100 text-emerald-700",
      bar: "bg-emerald-500",
    },
    Normal: {
      panel: "border-[#FEE2E2] bg-[#FEF2F2]/70",
      icon: "bg-white text-[#B91C1C] ring-1 ring-[#FECACA]",
      badge: "bg-[#FEE2E2] text-[#991B1B]",
      bar: "bg-[#B91C1C]",
    },
    High: {
      panel: "border-amber-100 bg-amber-50/70",
      icon: "bg-white text-amber-700 ring-1 ring-amber-100",
      badge: "bg-amber-100 text-amber-800",
      bar: "bg-amber-500",
    },
  };

  return map[status] || map.Low;
}

function getMetricTone(tone) {
  const map = {
    red: "bg-[#FEF2F2] text-[#B91C1C]",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-700",
  };

  return map[tone] || map.red;
}

function safeNumber(...values) {
  const value = values.find((item) => Number.isFinite(Number(item)));
  return Number(value || 0);
}

function getUniqueReferrals(referrals) {
  const seen = new Set();

  return referrals.filter((referral) => {
    const key = getReferralTrackingId(referral);
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function getReferralTrackingId(referral) {
  return (
    referral?.trackingId ||
    referral?.tracking_id ||
    referral?.id ||
    referral?.referralId ||
    "N/A"
  );
}

function getReferralPatientName(referral) {
  if (!referral) return "Unnamed Patient";

  if (typeof referral.patient === "string") return referral.patient;

  return (
    referral.patientName ||
    referral.patient_name ||
    referral.patient?.name ||
    referral.name ||
    [referral.patient?.firstName, referral.patient?.lastName]
      .filter(Boolean)
      .join(" ") ||
    "Unnamed Patient"
  );
}

function getReferralConcern(referral) {
  return (
    referral?.chiefComplaint ||
    referral?.chief_complaint ||
    referral?.concern ||
    referral?.reasonForReferral ||
    referral?.referralReason ||
    "No chief complaint recorded"
  );
}

function getReferralStatus(referral) {
  return referral?.status || referral?.referralStatus || "Pending";
}

function getReferralDateValue(referral) {
  const raw =
    referral?.createdAt ||
    referral?.created_at ||
    referral?.submittedAt ||
    referral?.dateSubmitted ||
    referral?.dateOfReferral ||
    referral?.referralDate ||
    referral?.date;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sortByReferralDateDesc(a, b) {
  return getReferralDateValue(b) - getReferralDateValue(a);
}

function formatReferralDate(referral) {
  const raw =
    referral?.dateOfReferral ||
    referral?.referralDate ||
    referral?.createdAt ||
    referral?.created_at ||
    referral?.submittedAt ||
    referral?.dateSubmitted ||
    referral?.date;

  if (!raw) return "No date";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
