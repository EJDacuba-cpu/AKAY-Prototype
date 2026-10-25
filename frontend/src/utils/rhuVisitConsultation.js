import { resumeRhuVisit, startRhuVisit } from "../services/rhuVisitService.js";
import { rhuConsultationPath } from "./rhuVisitRoutes.js";

export { reviewReferralSlipPath, rhuConsultationPath } from "./rhuVisitRoutes.js";

/**
 * Start or resume through the existing RHU visit APIs. The same visit and
 * consultation identity are reused; a second queue row is never created.
 */
export async function startOrResumeRhuConsultation({ mode, visitId, patientId }) {
  const visit = mode === "resume" ? await resumeRhuVisit(visitId) : await startRhuVisit(visitId);
  const id = visit?.id || visitId;
  const pid = patientId || visit?.patient?.id;
  return { visit, path: rhuConsultationPath(id, pid) };
}
