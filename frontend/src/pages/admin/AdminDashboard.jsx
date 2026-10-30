import {
  useEffect,
  useState,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useSearchParams } from "react-router";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { PageStateWrapper, RefreshingIndicator } from "../../components/common";
import AccountCounts from "../../components/features/admin-dashboard/AccountCounts";
import AttentionStrip from "../../components/features/admin-dashboard/AttentionStrip";
import BarangayTable from "../../components/features/admin-dashboard/BarangayTable";
import FacilityPersonnelTable from "../../components/features/admin-dashboard/FacilityPersonnelTable";
import PersonnelDistribution from "../../components/features/admin-dashboard/PersonnelDistribution";
import OverviewCards from "../../components/features/admin-dashboard/OverviewCards";
import PeriodSelect from "../../components/features/admin-dashboard/PeriodSelect";
import QuickActions from "../../components/features/admin-dashboard/QuickActions";
import RecentActivity from "../../components/features/admin-dashboard/RecentActivity";
import { loadAdminDashboard } from "../../services/adminDashboardService";
import { parsePeriod } from "../../utils/adminDashboard";
import { getCurrentUser } from "../../utils/auth";
import { queryKeys } from "../../utils/queryKeys";

export default function AdminDashboard() {
  const [now, setNow] = useState(() => new Date());
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));
  const {
    data,
    isPending,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.adminDashboard(period),
    queryFn: () => loadAdminDashboard(period),
    placeholderData: keepPreviousData,
    // Counts change as the MHO works, so returning to the page shows the cache and refetches.
    staleTime: 0,
    retry: false,
  });
  const hasData = Boolean(data);
  const asOf = formatAsOf(data?.generated_at);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const userName = getDashboardFirstName("MHO");

  return (
    <DashboardLayout role="admin" title="Dashboard">
      <PageStateWrapper skeleton="dashboard"
        // isPending (not isLoading) so a first load that is paused offline still shows the skeleton.
        isLoading={isPending}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={hasData}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading dashboard..."
      >
        <div className="mx-auto w-full max-w-[1500px] space-y-4">
          {isFetching && hasData && (
            <div className="flex justify-end">
              <RefreshingIndicator label="Updating dashboard..." />
            </div>
          )}

          <section className="anim-fade-up px-5 py-3">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#B91C1C]">
                  Admin Dashboard
                </p>

                <h1 className="mt-2 text-2xl font-black tracking-tight text-[#0F172A] md:text-3xl">
                  {getGreeting(now)}, {userName}
                </h1>

                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#64748B]">
                  Municipal health operations and account tasks at a glance.
                </p>
              </div>

              <div className="shrink-0 text-left lg:text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94A3B8]">
                  Today
                </p>

                <p className="mt-1 text-sm font-bold text-[#0F172A]">
                  {formatDashboardDate(now)}
                </p>

                <p className="mt-1 text-xs font-semibold text-[#64748B]">
                  {formatDashboardTime(now)}
                </p>
              </div>
            </div>
          </section>

          {hasData && <AttentionStrip attention={data.attention} />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748B]">
                Municipal health overview
              </h2>
              {asOf && <p className="mt-0.5 text-[11px] text-[#64748B]">As of {asOf}</p>}
            </div>
            <PeriodSelect
              value={period}
              onChange={(next) => setSearchParams({ period: next }, { replace: true })}
            />
          </div>

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
                className="text-[#B91C1C] hover:text-[#7F1D1D] hover:underline disabled:opacity-60"
              >
                Retry
              </button>
            </div>
          )}

          {hasData && (
            <OverviewCards
              personnel={data.personnel}
              pendingResetRequests={data.attention.reset_requests}
              pendingInvitations={data.pending_invitations}
            />
          )}

          {hasData && <PersonnelDistribution counts={data.personnel.assigned_by_role} />}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="@container min-w-0 space-y-4">
              {hasData && (
                <div className="grid items-start gap-4 @min-[960px]:grid-cols-2">
                  <div className="min-w-0">
                    <BarangayTable rows={data.personnel.barangay_health_centers} />
                  </div>
                  <FacilityPersonnelTable type="rhu" rows={data.personnel.rural_health_units} />
                </div>
              )}
              <RecentActivity />
            </div>

            <aside className="min-w-0 space-y-4">
              <QuickActions />
              {hasData && <AccountCounts accounts={data.accounts} />}
            </aside>
          </div>
        </div>
      </PageStateWrapper>
    </DashboardLayout>
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
  const hour = date.getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDashboardDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatAsOf(value) {
  const date = value ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime()) ? formatDashboardTime(date) : "";
}

function formatDashboardTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
