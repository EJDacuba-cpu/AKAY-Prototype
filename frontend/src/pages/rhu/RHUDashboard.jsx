import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Moon,
  QrCode,
  Stethoscope,
  Sun,
  UserPlus,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import "../../components/features/dashboard/dashboard-theme.css";

import DashboardLayout from "../../components/layout/DashboardLayout";
import ModuleGate from "../../components/common/access/ModuleGate";
import LockedPlaceholder from "../../components/common/access/LockedPlaceholder";
import { PageStateWrapper, RefreshingIndicator } from "../../components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import PatientVisitActivityChart from "../../components/features/rhu-dashboard/PatientVisitActivityChart";
import useAccess from "../../hooks/useAccess";
import { useRhuProviders } from "../../hooks/useDoctorAvailability";
import { getIncomingReferrals, getReferrals } from "../../services/referrals";
import { getFollowUpTasks } from "../../services/followUpTaskService";
import { loadMedicineAvailability } from "../../services/medicineService";
import { listRhuVisits } from "../../services/rhuVisitService";
import { getCurrentUser } from "../../utils/auth";
import { displayedAvailabilityStatus } from "../../utils/doctorRoster";
import { queryKeys } from "../../utils/queryKeys";
import {
  buildMedicineAlertItems,
  buildRecentVisitActivity,
  buildRhuAttentionItems,
  buildRhuKpis,
  buildVisitActivitySeries,
  countFollowUpsDueToday,
  countOverdueFollowUps,
  countPendingReferrals,
  countQueueAwaitingAction,
  formatKpiValue,
  mergeVisitRecords,
} from "../../utils/rhuDashboard";
import { cn } from "../../lib/utils";

const KPI_CARDS = [
  {
    key: "todays_queue",
    title: "Today's Queue",
    description: "Active visits waiting or in consult",
    icon: Users,
    module: "history",
    href: "/rhu/patients?view=queue",
  },
  {
    key: "pending_referrals",
    title: "Pending Referrals",
    description: "Awaiting RHU receipt",
    icon: ClipboardList,
    // Intake queue is the source of truth; history is the fallback source.
    module: "rhuIntake",
    href: "/rhu/incoming-referrals",
  },
  {
    key: "consultations_today",
    title: "Consultations Today",
    description: "Completed consultations today",
    icon: Stethoscope,
    module: "history",
    href: "/rhu/patients?view=queue",
  },
  {
    key: "follow_ups_due_today",
    title: "Follow-ups Due",
    description: "Active tasks due today",
    icon: CalendarClock,
    module: "followups",
    href: "/rhu/follow-ups",
  },
];

const QUICK_ACTIONS = [
  {
    title: "Incoming Referrals",
    description: "Process BHC referral arrivals",
    href: "/rhu/incoming-referrals",
    icon: ClipboardList,
    module: "rhuIntake",
  },
  {
    title: "Visit Check-in",
    description: "Check a patient into today's queue",
    href: "/rhu/walk-in-check-in",
    icon: UserPlus,
    module: "patients",
  },
  {
    title: "Patient Arrival",
    description: "Scan or find a referral",
    href: "/rhu/qr-scanner",
    icon: QrCode,
    module: "rhuIntake",
  },
];

