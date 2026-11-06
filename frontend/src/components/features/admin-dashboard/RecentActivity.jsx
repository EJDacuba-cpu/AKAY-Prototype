import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Link } from "react-router";

import { ConnectionErrorState, InlineSpinner } from "../../common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
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
    queryKey: ["admin-dashboard", "recent-activity", "account"],
    queryFn: async () =>
      unwrapList(await apiRequest("/audit-logs?type=account&per_page=5")),
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
    <Card className="h-full overflow-hidden rounded-card shadow-card">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Recent Administrative Activity</CardTitle>
          <CardDescription>
            Latest account-management and administrator events.
          </CardDescription>
        </div>
        <Link
          to="/admin/audit-logs"
          className="shrink-0 text-xs font-semibold text-brand-700 hover:underline"
        >
          View Audit Logs
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 py-8">
            <InlineSpinner label="Loading activity..." />
          </div>
        ) : isError ? (
          <div className="px-4 pb-4">
            <ConnectionErrorState
              size="compact"
              variant={errorStateVariant(error)}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          </div>
        ) : recentActivities.length === 0 ? (
          <p className="mx-6 mb-6 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">
            No account activity yet.
          </p>
        ) : (
          <div className="divide-y divide-neutral-100 border-t border-neutral-200">
            {recentActivities.map((activity, index) => (
              <div
                key={activity.id ?? `${activity.action}-${activity.time}-${index}`}
                className="flex items-start gap-4 px-6 py-4 hover:bg-neutral-50"
              >
                <div className="mt-0.5 rounded-lg bg-neutral-100 p-2 text-ink-700">
                  <Activity size={15} aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">{activity.action}</p>
                  <p className="mt-1 text-xs text-neutral-500">{activity.user}</p>
                </div>

                <div className="text-right">
                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700">
                    {activity.type}
                  </span>
                  <p className="mt-1 text-[10px] text-neutral-500">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
