import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  discardHealthRecordDraft,
  listHealthRecordDrafts,
} from "../services/healthRecordDraftService";
import { getCurrentUser } from "../utils/auth";
import { buildPatientConsultationPath } from "../utils/consultationRoute";

/**
 * The consultation state of one patient: whether the signed-in user has an
 * unfinished consultation (draft) for them, where Start / Resume goes, and how
 * to discard the draft. Shared by the profile header's primary button and its
 * draft banner so both read one query.
 */
export default function usePatientConsultation(patientId) {
  const queryClient = useQueryClient();
  const ownerId = String(getCurrentUser()?.id || "");
  const queryKey = ["unfinished-consultations", ownerId];

  const { data: unfinished = [], isPending, isError } = useQuery({
    queryKey,
    queryFn: listHealthRecordDrafts,
    enabled: Boolean(ownerId && patientId),
    staleTime: 0,
  });
  const draft =
    unfinished.find((item) => String(item.patient?.id) === String(patientId)) || null;

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
    isPending,
    isError,
    retry: () => queryClient.invalidateQueries({ queryKey }),
    discarding: discard.isPending,
    discard: () => draft && discard.mutateAsync(draft.id),
    startPath: draft
      ? `/bhc/health-records/add?${resumeParams}`
      : buildPatientConsultationPath(patientId),
    primaryLabel: draft ? "Resume Consultation" : "Start Consultation",
  };
}
