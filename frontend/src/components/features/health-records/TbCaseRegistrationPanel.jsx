import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import ModalShell, { ModalButton } from "../../common/modals/ModalShell";
import TbTreatmentCardForm, { normalizeTbData } from "./TbTreatmentCardForm";
import TbCaseEndorsementPanel from "./TbCaseEndorsementPanel";
import TbMonitoringPanel from "./TbMonitoringPanel";
import TbCaseFollowUpPanel from "./TbCaseFollowUpPanel";
import { projectTbCaseCard } from "../../../utils/tbCaseFollowUp";
import { getTbRegistration, registerTbCase, downloadTbCasePdf } from "../../../services/tbCaseService";
import { tbRegistrationPayload, tbRegistrationErrors, tbRegistrationAttempt, registerOrRecoverTbCase, SCREENING_DATE_SOURCES } from "../../../utils/tbRegistration";
import { tbManagementFields } from "../../../utils/rhuTbCaseManagement";

const inputClass = "mt-1 h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400";

function dispositionSummary(record) {
  const entry = (record?.diagnoses || []).find((item) => item?.tbManagement || item?.tb_management);
  const management = tbManagementFields(entry || {});
  if (!management.treatmentDecision || management.treatmentDecision === "initiate_at_rhu") return null;
  return management;
}

