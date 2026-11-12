import { Navigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionErrorState, SoftLoadingArea } from "../../components/common";
import { getFollowUpLegacyDestination } from "../../components/features/followups/followUpActions";
import { getFollowUpTask } from "../../services/followUpTaskService";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { queryKeys } from "../../utils/queryKeys";

/**
 * The dedicated Follow-up Details page is retired. Existing bookmarks and
 * notification deep links land here and are sent to Health Record Details
 * when a visit was recorded, otherwise back to the Follow-ups list.
 */
export default function FollowUpLegacyRedirect({ role = "bhc" }) {
  const { taskId } = useParams();
  const basePath = `/${role}`;
  const { data: task, error, isPending: isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.followUpTaskDetails(role, taskId),
    queryFn: () => getFollowUpTask(taskId),
    enabled: Boolean(taskId),
    retry: false,
  });

  if (!taskId) {
    return <Navigate to={`${basePath}/follow-ups`} replace />;
  }

  if (isLoading && !task && !error) {
    return (
      <DashboardLayout role={role} title="Follow-ups">
        <SoftLoadingArea
          skeleton="record-details" skeletonOptions={{ role }}
          isLoading
          message="Opening follow-up..."
          minHeight="min-h-[240px]"
        >
          <div className="min-h-[240px]" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (error && !task && ![404].includes(Number(error?.status))) {
    return (
      <DashboardLayout role={role} title="Follow-ups">
        <ConnectionErrorState
          fullPage
          variant={errorStateVariant(error)}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      </DashboardLayout>
    );
  }

  return <Navigate to={getFollowUpLegacyDestination(task, basePath)} replace />;
}

/** @deprecated Prefer FollowUpLegacyRedirect with role="bhc". */
export function BhcFollowUpRedirect() {
  return <FollowUpLegacyRedirect role="bhc" />;
}
