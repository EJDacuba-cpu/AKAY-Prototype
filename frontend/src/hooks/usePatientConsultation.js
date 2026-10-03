import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";

import {
  discardHealthRecordDraft,
  listHealthRecordDrafts,
} from "../services/healthRecordDraftService";
import { getCareOverview } from "../services/careOverviewService";
import { prepareContinuedStart } from "../services/startConsultationService";
import { getCurrentUser } from "../utils/auth";
import { buildPatientConsultationPath } from "../utils/consultationRoute";
import { DRAFTS_ENABLED } from "../utils/featureFlags";
import { queryKeys } from "../utils/queryKeys";
import { hasMonitoredConditions, startRoute } from "../utils/startConsultation";

/**
 * The consultation state of one patient: whether the signed-in user has an
 * unfinished consultation (draft) for them, where Start / Resume goes, and how
 * to discard the draft. Shared by the profile header's primary button and its
 * draft banner so both read one query.
 *
 * Without a draft, Start Consultation first reads the patient's care overview:
 * when the patient has active monitored conditions, `needsStartModal` is true
 * and the button opens the Start Consultation modal, where existing monitoring
 * can optionally be added to the visit. With none, the button goes straight to
 * the consultation. A draft always wins - Resume goes straight back to it. An
 * overview that fails to load never blocks starting: the button falls back to
 * a new consultation.
 */
export default function usePatientConsultation(patientId) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const ownerId = String(currentUser?.id || "");
  // The care-overview endpoint's own permission rule (CareOverviewController).
  const permissions = currentUser?.permissions || [];
  const canReadCareOverview =
    permissions.includes("consultations.encode") || permissions.includes("clinical.history");
  const queryKey = ["unfinished-consultations", ownerId];

  const { data: unfinished = [], isPending, isError } = useQuery({
    queryKey,
    queryFn: listHealthRecordDrafts,
    enabled: DRAFTS_ENABLED && Boolean(ownerId && patientId),
    staleTime: 0,
  });
  const draft =
    unfinished.find((item) => String(item.patient?.id) === String(patientId)) || null;

  const careOverviewQuery = useQuery({
    queryKey: queryKeys.careOverview(patientId),
    queryFn: () => getCareOverview(patientId),
    enabled: Boolean(patientId && canReadCareOverview),
    staleTime: 0,
    retry: false,
  });
  const careOverview = careOverviewQuery.data || null;
  // A failed overview is not pending: Start then opens a new consultation.
  // A disabled query stays "pending" forever, so only wait when it runs.
  const careOverviewPending = Boolean(patientId && canReadCareOverview) && careOverviewQuery.isPending;

  const discard = useMutation({
    mutationFn: discardHealthRecordDraft,
    onSuccess: async (_, draftId) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, (current = []) =>
        current.filter((item) => item.id !== draftId),
      );
      toast.success("Draft discarded.");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(error?.message || "Unable to discard this draft. Please try again.");
    },
  });

  const resumeParams = draft
    ? new URLSearchParams({ patientId: String(patientId), draftId: draft.id })
    : null;

  return {
    draft,
    // Without a draft the overview decides where Start goes, so wait for it.
    isPending: (DRAFTS_ENABLED && isPending) || (!draft && careOverviewPending),
    isError: DRAFTS_ENABLED && isError,
    careOverview,
    needsStartModal: !draft && hasMonitoredConditions(careOverview),
    /**
     * Opens the consultation for what the Start Consultation modal chose.
     * With monitoring ticked it first reads that monitoring fresh and rejects
     * (ContinuedStartError) if a record is gone, so the workspace never opens
     * half loaded; with none ticked it opens at once.
     */
    start: async ({ monitoringIds = [] } = {}) => {
      if (monitoringIds.length) await prepareContinuedStart(queryClient, patientId, monitoringIds);
      navigate(startRoute({ patientId, monitoringIds }));
    },
    retry: () => queryClient.invalidateQueries({ queryKey }),
    discarding: discard.isPending,
    discard: () => draft && discard.mutateAsync(draft.id),
    startPath: draft
      ? `/bhc/health-records/add?${resumeParams}`
      : buildPatientConsultationPath(patientId),
    primaryLabel: draft ? "Resume Consultation" : "Start Consultation",
  };
}