export default function TbCaseRegistrationPanel({ recordId, record = null }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["tb-registration", String(recordId)], queryFn: () => getTbRegistration(recordId),
    enabled: Boolean(recordId), refetchOnWindowFocus: false, retry: 1 });
  const [editing, setEditing] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef(null);
  const submitting = useRef(false);
  const errorRef = useRef(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const preview = query.data;
  const registered = preview?.case || saved;
  const disposition = dispositionSummary(record);
  const modalOpen = Boolean(editing);

  function closeModal() {
    if (busy) return;
    setEditing(null);
    setError("");
  }

  function begin() {
    setError(""); attempt.current = null;
    setEditing({
      card: normalizeTbData(preview.card_data),
      year: preview.reporting_year,
      number: "",
      sourceRevision: preview.source_revision,
      laboratories: preview.laboratory_tests,
      confirmed: false,
      treatmentStartDate: "",
      screeningDateSource: preview.screening_date_source,
      referralSourceLabel: preview.referral_source_label,
    });
  }

  async function refresh() {
    setBusy(true); setError("");
    try {
      const result = await query.refetch({ throwOnError: true });
      const next = result.data;
      if (editing && next.eligible) {
        setEditing(previous => ({ ...previous, sourceRevision: next.source_revision, laboratories: next.laboratory_tests, confirmed: false,
          screeningDateSource: next.screening_date_source, referralSourceLabel: next.referral_source_label,
          card: { ...previous.card, ...Object.fromEntries(["caseFinding", "diagnosis", "classification"].map(group => [group, { ...previous.card[group], ...next.card_data[group] }])) } }));
      }
    } catch (failure) { setError(failure.message || "Unable to refresh the assessment. Try again."); }
    finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const payload = {
      ...tbRegistrationPayload({ reportingYear: editing.year, caseNumber: editing.number,
        sourceRevision: editing.sourceRevision, confirmed: editing.confirmed, cardData: editing.card }),
      treatment_start_date: editing.treatmentStartDate,
    };
    const errors = tbRegistrationErrors(payload);
    if (!String(editing.treatmentStartDate || "").trim()) errors.treatment_start_date = "Enter the actual treatment start date.";
    if (Object.keys(errors).length) { setError(Object.values(errors).join(" ")); return; }
    attempt.current = tbRegistrationAttempt(attempt.current, recordId, payload);
    submitting.current = true; setBusy(true); setError("");
    try {
      const result = await registerOrRecoverTbCase(attempt.current, registerTbCase,
        async () => (await query.refetch({ throwOnError: true })).data);
      setSaved(result); setEditing(null);
      await client.invalidateQueries({ queryKey: ["tb-registration", String(recordId)] });
      await client.invalidateQueries({ queryKey: ["tb-cases"] });
    } catch (failure) {
      const fields = Object.values(failure.errors || {}).flat();
      setError(fields.length ? fields.join(" ") : failure.message || "Registration could not be confirmed. Retry with the same entries, or refresh the assessment.");
      await query.refetch();
    } finally { submitting.current = false; setBusy(false); }
  }

  async function download() {
    setBusy(true); setError("");
    try { await downloadTbCasePdf(registered.id); }
    catch (failure) { setError(failure.message || "Unable to download Form 4B. Try again."); }
    finally { setBusy(false); }
  }

  return <section className="my-5 min-w-0 space-y-4 border-t border-neutral-200 bg-white px-4 py-5 sm:px-5" aria-labelledby="tb-registration-title">
    <h2 id="tb-registration-title" className="text-base font-semibold text-ink-900">DS-TB Treatment Card · Form 4B</h2>
    {error && !modalOpen && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {query.isPending ? <p role="status" className="text-sm text-neutral-600">Loading TB registration…</p>
      : query.isError && !registered ? <div className="space-y-3"><p role="alert" className="text-sm text-red-800">Unable to load TB registration.</p><Button variant="secondary" onClick={refresh} disabled={busy}>Retry</Button></div>
      : registered ? <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-700"><span className="font-semibold text-ink-900">{registered.case_number}</span> · {registered.reporting_year} · {registered.status === "closed" ? "Closed" : "Registered at RHU"}</p>
          <Button variant="secondary" onClick={download} disabled={busy}>{busy ? "Preparing…" : "Download Form 4B"}</Button>
        </div>
        <details open><summary className="cursor-pointer text-sm font-medium text-ink-800 focus-visible:outline-2">View registered Form 4B</summary><div className="mt-4">
          <TbTreatmentCardForm value={normalizeTbData(projectTbCaseCard(registered))} readOnly includeLegacyDoseCalendar={false} laboratoryContext="rhu" laboratoryTests={registered.diagnosis_snapshot?.laboratory_tests || []} />
        </div></details>
        <TbCaseEndorsementPanel key={registered.id} caseId={registered.id} />
        <TbMonitoringPanel key={`monitoring-${registered.id}`} caseId={registered.id} />
        <TbCaseFollowUpPanel key={`follow-up-${registered.id}`} caseId={registered.id} />
      </> : <>
        {disposition && (
          <div className="space-y-1 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            <p className="font-medium text-ink-900">Documented treatment disposition</p>
            <p>Decision: {disposition.treatmentDecision === "refer_elsewhere" ? "Refer elsewhere" : "Treatment not yet initiated"}</p>
            <p className="whitespace-pre-wrap">Reason: {disposition.dispositionReason || "—"}</p>
            <p className="whitespace-pre-wrap">Plan: {disposition.dispositionPlan || "—"}</p>
          </div>
        )}
        {!preview?.eligible ? <p className="text-sm text-neutral-700">{preview?.reason || "This consultation is not eligible for Form 4B registration."}</p>
          : !preview.can_register ? <p className="text-sm text-neutral-700">The RHU physician must authorize Form 4B registration.</p>
          : <div className="space-y-3">
            <p className="max-w-3xl text-sm text-neutral-600">
              Register DS-TB treatment from this finalized consultation when treatment was not started in-visit. The registration form opens in a separate physician-authorized dialog.
            </p>
            <Button variant="brand" onClick={begin}>Register DS-TB Treatment</Button>
          </div>}
      </>}

    <ModalShell
      open={modalOpen}
      title="Register DS-TB Treatment · Form 4B"
      subtitle="Creates a linked treatment case without modifying this finalized consultation."
      size="wide"
      onClose={closeModal}
      closeDisabled={busy}
      dismissOnBackdrop={!busy}
      dismissOnEscape={!busy}
      bodyClassName="max-h-[70vh] overflow-y-auto"
      footer={editing ? (
        <>
          <ModalButton onClick={closeModal} disabled={busy}>Cancel</ModalButton>
          <ModalButton onClick={refresh} disabled={busy}>Refresh assessment</ModalButton>
          <ModalButton variant="ink" primary disabled={busy} onClick={() => document.getElementById("delayed-form4b-submit")?.click()}>
            {busy ? "Registering…" : "Authorize and register Form 4B"}
          </ModalButton>
        </>
      ) : null}
    >
      {editing && (
        <form id="delayed-form4b-form" onSubmit={submit} className="space-y-4" aria-label="Delayed DS-TB Form 4B registration">
          {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <p className="text-xs text-neutral-600">
            Screening source: {SCREENING_DATE_SOURCES[editing.screeningDateSource] || "Confirm screening date"}
            {editing.referralSourceLabel ? ` · ${editing.referralSourceLabel}` : ""}
          </p>
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-neutral-700">Reporting year<input type="number" min="1900" max="9999" required className={inputClass} value={editing.year} onChange={event => setEditing({ ...editing, year: event.target.value })} /></label>
            <label className="text-sm font-medium text-neutral-700">Case number (optional)<input className={inputClass} maxLength={100} value={editing.number} onChange={event => setEditing({ ...editing, number: event.target.value })} /><span className="mt-1 block text-xs font-normal text-neutral-500">Leave blank to generate an RHU case number.</span></label>
            <label className="text-sm font-medium text-neutral-700 sm:col-span-2">Treatment start date<input type="date" required className={inputClass} value={editing.treatmentStartDate} onChange={event => setEditing({ ...editing, treatmentStartDate: event.target.value })} /><span className="mt-1 block text-xs font-normal text-neutral-500">Do not assume the original consultation date.</span></label>
          </fieldset>
          <fieldset disabled={busy}>
            <TbTreatmentCardForm mode="registration" laboratoryContext="rhu" laboratoryTests={editing.laboratories} value={editing.card} onChange={card => setEditing(previous => ({ ...previous, card }))} />
            <label className="mt-4 flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" className="mt-1" checked={editing.confirmed} onChange={event => setEditing({ ...editing, confirmed: event.target.checked })} /><span>I reviewed the latest diagnostic evidence and authorize this delayed drug-susceptible TB treatment registration.</span></label>
          </fieldset>
          <button id="delayed-form4b-submit" type="submit" className="sr-only">Authorize and register Form 4B</button>
        </form>
      )}
    </ModalShell>
  </section>;
}
