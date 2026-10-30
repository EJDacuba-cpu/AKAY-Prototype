import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Link } from "react-router";

import { ConnectionErrorState, InlineSpinner } from "../../common";
import { apiRequest, unwrapList } from "../../../services/apiClient";
import { activityLabel } from "../../../utils/adminDashboard";
import { errorStateVariant } from "../../../utils/errorStateVariant";
import { formatDisplayValue, formatUserName } from "../../../utils/formatters";

const ACTIVITY_LIMIT = 5;

export default function RecentActivity() {
  const {
    data: auditLogs = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-dashboard", "recent-activity"],
    queryFn: async () => unwrapList(await apiRequest("/audit-logs?per_page=5")),
    retry: false,
  });

  const recentActivities = auditLogs.slice(0, ACTIVITY_LIMIT).map((log, index) => ({
    id:
      log.id ??
      log.audit_log_id ??
      log.auditLogId ??
      `${log.created_at || log.createdAt || "activity"}-${index}`,
    // Patient-module descriptions carry the patient's name, so they get a generic label.
    action: formatDisplayValue(activityLabel(log), "System activity"),
    user: formatUserName(
      log.user || log.createdBy || log.created_by || log.user_name,
      "System",
    ),
    time: formatRelativeTime(log.created_at || log.createdAt),
    type: formatDisplayValue(log.module, "Activity"),
  }));

  return (
    <section className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
      <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-[#0F172A]">
            Recent Account Activity
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Latest account and referral actions for MHO review.
          </p>
        </div>

        <Link
          to="/admin/audit-logs"
          className="text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
        >
          View Audit Logs
        </Link>
      </div>

      {isLoading ? (
        <div className="px-6 py-8">
          <InlineSpinner label="Loading activity..." />
        </div>
      ) : isError ? (
        <ConnectionErrorState
          size="compact"
          variant={errorStateVariant(error)}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : (
        <div className="divide-y divide-[#F3F4F6]">
          {recentActivities.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-[#9CA3AF]">
              No audit activity yet.
            </div>
          ) : recentActivities.map((activity, index) => (
            <div
              key={activity.id ?? `${activity.action}-${activity.time}-${index}`}
              className="flex items-start gap-4 px-6 py-4 hover:bg-[#F9FAFB]"
            >
              <div className="mt-0.5 rounded-lg bg-[#FEF2F2] p-2 text-[#B91C1C]">
                <Activity size={15} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  {activity.action}
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  {activity.user}
                </p>
              </div>

              <div className="text-right">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {activity.type}
                </span>
                <p className="mt-1 text-[10px] text-[#9CA3AF]">
                  {activity.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatRelativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Recently";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));

  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
