import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import TbTreatmentCardForm, { normalizeTbData } from "./TbTreatmentCardForm";
import TbMonitoringPanel from "./TbMonitoringPanel";
import TbCaseFollowUpPanel from "./TbCaseFollowUpPanel";
import { projectTbCaseCard } from "../../../utils/tbCaseFollowUp";
import { getTbCase, downloadTbCasePdf } from "../../../services/tbCaseService";

export function SharedTbCaseDocument({ tbCase }) {
  return <div className="min-w-0 space-y-3">
    <p className="text-sm font-semibold text-ink-900">{tbCase.case_number} · {tbCase.reporting_year}</p>
    <p className="text-sm text-neutral-600">RHU diagnosis, classification, prescription and outcome are read-only.</p>
    <TbTreatmentCardForm value={normalizeTbData(projectTbCaseCard(tbCase))} readOnly includeLegacyDoseCalendar={false} laboratoryContext="rhu" laboratoryTests={tbCase.diagnosis_snapshot?.laboratory_tests || []} />
  </div>;
}

export default function SharedTbCaseView({ caseId, onReadyChange }) {
  const query = useQuery({ queryKey: ["tb-case", String(caseId)], queryFn: () => getTbCase(caseId), enabled: Boolean(caseId), retry: false, staleTime: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessBlocked, setAccessBlocked] = useState(false);
  const ready = !accessBlocked && !query.isError && !query.isPending && !query.isFetching && !query.isPaused && Boolean(query.data);
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  useEffect(() => () => onReadyChange?.(false), [caseId, onReadyChange]);
  async function refreshScope() {
    const result = await query.refetch();
    if (result.data && !result.isError && !result.isFetching && !result.isPaused) setAccessBlocked(false);
    return result;
  }
  function handleAccessDenied() { setAccessBlocked(true); void refreshScope(); }
  async function download() {
    setBusy(true); setError("");
    try { await downloadTbCasePdf(caseId); }
    catch (failure) { setError(failure.message || "Unable to download Form 4B."); if ([403, 404].includes(failure.status)) handleAccessDenied(); else void refreshScope(); }
    finally { setBusy(false); }
  }
  const denied = [403, 404].includes(query.error?.status);
  // Keep the monitoring owner mounted during background checks so its retry UUID
  // survives. Confirmed denial removes it; cached clinical data is never rendered.
  return <section aria-label="Shared Form 4B" className="min-w-0 space-y-4">
    {(query.isError || accessBlocked) && <div className="space-y-2"><p role="alert" className="text-sm text-red-800">Form 4B is unavailable. Access may have changed, or the connection failed.</p><Button variant="secondary" onClick={refreshScope}>Retry</Button></div>}
    {(query.isPending || query.isFetching || query.isPaused) && <p role="status" className="text-sm text-neutral-600">Checking Form 4B access…</p>}
    {ready && <>
    <div className="flex flex-wrap justify-between gap-3"><h3 className="text-base font-semibold text-ink-900">Shared DS-TB Treatment Card</h3><Button variant="secondary" disabled={busy} onClick={download}>{busy ? "Preparing…" : "Download Form 4B"}</Button></div>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <SharedTbCaseDocument tbCase={query.data} />
    </>}
    {!denied && <TbMonitoringPanel key={caseId} caseId={caseId} enabled={ready} />}
    {!denied && <TbCaseFollowUpPanel key={`follow-up-${caseId}`} caseId={caseId} enabled={ready} onAccessDenied={handleAccessDenied} />}
  </section>;
}
