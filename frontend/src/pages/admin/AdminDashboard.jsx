import {
  useEffect,
  useState,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { PageStateWrapper, RefreshingIndicator } from "../../components/common";
import AccountCounts from "../../components/features/admin-dashboard/AccountCounts";
import AttentionStrip from "../../components/features/admin-dashboard/AttentionStrip";
import BarangayTable from "../../components/features/admin-dashboard/BarangayTable";
import DoctorAvailability from "../../components/features/admin-dashboard/DoctorAvailability";
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
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.adminDashboard(period),
    queryFn: () => loadAdminDashboard(period),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const hasData = Boolean(data);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const userName = getDashboardFirstName("MHO");

  return (
    <DashboardLayout role="admin" title="Dashboard">
      <PageStateWrapper skeleton="dashboard"
        isLoading={isLoading}
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

          <section className="anim-fade-up p-5">
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

          <AttentionStrip attention={data?.attention} />

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748B]">
              Municipal health overview
            </h2>
            <PeriodSelect
              value={period}
              onChange={(next) => setSearchParams({ period: next }, { replace: true })}
            />
          </div>

          <OverviewCards
            referrals={data?.referrals}
            followUps={data?.follow_ups}
            patients={data?.patients}
            medicines={data?.medicines}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <BarangayTable rows={data?.barangays} />
              <RecentActivity />
            </div>

            <aside className="min-w-0 space-y-6">
              <QuickActions />
              <DoctorAvailability />
              <AccountCounts accounts={data?.accounts} />
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

function formatDashboardTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