export default function RHUDashboard() {
  const user = getCurrentUser();
  const access = useAccess();
  const canHistory = access.canModule("history");
  const canFollowups = access.canModule("followups");
  const canInventory = access.canModule("inventory");
  const canIntake = access.canModule("rhuIntake");
  const { providers: doctors, isLoading: doctorsLoading } = useRhuProviders();
  const canManageDoctors = access.can("rhu.providers.manage");

  const queries = useQueries({
    queries: [
      {
        queryKey: [...queryKeys.rhuVisits(), "active", "dashboard"],
        queryFn: () => listRhuVisits(),
        enabled: canHistory,
        retry: false,
      },
      {
        queryKey: [...queryKeys.rhuVisits(), "closed", "dashboard"],
        queryFn: () => listRhuVisits({ includeClosed: true }),
        enabled: canHistory,
        retry: false,
      },
      {
        // Prefer the intake queue (same module as Incoming Referrals); fall back to /referrals.
        queryKey: canIntake
          ? [...queryKeys.incomingReferrals("rhu"), "dashboard"]
          : [...queryKeys.referrals("rhu"), "dashboard"],
        queryFn: () => (canIntake ? getIncomingReferrals() : getReferrals()),
        enabled: canHistory || canIntake,
        retry: false,
      },
      {
        queryKey: [...queryKeys.followUpTasks("rhu"), "dashboard"],
        queryFn: () => getFollowUpTasks(),
        enabled: canFollowups,
        retry: false,
      },
      {
        queryKey: [...queryKeys.medicineAvailability("rhu", user || {}), "dashboard"],
        queryFn: () => loadMedicineAvailability(),
        enabled: canInventory,
        retry: false,
      },
    ],
  });

  const [activeVisitsQuery, allVisitsQuery, referralsQuery, followUpsQuery, medicinesQuery] = queries;

  const activeVisits = useMemo(
    () => (Array.isArray(activeVisitsQuery.data) ? activeVisitsQuery.data : []),
    [activeVisitsQuery.data],
  );
  const allVisits = useMemo(
    () => (Array.isArray(allVisitsQuery.data) ? allVisitsQuery.data : []),
    [allVisitsQuery.data],
  );
  const referrals = useMemo(
    () => (Array.isArray(referralsQuery.data) ? referralsQuery.data : []),
    [referralsQuery.data],
  );
  const followUpTasks = useMemo(
    () => (Array.isArray(followUpsQuery.data) ? followUpsQuery.data : []),
    [followUpsQuery.data],
  );
  const medicineAlerts = useMemo(
    () => buildMedicineAlertItems(medicinesQuery.data || []),
    [medicinesQuery.data],
  );

  // include_closed + active queue: one source of truth for charts/recent/completed KPIs.
  const facilityVisits = useMemo(
    () => (canHistory ? mergeVisitRecords(allVisits, activeVisits) : []),
    [allVisits, activeVisits, canHistory],
  );

  const followUpsDueToday = useMemo(
    () => (canFollowups ? countFollowUpsDueToday(followUpTasks) : 0),
    [followUpTasks, canFollowups],
  );
  const overdueFollowUps = useMemo(
    () => (canFollowups ? countOverdueFollowUps(followUpTasks) : 0),
    [followUpTasks, canFollowups],
  );

  const canSeeReferrals = canHistory || canIntake;

  const kpis = useMemo(
    () =>
      buildRhuKpis({
        activeVisits: canHistory ? activeVisits : [],
        allVisits: facilityVisits,
        referrals: canSeeReferrals ? referrals : [],
        followUpTasks: canFollowups ? followUpTasks : [],
        access: {
          queue: canHistory,
          referrals: canSeeReferrals,
          followups: canFollowups,
        },
      }),
    [activeVisits, facilityVisits, referrals, followUpTasks, canHistory, canFollowups, canSeeReferrals],
  );

  const attentionItems = useMemo(
    () =>
      buildRhuAttentionItems({
        pendingReferrals: canSeeReferrals ? countPendingReferrals(referrals) : 0,
        queueAwaitingAction: canHistory ? countQueueAwaitingAction(activeVisits) : 0,
        followUpsDueToday,
        overdueFollowUps,
        medicineAlerts: canInventory ? medicineAlerts : [],
        access: {
          referrals: canSeeReferrals,
          queue: canHistory,
          followups: canFollowups,
          inventory: canInventory,
        },
      }),
    [
      referrals,
      activeVisits,
      medicineAlerts,
      followUpsDueToday,
      overdueFollowUps,
      canHistory,
      canFollowups,
      canInventory,
      canSeeReferrals,
    ],
  );

  const visitSeries = useMemo(
    () => (canHistory ? buildVisitActivitySeries(facilityVisits, { days: 30 }) : []),
    [facilityVisits, canHistory],
  );

  const recentActivity = useMemo(
    () => (canHistory ? buildRecentVisitActivity(facilityVisits) : []),
    [facilityVisits, canHistory],
  );

  const trackedQueries = queries.filter((query) => query.isEnabled !== false);
  const hasAnySuccess = trackedQueries.some((query) => query.isSuccess);
  const isLoading = trackedQueries.some((query) => query.isPending) && !hasAnySuccess;
  const hasDashboardData = hasAnySuccess || doctors.length > 0 || trackedQueries.length === 0;
  const isFetching = trackedQueries.some((query) => query.isFetching);
  const authorizationError = trackedQueries.map(query => query.error).find(error => [401, 403].includes(error?.status));
  const hardError =
    canHistory &&
    !hasAnySuccess &&
    [activeVisitsQuery, allVisitsQuery, referralsQuery].every((query) => query.isError);

  const userName = useMemo(() => getCurrentUserDisplayName(), []);
  const facilityName =
    user?.facility ||
    user?.assignedRuralHealthUnit ||
    user?.ruralHealthUnit ||
    user?.rural_health_unit_name ||
    "Rural Health Unit";

  return (
    <DashboardLayout role="rhu" title="Dashboard">
      <PageStateWrapper
        skeleton="rhu-dashboard"
        isLoading={isLoading && !hasAnySuccess}
        isError={Boolean(authorizationError || hardError)}
        isFetching={isFetching}
        hasData={hasDashboardData}
        error={authorizationError || (hardError ? activeVisitsQuery.error || allVisitsQuery.error || referralsQuery.error : null)}
        onRetry={() => queries.forEach((query) => query.refetch())}
        loadingMessage="Loading dashboard..."
      >
        <div className="clinical-dashboard mx-auto flex w-full max-w-[1500px] flex-col gap-4">
          {isFetching && hasAnySuccess ? (
            <div className="flex justify-end">
              <RefreshingIndicator label="Updating dashboard..." />
            </div>
          ) : null}

          {!authorizationError && !hardError && trackedQueries.some((query) => query.isError) && hasDashboardData ? (
            <p role="status" className="text-sm text-neutral-600">
              Unable to refresh some dashboard panels. Showing the last data that loaded.{" "}
              <button type="button" className="font-semibold text-brand-700 hover:underline disabled:opacity-60" onClick={() => queries.forEach((query) => query.refetch())} disabled={isFetching}>Retry</button>
            </p>
          ) : null}

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <WelcomeSummary userName={userName} facilityName={facilityName} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-7">
              {KPI_CARDS.map((card) => {
                const allowed =
                  card.key === "pending_referrals"
                    ? canSeeReferrals
                    : access.canModule(card.module);
                if (!allowed) {
                  return <KpiCard key={card.key} {...card} value="—" />;
                }
                return <KpiCard key={card.key} {...card} value={formatKpiValue(kpis[card.key])} />;
              })}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <ModuleGate
                module="history"
                className="rounded-card"
                placeholder={<LockedPlaceholder lines={6} className="min-h-72" />}
              >
                <PatientVisitActivityChart series={visitSeries} />
              </ModuleGate>
            </div>
            <div className="lg:col-span-5">
              <NeedsAttentionCard items={attentionItems} />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <QuickActionsPanel actions={QUICK_ACTIONS} access={access} />
            </div>
            <div className="lg:col-span-5">
              <ModuleGate
                module="history"
                className="rounded-card"
                placeholder={<LockedPlaceholder lines={4} className="min-h-56" />}
              >
                <RecentActivityCard items={recentActivity} />
              </ModuleGate>
            </div>
            <div className="lg:col-span-3">
              <DoctorAvailabilityCard
                doctors={doctors}
                loading={doctorsLoading}
                canManage={canManageDoctors}
              />
            </div>
          </section>
        </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function WelcomeSummary({ userName, facilityName }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  const hour = getManilaHour(now);
  const timeTone = hour >= 6 && hour < 18 ? "day" : "night";
  const TimeIcon = timeTone === "day" ? Sun : Moon;

  return (
    <div data-time-tone={timeTone} className="bhc-welcome-summary welcome-ambient-panel h-full">
      <div aria-hidden="true" className="welcome-ambient-beam" />
      <svg
        aria-hidden="true"
        focusable="false"
        className="welcome-ambient-waves"
        viewBox="0 0 600 260"
        preserveAspectRatio="none"
      >
        <path d="M0 128C110 48 170 205 298 140S485 65 600 104V260H0Z" fill="var(--ambient-wave-back)" />
        <path d="M0 190C100 130 185 245 330 179S505 135 600 170V260H0Z" fill="var(--ambient-wave-front)" />
      </svg>
      <div className="welcome-ambient-copy">
        <span aria-hidden="true" className="welcome-ambient-icon">
          <TimeIcon size={28} strokeWidth={1.75} />
        </span>
        <h1>
          {getGreeting(now)}, {userName}
        </h1>
        <p className="bhc-welcome-facility mt-2 leading-normal">{facilityName}</p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <time dateTime={now.toISOString()} className="bhc-welcome-date leading-normal">
            {formatToday(now)}
          </time>
          <time
            dateTime={now.toISOString()}
            title="Philippine Time (UTC+8)"
            className="bhc-welcome-clock leading-normal tabular-nums"
          >
            <span className="sr-only">Philippine time: </span>
            {formatCurrentTime(now)}
          </time>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, description, icon: Icon, value, href }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="bhc-kpi-label text-[10px] font-bold uppercase tracking-wider text-neutral-400">{title}</p>
        <span className="bhc-kpi-icon flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-ink-700">
          <Icon size={16} />
        </span>
      </div>
      <p className="bhc-kpi-value mt-3 text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      <p className="bhc-kpi-description mt-1 text-xs text-neutral-500">{description}</p>
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="bhc-dashboard-kpi block rounded-card border border-neutral-200 bg-white p-4 shadow-card hover:bg-neutral-50"
      >
        {body}
      </Link>
    );
  }

  return (
    <article className="bhc-dashboard-kpi rounded-card border border-neutral-200 bg-white p-4 shadow-card">
      {body}
    </article>
  );
}

