import { resumeRhuVisit, startRhuVisit } from "../services/rhuVisitService.js";
import { rhuConsultationPath, visitContinuedFollowUpIds } from "./rhuVisitRoutes.js";

export {
  reviewReferralSlipPath,
  rhuConsultationPath,
  selectedRhuFollowUpIds,
  visitContinuedFollowUpIds,
} from "./rhuVisitRoutes.js";

/**
 * Start or resume through the existing RHU visit APIs. The same visit and
 * consultation identity are reused; a second queue row is never created.
 */
export async function startOrResumeRhuConsultation({ mode, visitId, patientId, followUpIds } = {}) {
  const visit = mode === "resume"
    ? await resumeRhuVisit(visitId)
    : await startRhuVisit(visitId, { followUpTaskIds: followUpIds ?? [] });
  const id = visit?.id || visitId;
  const pid = patientId || visit?.patient?.id;
  return { visit, path: rhuConsultationPath(id, pid, visitContinuedFollowUpIds(visit)) };
}
