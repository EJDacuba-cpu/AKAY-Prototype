import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Moon,
  Sun,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import "../../components/features/bhc-dashboard/dashboard-theme.css";

import DashboardLayout from "../../components/layout/DashboardLayout";
import ModuleGate from "../../components/common/access/ModuleGate";
import LockedPlaceholder from "../../components/common/access/LockedPlaceholder";
import { PageStateWrapper, RefreshingIndicator } from "../../components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import ConsultationActivityChart from "../../components/features/bhc-dashboard/ConsultationActivityChart";
import { getBhcDashboardSummary } from "../../services/dashboardService";
import {
  bhcCoordinationText,
  formatDoctorAvailabilityDate,
  formatDoctorAvailabilitySummary,
} from "../../services/doctorAvailability";
import { displayedAvailabilityStatus } from "../../utils/doctorRoster";
import { useDoctorAvailability } from "../../hooks/useDoctorAvailability";
import { getCurrentUser } from "../../utils/auth";
import { queryKeys } from "../../utils/queryKeys";
import { buildAttentionItems, formatKpiValue } from "../../utils/bhcDashboard";
import { cn } from "../../lib/utils";

const EMPTY_SUMMARY = {
  facility: { name: "" },
  access: { patients: false, clinical: false, inventory: false },
  kpis: {
    registered_patients: null,
    consultations_today: null,
    open_referrals: null,
    follow_ups_due_today: null,
  },
  consultation_activity: null,
  attention: {
    overdue_follow_ups: null,
    pending_rhu_feedback: null,
    inventory_alerts: null,
    inventory_items: null,
  },
};

const KPI_CARDS = [
  {
    key: "registered_patients",
    title: "Registered Patients",
    description: "Patient profiles at this BHC",
    icon: Users,
    module: "patients",
  },
  {
    key: "consultations_today",
    title: "Consultations Today",
    description: "Encounters recorded today",
    icon: Stethoscope,
    module: "history",
  },
  {
    key: "open_referrals",
    title: "Open Referrals",
    description: "Awaiting RHU receipt or feedback",
    icon: ClipboardList,
    module: "history",
  },
  {
    key: "follow_ups_due_today",
    title: "Follow-ups Due Today",
    description: "Active tasks due today",
    icon: CalendarClock,
    module: "history",
  },
];

const QUICK_ACTIONS = [
  {
    title: "Register Patient",
    description: "Add a new patient profile",
    href: "/bhc/patients/add",
    icon: UserPlus,
    module: "patients",
  },
  {
    title: "Start Consultation",
    description: "Open the consultation workspace",
    href: "/bhc/health-records/add",
    icon: Stethoscope,
    module: "consultations",
  },
  {
    title: "Referrals",
    description: "Track BHC-to-RHU referrals",
    href: "/bhc/referrals",
    icon: ClipboardList,
    module: "history",
  },
  {
    title: "Follow-ups",
    description: "Work the follow-up queue",
    href: "/bhc/follow-ups",
    icon: CalendarClock,
    module: "history",
  },
];

