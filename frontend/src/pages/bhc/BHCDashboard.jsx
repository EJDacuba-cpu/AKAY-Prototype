import {
  Activity,
  ArrowRight,
  BellRing,
  CalendarCheck2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileText,
  HeartPulse,
  Hospital,
  ListChecks,
  Pill,
  PlusCircle,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";

import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";

/* Layout */
import DashboardLayout from "../../components/layout/DashboardLayout";

/* Cards */
import SideCard from "../../components/common/cards/SideCard";
import MedicineAlert from "../../components/common/cards/MedicineAlert";

/* Tables */
import RecentHealthRecordsTable from "../../components/features/records/RecentHealthRecordsTable";

/* Services */
import {
  getDashboardStats,
  getMedicineAlerts,
  getRecentHealthRecords,
  getRecentReferrals,
} from "../../services/dashboardService";
import {
  formatDoctorAvailabilityDate,
  formatDoctorAvailabilitySummary,
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
} from "../../services/doctorAvailability";

const ACTIVE_REFERRAL_STATUSES = new Set([
  "Pending",
  "Received",
  "For Monitoring",
  "No-Show",
]);

const REFERRAL_STAGE_ORDER = [
  "Pending",
  "Received",
  "For Monitoring",
  "No-Show",
];

const stagger = (index) => ({
  animationDelay: `${index * 65}ms`,
});

export default function BHCDashboard() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [medicineAlerts, setMedicineAlerts] = useState([]);
  const [doctorAvailability, setDoctorAvailability] = useState(() =>
    getDoctorAvailability(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);

        const [statsData, recordsData, referralsData, medicineData] =
          await Promise.all([
            getDashboardStats(),
            getRecentHealthRecords(),
            getRecentReferrals(),
            getMedicineAlerts(),
          ]);

        setStats(statsData || {});
        setRecords(Array.isArray(recordsData) ? recordsData : []);
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

  const activeReferrals = useMemo(() => {
    return uniqueReferrals
      .filter((referral) =>
        ACTIVE_REFERRAL_STATUSES.has(getReferralStatus(referral)),
      )
      .sort(sortByReferralDateDesc)
      .slice(0, 6);
  }, [uniqueReferrals]);

  const statusCounts = useMemo(() => {
    return REFERRAL_STAGE_ORDER.reduce((acc, status) => {
      acc[status] = uniqueReferrals.filter(
        (referral) => getReferralStatus(referral) === status,
      ).length;
      return acc;
    }, {});
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

  const todaysFocus = useMemo(
    () => [
      {
        label: "Pending handoffs",
        value: safeNumber(stats?.pendingReferrals, statusCounts.Pending),
        detail: "waiting for RHU check-in",
        icon: <ClipboardList size={16} />,
      },
      {
        label: "For monitoring",
        value: safeNumber(
          stats?.monitoringPatients,
          statusCounts["For Monitoring"],
        ),
        detail: "needs follow-up watch",
        icon: <HeartPulse size={16} />,
      },
      {
        label: "No-show watch",
        value: statusCounts["No-Show"] || 0,
        detail: "needs confirmation",
        icon: <Clock3 size={16} />,
      },
    ],
    [stats, statusCounts],
  );

  if (loading || !stats) {
    return (
      <DashboardLayout role="bhc" title="Dashboard">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="rounded-2xl border border-[#FEE2E2] bg-white px-5 py-4 shadow-sm">
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
        <BHCWorkboardHeader todaysFocus={todaysFocus} />

        <CareSnapshot stats={stats} />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <ReferralLoopPanel statusCounts={statusCounts} />

            <div className="grid gap-4 2xl:grid-cols-[330px_minmax(0,1fr)]">
              <DailyActionDock />
              <ActiveReferralBoard referrals={activeReferrals} />
            </div>

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-1 shadow-sm">
              <RecentHealthRecordsTable records={records} delay={7} />
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <RHUReadinessCard
              availability={doctorAvailability}
              medicineAlerts={medicineAlerts}
            />

            <FollowUpTimeline items={followUpItems} />

            <MedicineAvailabilityCard medicineAlerts={medicineAlerts} />
          </aside>
        </section>
      </div>
    </DashboardLayout>
  );
}

function BHCWorkboardHeader({ todaysFocus }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section
      className="anim-fade-up overflow-hidden rounded-3xl border border-[#FEE2E2] bg-white shadow-sm"
      style={stagger(0)}
    >
      <div className="relative isolate grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-[#B91C1C]" />
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#FEE2E2]/70 blur-3xl" />
        <div className="absolute right-32 top-8 h-20 w-20 rounded-full bg-[#B91C1C]/10 blur-2xl" />

        <div className="relative min-w-0 pl-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF2F2] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#B91C1C]">
              <Activity size={12} /> BHC Workboard
            </span>
            <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-[11px] font-semibold text-[#64748B]">
              {today}
            </span>
          </div>

          <h1 className="max-w-3xl text-2xl font-extrabold tracking-tight text-[#0F172A] md:text-3xl">
            Today&apos;s patient and referral handoff board
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#64748B]">
            Built for daily BHC work: register patients, record visits, send
            referrals, and watch RHU feedback without jumping through multiple
            screens.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <HeaderAction
              to="/bhc/patients/add"
              icon={<UserPlus size={14} />}
              label="Register Patient"
              primary
            />
            <HeaderAction
              to="/bhc/health-records"
              icon={<PlusCircle size={14} />}
              label="Record Visit"
            />
            <HeaderAction
              to="/bhc/referrals"
              icon={<ClipboardList size={14} />}
              label="Track Referrals"
            />
          </div>
        </div>

        <div className="relative rounded-2xl border border-[#FEE2E2] bg-[#FFF7F7]/80 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-[#991B1B]">
              Today&apos;s attention
            </p>
            <BellRing size={14} className="text-[#B91C1C]" />
          </div>

          <div className="space-y-2">
            {todaysFocus.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-white bg-white px-3 py-2 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#0F172A]">
                      {item.label}
                    </p>
                    <p className="truncate text-[11px] text-[#64748B]">
                      {item.detail}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-black tabular-nums text-[#B91C1C]">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
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
          ? "bg-[#B91C1C] text-white shadow-sm shadow-red-900/10 hover:-translate-y-0.5 hover:bg-[#991B1B]"
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
      description: "visit records this week",
      icon: <FileText size={17} />,
      tone: "blue",
    },
    {
      title: "Pending Referrals",
      value: safeNumber(stats.pendingReferrals),
      description: "sent to RHU",
      icon: <ClipboardList size={17} />,
      tone: "slate",
    },
    {
      title: "For Monitoring",
      value: safeNumber(stats.monitoringPatients),
      description: "needs follow-up",
      icon: <HeartPulse size={17} />,
      tone: "amber",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card, index) => (
        <div
          key={card.title}
          className="anim-fade-up group relative overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#FECACA] hover:shadow-md"
          style={stagger(index + 1)}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#B91C1C] via-[#EF4444] to-[#FCA5A5] opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                {card.title}
              </p>
              <p className="mt-3 text-2xl font-black tabular-nums text-[#0F172A]">
                {card.value}
              </p>
              <p className="mt-1 text-[11px] font-medium text-[#64748B]">
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

function DailyActionDock() {
  const tasks = [
    {
      label: "Add Patient",
      note: "Register walk-in or new profile",
      to: "/bhc/patients/add",
      icon: <UserPlus size={16} />,
    },
    {
      label: "Record Visit",
      note: "Consultation, immunization, maternal, follow-up",
      to: "/bhc/health-records",
      icon: <FileText size={16} />,
    },
    {
      label: "Create Referral",
      note: "Start from saved health record",
      to: "/bhc/health-records",
      icon: <ClipboardCheck size={16} />,
    },
    {
      label: "Review Feedback",
      note: "Check RHU status and return slip",
      to: "/bhc/referrals",
      icon: <ListChecks size={16} />,
    },
  ];

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-[#0F172A]">Daily task dock</h2>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            Shortcuts arranged by BHC workflow.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {tasks.map((task, index) => (
          <Link
            key={task.label}
            to={task.to}
            className="group flex items-center gap-3 rounded-xl border border-[#F1F5F9] bg-[#F8FAFC]/70 p-3 transition-all hover:-translate-y-0.5 hover:border-[#FECACA] hover:bg-white hover:shadow-sm"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C] transition group-hover:bg-[#B91C1C] group-hover:text-white">
              {task.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-[#B91C1C]">
                  0{index + 1}
                </span>
                <p className="truncate text-xs font-bold text-[#0F172A]">
                  {task.label}
                </p>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[#64748B]">
                {task.note}
              </p>
            </div>
            <ArrowRight
              size={13}
              className="shrink-0 text-[#CBD5E1] transition group-hover:text-[#B91C1C]"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReferralLoopPanel({ statusCounts }) {
  const stages = [
    {
      label: "Sent to RHU",
      status: "Pending",
      description: "Waiting for RHU arrival/check-in",
      count: statusCounts.Pending || 0,
    },
    {
      label: "RHU Received",
      status: "Received",
      description: "Patient already checked in",
      count: statusCounts.Received || 0,
    },
    {
      label: "Under Monitoring",
      status: "For Monitoring",
      description: "RHU still observing case",
      count: statusCounts["For Monitoring"] || 0,
    },
    {
      label: "Needs Follow-up",
      status: "No-Show",
      description: "Patient did not arrive yet",
      count: statusCounts["No-Show"] || 0,
    },
  ];

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-[#0F172A]">
            Referral handoff loop
          </h2>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            A quick view of where BHC referrals are in the RHU coordination
            loop.
          </p>
        </div>
        <Link
          to="/bhc/referrals"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-bold text-[#B91C1C] transition hover:bg-white"
        >
          Open tracking
          <ArrowRight size={13} />
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {stages.map((stage, index) => (
          <div
            key={stage.status}
            className="relative rounded-2xl border border-[#F1F5F9] bg-[#F8FAFC]/70 p-3"
          >
            {index !== stages.length - 1 && (
              <div className="absolute -right-2 top-1/2 hidden h-px w-4 bg-[#E5E7EB] md:block" />
            )}
            <div className="mb-3 flex items-center justify-between gap-2">
              <ReferralStatusBadge status={stage.status} />
              <span className="text-xl font-black tabular-nums text-[#0F172A]">
                {stage.count}
              </span>
            </div>
            <p className="text-xs font-bold text-[#0F172A]">{stage.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
              {stage.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveReferralBoard({ referrals }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#F1F5F9] bg-[#FFF7F7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-[#0F172A]">
            Active referral board
          </h2>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            Live cases that still need RHU feedback or BHC follow-up.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#B91C1C] shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#B91C1C]" />
          {referrals.length} active
        </span>
      </div>

      {referrals.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <ClipboardList className="mx-auto mb-3 text-[#CBD5E1]" size={32} />
          <p className="text-sm font-bold text-[#334155]">
            No active referrals
          </p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            New submitted referrals will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#F1F5F9]">
          {referrals.map((referral, index) => {
            const trackingId = getReferralTrackingId(referral);
            const status = getReferralStatus(referral);

            return (
              <Link
                key={trackingId}
                to={`/bhc/referrals/${trackingId}`}
                className="group grid gap-3 px-4 py-3 transition hover:bg-[#F8FAFC] sm:grid-cols-[54px_minmax(0,1fr)_130px] sm:items-center"
              >
                <div className="flex items-center gap-2 sm:block">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEF2F2] text-xs font-black text-[#B91C1C]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-[#64748B] sm:mt-1 sm:block">
                    {trackingId}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-black text-[#0F172A]">
                      {getReferralPatientName(referral)}
                    </p>
                    <ReferralStatusBadge status={status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-[#64748B]">
                    {getReferralConcern(referral)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <p className="text-[11px] font-semibold text-[#94A3B8]">
                    {formatReferralDate(referral)}
                  </p>
                  <ArrowRight
                    size={14}
                    className="text-[#CBD5E1] transition group-hover:translate-x-0.5 group-hover:text-[#B91C1C]"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
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
        <div className="rounded-2xl border border-[#F1F5F9] bg-[#F8FAFC] p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C]">
              <Stethoscope size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    availability.status === "Not Available"
                      ? "bg-red-50 text-red-700"
                      : "bg-emerald-50 text-emerald-700"
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
            label="Unavailable"
            value={unavailableMedicines}
            icon={<Hospital size={14} />}
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

function FollowUpTimeline({ items }) {
  return (
    <SideCard title="Follow-up Timeline" badge={`${items.length} watch`}>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-4 py-6 text-center">
          <CalendarCheck2 className="mx-auto mb-2 text-[#CBD5E1]" size={26} />
          <p className="text-xs font-semibold text-[#64748B]">
            No follow-up items right now
          </p>
        </div>
      ) : (
        <div className="relative space-y-3 pl-4 before:absolute before:left-1.5 before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-[#FECACA]">
          {items.map((item) => (
            <div key={getReferralTrackingId(item)} className="relative">
              <span className="absolute -left-[17px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#B91C1C] shadow-sm" />
              <Link
                to={`/bhc/referrals/${getReferralTrackingId(item)}`}
                className="block rounded-xl border border-[#F1F5F9] bg-[#F8FAFC]/70 px-3 py-2.5 transition hover:border-[#FECACA] hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-bold text-[#0F172A]">
                    {getReferralPatientName(item)}
                  </p>
                  <ReferralStatusBadge status={getReferralStatus(item)} />
                </div>
                <p className="mt-1 truncate text-[11px] text-[#64748B]">
                  {getReferralConcern(item)}
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/bhc/referrals"
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-white px-4 py-2.5 text-xs font-bold text-[#B91C1C] transition hover:bg-[#FEF2F2]"
      >
        Open Referral Tracking
        <ArrowRight size={13} />
      </Link>
    </SideCard>
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
        className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-red-900/10 transition-all hover:bg-[#991B1B]"
      >
        View Medicine Availability
        <ArrowRight size={13} />
      </Link>
    </SideCard>
  );
}

function ReferralStatusBadge({ status }) {
  const map = {
    Pending: "border-slate-200 bg-slate-50 text-slate-600",
    Received: "border-blue-200 bg-blue-50 text-blue-700",
    "For Monitoring": "border-amber-200 bg-amber-50 text-amber-700",
    "No-Show": "border-red-200 bg-red-50 text-red-700",
    Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
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

function getMetricTone(tone) {
  const map = {
    red: "bg-[#FEF2F2] text-[#B91C1C]",
    blue: "bg-blue-50 text-blue-700",
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
