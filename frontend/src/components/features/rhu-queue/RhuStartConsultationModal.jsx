import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import StartConsultationModal from "../patients/profile/StartConsultationModal";
import { getCareOverview } from "../../../services/careOverviewService";
import { queryKeys } from "../../../utils/queryKeys";
import { startOrResumeRhuConsultation } from "../../../utils/rhuVisitConsultation";
import { getRhuVisit } from "../../../services/rhuVisitService";
import { getCurrentUser } from "../../../utils/auth";
import { formDraftOwnerContext } from "../../../utils/formDraftRequest";
import { RHU_DRAFTS_ENABLED } from "../../../utils/featureFlags";
import { rhuConsultationPath, visitContinuedFollowUpIds } from "../../../utils/rhuVisitRoutes";
import { rhuEntryKey, lookupRhuRecovery } from "../../../utils/rhuDraftResume";
import { lookupHealthRecordDraft } from "../../../services/healthRecordDraftService";
import useRhuConsultationRecovery from "../../../hooks/useRhuConsultationRecovery";
import RhuConsultationRecoveryDialog from "./RhuConsultationRecoveryDialog";
import { Button } from "../../ui/button";

function EntryErrorDialog({ title, message, onClose, onRetry }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-alert-200 bg-alert-50 p-3 text-sm text-alert-700" aria-label={title}>
    <span>{message}</span><Button variant="secondary" onClick={onRetry}>Retry</Button><Button variant="secondary" onClick={onClose}>Cancel</Button>
  </div>;
}

