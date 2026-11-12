import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import TbTreatmentCardForm, { normalizeTbData } from "./TbTreatmentCardForm";
import TbCaseEndorsementPanel from "./TbCaseEndorsementPanel";
import TbMonitoringPanel from "./TbMonitoringPanel";
import TbCaseFollowUpPanel from "./TbCaseFollowUpPanel";
import { projectTbCaseCard } from "../../../utils/tbCaseFollowUp";
import { getLinkedTbCase, downloadTbCasePdf } from "../../../services/tbCaseService";

/**
 * Displays an existing DS-TB treatment case linked to a finalized RHU consultation.
 * Form 4B registration CREATE is discontinued; this panel is read/ops only.
 */
export default function TbCaseRegistrationPanel({ recordId }) {
  const query = useQuery({
    queryKey: ["tb-linked-case", String(recordId)],
    queryFn: () => getLinkedTbCase(recordId),
    enabled: Boolean(recordId),
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registered = query.data?.case;

  async function download() {
    if (!registered?.id) return;
    setBusy(true);
    setError("");
    try {
      await downloadTbCasePdf(registered.id);
    } catch (failure) {
      setError(failure.message || "Unable to download the treatment card. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (query.isPending) {
    return (
      <section className="my-5 min-w-0 space-y-4 border-t border-neutral-200 bg-white px-4 py-5 sm:px-5" aria-labelledby="tb-case-title">
        <h2 id="tb-case-title" className="text-base font-semibold text-ink-900">DS-TB Treatment Case</h2>
        <p role="status" className="text-sm text-neutral-600">Loading linked TB case…</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="my-5 min-w-0 space-y-4 border-t border-neutral-200 bg-white px-4 py-5 sm:px-5" aria-labelledby="tb-case-title">
        <h2 id="tb-case-title" className="text-base font-semibold text-ink-900">DS-TB Treatment Case</h2>
        <p role="alert" className="text-sm text-red-800">Unable to load the linked TB case.</p>
        <Button variant="secondary" onClick={() => query.refetch()} disabled={busy}>Retry</Button>
      </section>
    );
  }

  if (!registered) {
    return null;
  }

  return (
    <section className="my-5 min-w-0 space-y-4 border-t border-neutral-200 bg-white px-4 py-5 sm:px-5" aria-labelledby="tb-case-title">
      <h2 id="tb-case-title" className="text-base font-semibold text-ink-900">DS-TB Treatment Case</h2>
      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-700">
          <span className="font-semibold text-ink-900">{registered.case_number}</span>
          {" · "}
          {registered.reporting_year}
          {" · "}
          {registered.status === "closed" ? "Closed" : "Registered at RHU"}
        </p>
        <Button variant="secondary" onClick={download} disabled={busy}>
          {busy ? "Preparing…" : "Download Treatment Card"}
        </Button>
      </div>
      <details open>
        <summary className="cursor-pointer text-sm font-medium text-ink-800 focus-visible:outline-2">
          View registered treatment card
        </summary>
        <div className="mt-4">
          <TbTreatmentCardForm
            value={normalizeTbData(projectTbCaseCard(registered))}
            readOnly
            includeLegacyDoseCalendar={false}
            laboratoryContext="rhu"
            laboratoryTests={registered.diagnosis_snapshot?.laboratory_tests || []}
          />
        </div>
      </details>
      <TbCaseEndorsementPanel key={registered.id} caseId={registered.id} />
      <TbMonitoringPanel key={`monitoring-${registered.id}`} caseId={registered.id} />
      <TbCaseFollowUpPanel key={`follow-up-${registered.id}`} caseId={registered.id} />
    </section>
  );
}
