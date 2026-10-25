import { Navigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { SoftLoadingArea } from "../../components/common";
import { getBhcFollowUpLegacyDestination } from "../../components/features/followups/followUpActions";
import { getFollowUpTask } from "../../services/followUpTaskService";
import { queryKeys } from "../../utils/queryKeys";

/**
 * The dedicated BHC Follow-up Details page is retired. Existing bookmarks
 * and notification deep links land here and are sent to Health Record
 * Details when a visit was recorded, otherwise back to the Follow-ups list.
 */
export default function BhcFollowUpRedirect() {
  const { taskId } = useParams();
  const { data: task, error, isLoading } = useQuery({
    queryKey: queryKeys.followUpTaskDetails("bhc", taskId),
    queryFn: () => getFollowUpTask(taskId),
    enabled: Boolean(taskId),
    retry: false,
  });

  if (!taskId) {
    return <Navigate to="/bhc/follow-ups" replace />;
  }

  if (isLoading && !task && !error) {
    return (
      <DashboardLayout role="bhc" title="Follow-ups">
        <SoftLoadingArea
          skeleton="details"
          isLoading
          message="Opening follow-up..."
          minHeight="min-h-[240px]"
        >
          <div className="min-h-[240px]" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  return <Navigate to={getBhcFollowUpLegacyDestination(task)} replace />;
}