function NeedsAttentionCard({ items }) {
  return (
    <Card className="h-full rounded-card shadow-card">
      <CardHeader>
        <CardTitle>Needs Attention</CardTitle>
        <CardDescription>Pending arrivals, queue work, due or overdue follow-ups, and stock alerts.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-4 text-sm text-neutral-500">
            Nothing needs attention today.
          </p>
        ) : (
          items.map((item) => (
            <Link
              key={item.key}
              to={item.href}
              className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                  <AlertTriangle className="text-brand-700" size={14} />
                  {item.label}
                </p>
                {item.detail ? (
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{item.detail}</p>
                ) : null}
              </div>
              <span className="text-sm font-semibold tabular-nums text-neutral-900">{item.count}</span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionsPanel({ actions, access }) {
  return (
    <Card className="h-full rounded-card shadow-card">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Frequent RHU workflows.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {actions.map((action) => {
          const allowed = access.canModule(action.module);
          if (!allowed) {
            return <QuickActionRow key={action.href} {...action} locked />;
          }
          return <QuickActionRow key={action.href} {...action} />;
        })}
      </CardContent>
    </Card>
  );
}

function QuickActionRow({ title, description, href, icon: Icon, locked = false }) {
  const className = cn(
    "bhc-quick-action flex items-start gap-3 rounded-lg border border-neutral-200 px-3 py-2.5",
    !locked && "hover:bg-neutral-50",
  );
  const body = (
    <>
      <span className="bhc-quick-icon flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-ink-700">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="bhc-quick-title text-sm font-semibold text-neutral-900">{title}</p>
        <p className="bhc-quick-description mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>
    </>
  );

  if (locked) return <div className={className}>{body}</div>;
  return (
    <Link to={href} className={className}>
      {body}
    </Link>
  );
}

function RecentActivityCard({ items }) {
  return (
    <Card className="h-full rounded-card shadow-card">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Recent RHU Activity</CardTitle>
          <CardDescription>Latest eligible visits at this facility.</CardDescription>
        </div>
        <Link to="/rhu/patients?view=queue" className="text-xs font-semibold text-brand-700 hover:underline">
          Open queue
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-4 text-sm text-neutral-500">
            No recent visits yet.
          </p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{item.patientName}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {item.source} · {item.status}
                </p>
              </div>
              <time className="shrink-0 text-xs tabular-nums text-neutral-500" dateTime={item.checkedInAt}>
                {formatActivityTime(item.checkedInAt)}
              </time>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DoctorAvailabilityCard({ doctors, loading, canManage }) {
  return (
    <Card className="h-full rounded-card shadow-card">
      <CardHeader className="p-4 pb-3">
        <CardTitle>Doctor Availability</CardTitle>
        <CardDescription>RHU readiness for today.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p role="status" className="px-4 pb-4 text-sm text-neutral-500">
            Checking doctor availability…
          </p>
        ) : doctors.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-neutral-500">No doctor records yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 px-3 pb-3">
            {doctors.map((doctor) => {
              const unavailable = displayedAvailabilityStatus(doctor) === "Unavailable";
              return (
                <li key={doctor.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-neutral-900" title={doctor.name}>
                        {doctor.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {doctor.specialization || "General Practitioner"}
                      </p>
                    </div>
                    <ReadinessBadge unavailable={unavailable} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          to="/rhu/doctor-availability"
          className="block border-t border-neutral-200 px-4 py-2.5 text-xs font-semibold text-brand-700 hover:underline"
        >
          {canManage ? "Manage availability" : "View availability"}
        </Link>
      </CardContent>
    </Card>
  );
}

function ReadinessBadge({ unavailable }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-200 bg-white px-2 py-[3px] text-[11px] font-medium text-neutral-900">
      {unavailable ? "Unavailable" : "Available"}
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", unavailable ? "bg-warning-500" : "bg-success-500")}
      />
    </span>
  );
}

function getCurrentUserDisplayName() {
  const user = getCurrentUser();
  const name = user?.fullName || user?.full_name || user?.name || "";
  if (name) return String(name).trim().split(/\s+/)[0] || "RHU Staff";
  return "RHU Staff";
}

function getGreeting(date) {
  const hour = getManilaHour(date);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatToday(date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrentTime(date) {
  return date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatActivityTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getManilaHour(date) {
  return Number(
    date.toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }),
  );
}