export default function BHCDashboard() {
  const user = getCurrentUser();
  const { availability: doctorAvailability, isLoading: availabilityLoading } = useDoctorAvailability();
  const {
    data,
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: [...queryKeys.dashboardSummary("bhc"), user?.id, user?.working_facility_key],
    queryFn: getBhcDashboardSummary,
    retry: false,
  });
  const summary = data || EMPTY_SUMMARY;
  const hasDashboardData = Boolean(data);
  const userName = useMemo(() => getCurrentUserDisplayName(), []);
  const facilityName =
    summary.facility?.name || user?.facility || user?.assignedBarangayHealthCenter || "Barangay Health Center";
  const attentionItems = useMemo(
    () => buildAttentionItems(summary.attention, summary.access || data?.access),
    [summary.attention, summary.access, data?.access],
  );

  return (
    <DashboardLayout role="bhc" title="Dashboard">
      <PageStateWrapper
        skeleton="dashboard"
        isLoading={isLoading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={hasDashboardData}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading dashboard..."
      >
        <div className="bhc-dashboard-color mx-auto flex w-full max-w-[1500px] flex-col gap-4">
          {isFetching && hasDashboardData ? (
            <div className="flex justify-end">
              <RefreshingIndicator label="Updating dashboard..." />
            </div>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {KPI_CARDS.map((card) => (
                <ModuleGate
                  key={card.key}
                  module={card.module}
                  className="rounded-card"
                  placeholder={<KpiCard {...card} value="—" />}
                >
                  <KpiCard
                    {...card}
                    value={formatKpiValue(summary.kpis?.[card.key])}
                  />
                </ModuleGate>
              ))}
            </div>
            <WelcomeSummary userName={userName} facilityName={facilityName} />
          </section>

          <section aria-label="Quick actions" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_ACTIONS.map((action) => (
              <ModuleGate
                key={action.href}
                module={action.module}
                className="rounded-card"
                placeholder={<QuickActionCard {...action} locked />}
              >
                <QuickActionCard {...action} />
              </ModuleGate>
            ))}
          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
            <ModuleGate
              module="history"
              className="rounded-card"
              placeholder={<LockedPlaceholder lines={6} className="min-h-72" />}
            >
              <ConsultationActivityChart series={summary.consultation_activity?.series || []} />
            </ModuleGate>
            <NeedsAttentionCard items={attentionItems} />
            <div className="xl:col-start-2">
              <RHUReadinessCard availability={doctorAvailability} loading={availabilityLoading} />
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
    <div data-time-tone={timeTone} className="bhc-welcome-summary welcome-ambient-panel">
      <div aria-hidden="true" className="welcome-ambient-beam" />
      <svg aria-hidden="true" focusable="false" className="welcome-ambient-waves" viewBox="0 0 600 260" preserveAspectRatio="none">
        <path d="M0 128C110 48 170 205 298 140S485 65 600 104V260H0Z" fill="var(--ambient-wave-back)" />
        <path d="M0 190C100 130 185 245 330 179S505 135 600 170V260H0Z" fill="var(--ambient-wave-front)" />
      </svg>
      <div className="welcome-ambient-copy">
        <span aria-hidden="true" className="welcome-ambient-icon"><TimeIcon size={28} strokeWidth={1.75} /></span>
        <h1>{getGreeting(now)}, {userName}</h1>
        <p className="bhc-welcome-facility mt-2 leading-normal">{facilityName}</p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <time dateTime={now.toISOString()} className="bhc-welcome-date leading-normal">{formatToday(now)}</time>
          <time dateTime={now.toISOString()} title="Philippine Time (UTC+8)" className="bhc-welcome-clock leading-normal tabular-nums"><span className="sr-only">Philippine time: </span>{formatCurrentTime(now)}</time>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, description, icon: Icon, value }) {
  return (
    <article className="bhc-dashboard-kpi rounded-card border border-neutral-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="bhc-kpi-label text-[10px] font-bold uppercase tracking-wider text-neutral-400">{title}</p>
        <span className="bhc-kpi-icon flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-ink-700">
          <Icon size={16} />
        </span>
      </div>
      <p className="bhc-kpi-value mt-3 text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      <p className="bhc-kpi-description mt-1 text-xs text-neutral-500">{description}</p>
    </article>
  );
}

function NeedsAttentionCard({ items }) {
  return (
    <Card className="rounded-card shadow-card">
      <CardHeader>
        <CardTitle>Needs Attention</CardTitle>
        <CardDescription>Overdue work, RHU feedback, and stock alerts.</CardDescription>
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

function RHUReadinessCard({ availability, loading = false }) {
  const doctors = Array.isArray(availability.providers) ? availability.providers : [];

  return (
    <Card className="rounded-card shadow-card">
      <CardHeader className="p-4 pb-3">
        <CardTitle>RHU Readiness</CardTitle>
        {!loading && (
          <p className="mt-[5px] text-xs leading-normal text-neutral-600">
            {formatDoctorAvailabilitySummary(availability)}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p role="status" className="px-4 pb-4 text-sm leading-normal text-neutral-500">
            Checking doctor availability?
          </p>
        ) : (
          <>
            {doctors.length === 0 ? (
              <p className="px-4 pb-4 text-sm leading-normal text-neutral-500">No doctor records yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 px-3 pb-3">
                {doctors.map((doctor) => {
                  const doctorUnavailable = displayedAvailabilityStatus(doctor) === "Unavailable";
                  const coordination = bhcCoordinationText(doctor);
                  return (
                    <li key={doctor.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                        <p className="col-start-1 row-start-1 truncate text-[13px] font-medium leading-normal text-neutral-900" title={doctor.name}>
                          {doctor.name}
                        </p>
                        <div className="contents">
                          <p className="col-start-1 row-start-2 mt-0.5 truncate text-xs leading-normal text-neutral-500" title={doctor.specialization || "General Practitioner"}>
                            {doctor.specialization || "General Practitioner"}
                          </p>
                          <ReadinessBadge unavailable={doctorUnavailable} />
                        </div>
                      </div>
                      {doctorUnavailable && coordination ? (
                        <p className="mt-[5px] text-xs leading-normal text-neutral-600">{coordination}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="border-t border-neutral-200 px-4 py-2.5 text-[11px] leading-normal text-neutral-500">
              Updated {formatDoctorAvailabilityDate(availability.updatedAt)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionCard({ title, description, href, icon: Icon, locked = false }) {
  const className = cn(
    "bhc-quick-action flex h-full flex-col gap-3 rounded-card border border-neutral-200 bg-white p-4 shadow-card",
    !locked && "hover:bg-neutral-50",
  );

  const body = (
    <>
      <span className="bhc-quick-icon flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-ink-700">
        <Icon size={16} />
      </span>
      <div>
        <p className="bhc-quick-title text-sm font-semibold text-neutral-900">{title}</p>
        <p className="bhc-quick-description mt-1 text-xs text-neutral-500">{description}</p>
      </div>
    </>
  );

  if (locked) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link to={href} className={className}>
      {body}
    </Link>
  );
}

function ReadinessBadge({ unavailable }) {
  return (
    <span className="col-start-2 row-span-2 row-start-1 inline-flex shrink-0 items-center justify-between gap-[7px] whitespace-nowrap rounded-full border border-neutral-200 bg-white px-2 py-[3px] text-[11px] font-medium leading-[1.4] text-neutral-900">
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
  if (name) return String(name).trim().split(/\s+/)[0] || "BHC Worker";
  return "BHC Worker";
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

function getManilaHour(date) {
  return Number(date.toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }));
}
