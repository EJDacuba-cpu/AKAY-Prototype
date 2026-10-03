import { getCareOverview } from "./careOverviewService";
import { queryKeys } from "../utils/queryKeys";
import { checkContinuedStart } from "../utils/startConsultation";

/**
 * Why Start Consultation could not open the workspace with the ticked
 * monitoring. `kind` is "unavailable" (the records could not be read) or
 * "inactive" (some were stopped or completed since the modal was read; their
 * ids are in `droppedMonitoringIds`).
 */
export class ContinuedStartError extends Error {
  constructor(kind, droppedMonitoringIds = []) {
    super(kind === "inactive" ? "Some monitoring is no longer active." : "Monitoring records could not be loaded.");
    this.name = "ContinuedStartError";
    this.kind = kind;
    this.droppedMonitoringIds = droppedMonitoringIds;
  }
}

/**
 * Reads the patient's monitoring fresh and confirms every ticked record is
 * still active, before the workspace opens. The result is cached under the
 * care-overview key, so the workspace opens already populated instead of
 * starting and then fetching. Throws ContinuedStartError otherwise.
 */
export async function prepareContinuedStart(queryClient, patientId, monitoringIds) {
  let overview;
  try {
    overview = await queryClient.fetchQuery({
      queryKey: queryKeys.careOverview(patientId),
      queryFn: () => getCareOverview(patientId),
      staleTime: 0,
    });
  } catch {
    throw new ContinuedStartError("unavailable");
  }
  const check = checkContinuedStart(overview, monitoringIds);
  if (!check.ok) throw new ContinuedStartError("inactive", check.droppedMonitoringIds);
  return overview;
}
