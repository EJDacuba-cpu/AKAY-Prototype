import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";

import {
  discardHealthRecordDraft,
  listHealthRecordDrafts,
  getHealthRecordDraft,
  lookupHealthRecordDraft,
  transitionDraft,
} from "../services/healthRecordDraftService";
import { createClinicalDraftRecovery } from "../services/clinicalDraftRecoveryService";
import { formDraftOwnerContext } from "../utils/formDraftRequest";
import { consultationRecoveryEntry, consultationRecoveryPath, consultationEntryKey, prepareConsultationRecovery } from "../utils/consultationRecoveryEntry";
import * as legacyLocalDraftVault from "../services/localDraftVault";
import { getCareOverview } from "../services/careOverviewService";
import { getConsultationPatientQuery } from "../services/consultationPatientQuery";
import { prepareContinuedStart } from "../services/startConsultationService";
import { getCurrentUser } from "../utils/auth";
import { buildPatientConsultationPath } from "../utils/consultationRoute";
import { DRAFTS_ENABLED, FORM_DRAFTS_ENABLED } from "../utils/featureFlags";
import { queryKeys } from "../utils/queryKeys";
import { consultationNeedsStartModal, reachedPath, startRoute } from "../utils/startConsultation";

/**
 * The consultation state of one patient: whether the signed-in user has an
 * unfinished consultation (draft) for them, where Start / Resume goes, and how
 * to discard the draft. Shared by the profile header's primary button and its
 * draft banner so both read one query.
 *
 * Without a draft, Start Consultation always opens the selection modal, even
 * when the patient has no pending follow-up (New Consultation is the default).
 * Continue Scheduled Follow-up is offered only when eligible pending tasks
 * exist. A draft always wins - Resume goes straight back to it. An overview
 * that fails to load never blocks starting: the modal still opens a new
 * consultation.
 *
 * Start and Resume load the patient record the workspace restricts services
 * by before navigating (`opening` is true meanwhile), so the form never opens
 * with every service briefly available.
 */
