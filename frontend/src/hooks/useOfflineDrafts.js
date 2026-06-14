import { useCallback, useEffect, useState } from "react";
import {
  deleteReferralDraft,
  listReferralDrafts,
  updateReferralDraft,
} from "../services/offlineDraftService";

export default function useOfflineDrafts(scope) {
  const [drafts, setDrafts] = useState([]);
  const role = scope?.role || "";
  const userId = scope?.userId || "";

  const refreshDrafts = useCallback(async () => {
    if (!role) return;
    const nextDrafts = await listReferralDrafts({ role, userId });
    setDrafts(nextDrafts);
  }, [role, userId]);

  useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  return {
    drafts,
    pendingReferralDraftCount: drafts.length,
    refreshDrafts,
    deleteDraft: async (localDraftId) => {
      await deleteReferralDraft(localDraftId);
      await refreshDrafts();
    },
    markDraftFailed: async (localDraftId, errorMessage) => {
      await updateReferralDraft(localDraftId, { errorMessage });
      await refreshDrafts();
    },
  };
}