/** Shared queue/profile entry: recover first, then use the existing visit selection. */
export default function RhuStartConsultationModal({
  patientId,
  visitId,
  patientName,
  onClose,
  onStarted,
  onCheckingChange,
}) {
  const client = useQueryClient();
  const user = getCurrentUser() || {};
  const owner = String(formDraftOwnerContext(user));
  const [selecting, setSelecting] = useState(false);
  const [entryError, setEntryError] = useState("");
  const starting = useRef(false);
  const closed = useRef(false);
  const startedCallback = useRef(onStarted);
  useEffect(() => { startedCallback.current = onStarted; });
  useEffect(() => { closed.current = false; return () => { closed.current = true; }; }, []);
  const visitQuery = useQuery({
    queryKey: ["rhu-consultation-entry-visit", owner, visitId],
    queryFn: async () => {
      const visit = await getRhuVisit(visitId);
      if (String(visit?.patient?.id || visit?.patient_id) !== String(patientId) || !["waiting", "in_consultation"].includes(visit?.status)) {
        throw new Error("This visit is no longer available for this patient.");
      }
      return visit;
    },
    staleTime: 0, retry: false, refetchOnMount: "always", refetchOnWindowFocus: false,
  });
  // Keep the last loaded visit during background refetches. Nulling it on every
  // isFetching reset recovery mid-Resume and made unfinished drafts look broken.
  const visit = visitQuery.data ?? null;
  const visitLoading = visitQuery.isPending || (visitQuery.isFetching && !visit);
  function enter(readyVisit, draft = null) {
    if (!readyVisit || closed.current || owner !== String(formDraftOwnerContext(getCurrentUser() || {}))) return;
    client.setQueryData(rhuEntryKey(owner, visitId, patientId), {
      owner, draft, consultationUuid: readyVisit.consultation_uuid || readyVisit.consultationUuid, createdAt: Date.now(),
    });
    startedCallback.current?.(rhuConsultationPath(readyVisit.id, patientId, visitContinuedFollowUpIds(readyVisit)));
  }
  const recovery = useRhuConsultationRecovery({
    visit, patientId, owner, currentUserId: user.id,
    enabled: RHU_DRAFTS_ENABLED && !selecting,
    onRestore: async (draft) => {
      const latest = visitQuery.data || visit;
      if (!latest) return;
      try {
        if (latest.status === "in_consultation") {
          const { visit: readyVisit } = await startOrResumeRhuConsultation({
            mode: "resume", visitId, patientId,
          });
          enter(readyVisit || latest, draft);
          return;
        }
        const { visit: readyVisit } = await startOrResumeRhuConsultation({
          mode: "start", visitId, patientId,
          entryConsultationUuid: latest.consultation_uuid || latest.consultationUuid,
        });
        enter(readyVisit, draft);
      } catch (error) {
        if (latest.status === "in_consultation") {
          enter(latest, draft);
          return;
        }
        toast.error(error?.message || "Unable to reopen this consultation.");
      }
    },
    onDiscarded: () => { setSelecting(true); void visitQuery.refetch(); },
  });
  const showSelection = selecting || recovery.ready;
  // Match BHC: a failed overview refetch must not replace an already-usable
  // modal (pending follow-ups stay selectable; start still validates on the API).
  const overviewQuery = useQuery({
    queryKey: queryKeys.careOverview(patientId),
    queryFn: () => getCareOverview(patientId),
    enabled: Boolean(patientId) && showSelection,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const overview = overviewQuery.data || null;
  const overviewUnavailable = overviewQuery.isError && !overview;
  const checking = !visitQuery.isError && !entryError && !overviewUnavailable && (visitLoading || (!showSelection && recovery.checking) || (showSelection && overviewQuery.isPending && !overview));
  useEffect(() => { onCheckingChange?.(checking); }, [checking, onCheckingChange]);
  useEffect(() => () => onCheckingChange?.(false), [onCheckingChange]);

  async function handleStart({ followUpIds = [] } = {}) {
    if (starting.current) return;
    starting.current = true;
    try {
      const { visit: readyVisit } = await startOrResumeRhuConsultation({
        mode: "start", visitId, patientId, followUpIds,
        entryConsultationUuid: visit?.consultation_uuid || visit?.consultationUuid,
      });
      if (closed.current) return;
      let latest;
      try {
        latest = await lookupRhuRecovery({ visit: readyVisit, patientId, owner, api: { lookup: lookupHealthRecordDraft } });
      } catch {
        setEntryError("We couldn't check for unfinished work. Please try again.");
        return;
      }
      if (latest) {
        setSelecting(false);
        await visitQuery.refetch();
        recovery.retry();
        return;
      }
      toast.success(`Consultation started for ${patientName || "this patient"}.`);
      enter(readyVisit);
    } catch (error) {
      if (error?.code !== "CONSULTATION_ENTRY_CHANGED") throw error;
      setSelecting(false);
      await visitQuery.refetch();
      recovery.retry();
    } finally { starting.current = false; }
  }

  if (visitQuery.isError) return <EntryErrorDialog title="Check Consultation" message={visitQuery.error.message} onClose={onClose} onRetry={() => visitQuery.refetch()} />;
  if (entryError) return <RhuConsultationRecoveryDialog recovery={{ ...recovery, checking: false, decision: null, error: entryError, retry: () => { setEntryError(""); setSelecting(false); void visitQuery.refetch(); recovery.retry(); } }} patientName={patientName} onClose={onClose} />;
  if (checking || !visit) return null;
  if (!showSelection) {
    const decision = <RhuConsultationRecoveryDialog recovery={recovery} patientName={patientName} onClose={onClose} />;
    return recovery.decision ? createPortal(decision, document.body) : decision;
  }

  if (overviewQuery.isPending && !overview) {
    return null;
  }

  if (overviewUnavailable) return <EntryErrorDialog title="Start Consultation" message={overviewQuery.error?.message || "Unable to check Initial/Follow-up eligibility."} onClose={onClose} onRetry={() => overviewQuery.refetch()} />;

  return createPortal(
    <StartConsultationModal
      variant="rhu"
      overview={overview}
      onCancel={onClose}
      onStart={handleStart}
    />
  , document.body);
}