export default function usePatientConsultation(patientId) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const ownerId = String(currentUser?.id || "");
  const ownerContext = String(formDraftOwnerContext(currentUser || {}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recoveryVault = useMemo(() => FORM_DRAFTS_ENABLED ? createClinicalDraftRecovery(currentUser || {}) : legacyLocalDraftVault, [ownerContext]);
  const vaultOwner = FORM_DRAFTS_ENABLED ? ownerContext : ownerId;
  // The care-overview endpoint's own permission rule (CareOverviewController).
  const permissions = currentUser?.permissions || [];
  const canReadCareOverview =
    permissions.includes("consultations.encode") || permissions.includes("clinical.history");
  const queryKey = ["unfinished-consultations", ownerContext, String(patientId || "")];
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);

  /** Loads the patient the workspace needs (plus `prepare`), then navigates. */
  async function openWorkspace(path, prepare, handoff) {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      await Promise.all([queryClient.fetchQuery(getConsultationPatientQuery(patientId)), prepare?.()]);
      if (ownerContext !== formDraftOwnerContext(getCurrentUser() || {})) throw new Error("The account or working facility changed. Reopen the patient profile.");
      if (handoff) queryClient.setQueryData(consultationEntryKey(ownerContext, patientId), { ...handoff, owner: ownerContext, patientId: String(patientId), createdAt: Date.now() });
      // Stays "opening" until the profile unmounts, so the button never flashes back.
      await navigate(path);
      // A leave guard (an unsaved Patient Background edit) can stop the
      // navigation; then the user is still here and the button must recover.
      if (typeof window !== "undefined" && !reachedPath(window.location, path)) setOpening(false);
    } catch (error) {
      setOpening(false);
      throw error;
    } finally {
      openingRef.current = false;
    }
  }

  const { data: unfinished = [], isPending, isError } = useQuery({
    queryKey,
    queryFn: async () => FORM_DRAFTS_ENABLED
      ? [await lookupHealthRecordDraft({ patientId, draftOwnerContext: ownerContext })].filter(Boolean)
      : listHealthRecordDrafts(),
    enabled: DRAFTS_ENABLED && Boolean(ownerId && patientId) && permissions.includes("consultations.encode"),
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
    mutationFn: async (id) => {
      const options = FORM_DRAFTS_ENABLED ? { draftOwnerContext: ownerContext } : {};
      const current = await getHealthRecordDraft(id, options);
      if (!current.canEdit) throw new Error("Another staff member is editing this consultation.");
      return discardHealthRecordDraft(id, current.version, options);
    },
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
  const startPath = draft
    ? `/bhc/health-records/add?${resumeParams}`
    : buildPatientConsultationPath(patientId);

  async function checkRecovery() {
    const [server, device] = await Promise.all([
      queryClient.fetchQuery({ queryKey, queryFn: async () => [await lookupHealthRecordDraft({ patientId, draftOwnerContext: ownerContext })].filter(Boolean), staleTime: 0, retry: false }),
      recoveryVault.listLocalDrafts(vaultOwner),
    ]);
    if (ownerContext !== formDraftOwnerContext(getCurrentUser() || {})) throw new Error("The account or working facility changed. Reopen the patient profile.");
    return consultationRecoveryEntry({ patientId, server, device });
  }

  async function discardRecovery(entry) {
    const fresh = await checkRecovery();
    if (!fresh) return;
    const beforeUuid = entry.server?.consultationUuid || entry.local?.record?.draft?.consultationUuid;
    const currentUuid = fresh.server?.consultationUuid || fresh.local?.record?.draft?.consultationUuid;
    if (beforeUuid !== currentUuid || (fresh.server && fresh.server.version !== entry.server?.version)) throw new Error("The unfinished consultation changed. Retry the recovery check before discarding.");
    if (fresh.server) {
      const options = { draftOwnerContext: ownerContext };
      const current = await transitionDraft(fresh.server.id, "claim", fresh.server.version, undefined, options);
      if (!current.canEdit) throw new Error("Another staff member is editing this consultation.");
      await discardHealthRecordDraft(current.id, current.version, options);
      if (fresh.local) await recoveryVault.deleteLocalDraft({ ownerKey: vaultOwner, consultationKey: fresh.local.consultationKey });
    } else if (FORM_DRAFTS_ENABLED) await recoveryVault.discardDeviceDraft({ ownerKey: vaultOwner, consultationKey: fresh.local.consultationKey });
    else await recoveryVault.deleteLocalDraft({ ownerKey: vaultOwner, consultationKey: fresh.local.consultationKey });
    await queryClient.invalidateQueries({ queryKey });
  }

  return {
    draft,
    // Without a draft the overview decides where Start goes, so wait for it.
    isPending: (DRAFTS_ENABLED && isPending) || (!draft && careOverviewPending),
    isError: DRAFTS_ENABLED && isError,
    opening,
    careOverview,
    needsStartModal: DRAFTS_ENABLED || consultationNeedsStartModal(draft),
    recoveryEnabled: DRAFTS_ENABLED,
    checkRecovery,
    discardRecovery,
    resumeRecovery: async (entry, source = "") => {
      const options = { draftOwnerContext: ownerContext };
      const result = await prepareConsultationRecovery({
        patientId, entry, source, vault: recoveryVault, ownerKey: vaultOwner,
        lookup: () => lookupHealthRecordDraft({ patientId, draftOwnerContext: ownerContext }),
        load: (id) => getHealthRecordDraft(id, { ...options, claim: false }),
        claim: (id, version) => transitionDraft(id, "claim", version, undefined, options),
      });
      if (result.decision) return result;
      await openWorkspace(consultationRecoveryPath(patientId, entry), undefined, result);
      return result;
    },
    /**
     * Opens the consultation for what the Start Consultation modal chose.
     * With monitoring, scheduled follow-ups or RHU recommendations ticked it
     * first reads them fresh and rejects (ContinuedStartError) if a record is
     * gone, a follow-up fulfilled or a recommendation withdrawn, so the
     * workspace never opens half loaded; with none ticked it opens at once.
     * Opening never completes a follow-up; only a successful save does.
     */
    start: async ({ monitoringIds = [], startConditionIds = [], followUpIds = [] } = {}) => {
      if (DRAFTS_ENABLED) {
        const entry = await checkRecovery();
        if (entry) throw Object.assign(new Error("An unfinished consultation was found."), { recoveryEntry: entry });
      }
      return openWorkspace(
        startRoute({ patientId, monitoringIds, startConditionIds, followUpIds }),
        monitoringIds.length || startConditionIds.length || followUpIds.length
          ? () => prepareContinuedStart(queryClient, patientId, monitoringIds, startConditionIds, followUpIds)
          : undefined,
        DRAFTS_ENABLED ? { draft: null, unsynced: false } : undefined,
      );
    },
    /** Start / Resume without the modal: loads the patient, then opens `startPath`. */
    open: async () => {
      try {
        await openWorkspace(startPath);
      } catch {
        toast.error("Unable to open the consultation. Please try again.");
      }
    },
    retry: () => queryClient.invalidateQueries({ queryKey }),
    discarding: discard.isPending,
    discard: () => draft && discard.mutateAsync(draft.id),
    startPath,
    primaryLabel: draft ? "Open Consultation" : "Start Consultation",
  };
}
