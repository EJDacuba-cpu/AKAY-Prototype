import {
  useEffect,
  useState,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Moon, Sun } from "lucide-react";

import "../../components/features/dashboard/dashboard-theme.css";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { PageStateWrapper, RefreshingIndicator } from "../../components/common";
import AttentionStrip from "../../components/features/admin-dashboard/AttentionStrip";
import PersonnelDistribution from "../../components/features/admin-dashboard/PersonnelDistribution";
import OverviewCards from "../../components/features/admin-dashboard/OverviewCards";
import QuickActions from "../../components/features/admin-dashboard/QuickActions";
import RecentActivity from "../../components/features/admin-dashboard/RecentActivity";
import { loadAdminDashboard } from "../../services/adminDashboardService";
import { parsePeriod } from "../../utils/adminDashboard";
import { getCurrentUser } from "../../utils/auth";
import { queryKeys } from "../../utils/queryKeys";

const DASHBOARD_PERIOD = parsePeriod(null);

export default function AdminDashboard() {
  const {
    data,
    isPending,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.adminDashboard(DASHBOARD_PERIOD),
    queryFn: () => loadAdminDashboard(DASHBOARD_PERIOD),
    placeholderData: keepPreviousData,
    // Counts change as the MHO works, so returning to the page shows the cache and refetches.
    staleTime: 0,
    retry: false,
  });
  const hasData = Boolean(data);
  const userName = getDashboardFirstName("MHO");

  return (
    <DashboardLayout role="admin" title="Dashboard">
      <PageStateWrapper
        skeleton="dashboard"
        // isPending (not isLoading) so a first load that is paused offline still shows the skeleton.
        isLoading={isPending}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={hasData}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading dashboard..."
      >
        <div className="clinical-dashboard mx-auto flex w-full max-w-[1500px] flex-col gap-4">
          {isFetching && hasData && (
            <div className="flex justify-end">
              <RefreshingIndicator label="Updating dashboard..." />
            </div>
          )}

          {loadError && hasData && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-amber-700"
            >
              <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
              <span>Couldn't refresh the dashboard.</span>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="text-brand-700 hover:text-brand-800 hover:underline disabled:opacity-60"
              >
                Retry
              </button>
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <WelcomeSummary userName={userName} />
            </div>
            <div className="lg:col-span-7">
              {hasData && (
                <OverviewCards
                  totalAccounts={data.accounts.total}
                  activeAccounts={data.accounts.active}
                  pendingInvitations={data.pending_invitations}
                  pendingResetRequests={data.attention.reset_requests}
                />
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              {hasData && (
                <PersonnelDistribution counts={data.personnel.assigned_by_role} />
              )}
            </div>
            <div className="lg:col-span-5">
              {hasData && <AttentionStrip attention={data.attention} />}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <QuickActions />
            </div>
            <div className="min-w-0 lg:col-span-8">
              <RecentActivity />
            </div>
          </section>
        </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function WelcomeSummary({ userName }) {
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
        <p className="bhc-welcome-facility mt-2 leading-normal">
          Administrative Command Center
        </p>
        <p className="mt-1 text-sm leading-normal opacity-90">
          Account management and access tasks at a glance.
        </p>
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

function getDashboardFirstName(fallback) {
  const user = getCurrentUser();
  const name =
    user?.fullName ||
    user?.full_name ||
    user?.name ||
    user?.displayName ||
    user?.profile?.name;

  return String(name || fallback)
    .trim()
    .split(/\s+/)[0];
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
  return Number(
    date.toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }),
  );
}
