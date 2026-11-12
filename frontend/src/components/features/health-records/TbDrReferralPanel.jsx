import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import { getTbDrReferralPreview, saveTbDrReferral, downloadTbDrReferralPdf } from "../../../services/tbDrReferralService";
import { tbDrIssuePayload, tbDrStatusPayload, tbDrReferralErrors, tbDrReferralAttempt } from "../../../utils/tbDrReferral";

const control = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400";
const failureMessage = failure => Object.values(failure.errors || {}).flat().join(" ") || failure.message || "Unable to save the outbound referral.";
const dispositionLabels = { issued: "Issued by RHU", sent: "Dispatch recorded by RHU", attendance_reported: "Attendance reported to RHU", cancelled: "Cancelled" };
const dateTime = value => value ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "";

function ReviewedSource({ patient, source }) {
  return <div className="space-y-2 text-sm text-neutral-700">
    <p className="font-semibold text-ink-900">{patient?.full_name} · {patient?.birthdate || "Birth date not recorded"} · {patient?.sex}</p>
    <p>TB Disease · {source?.resistance_label}</p>
    <p className="text-neutral-600">{source?.rhu_name} · Assessing physician: {source?.physician_name}</p>
    <details><summary className="cursor-pointer font-medium text-ink-800">Reviewed diagnostic evidence</summary>
      {source?.laboratory_tests?.length ? <ul className="mt-2 divide-y divide-neutral-200">{source.laboratory_tests.map((lab, index) => <li key={lab.recordId || index} className="space-y-1 py-2"><p className="font-medium">{lab.testName} · {lab.examinationDate || lab.collectionDate || "Date not recorded"} · {lab.resultStatus}</p><p className="whitespace-pre-wrap break-words">{typeof lab.result === "string" ? lab.result : JSON.stringify(lab.result ?? "")}</p></li>)}</ul>
        : <p className="mt-2 text-neutral-600">No laboratory evidence attached to the reviewed consultation.</p>}
    </details>
  </div>;
}

export function TbDrReferralForm({ preview, referral = null, busy = false, suspended = false, onSave }) {
  const revision = String(referral?.version ?? preview.source_revision);
  const [reviewed, setReviewed] = useState(revision);
  const [fields, setFields] = useState({ destinationName: "", destinationAddress: "", destinationContact: "", reason: "", confirmed: false,
    status: "", eventOn: referral?.today || preview.today, note: "" });
  const [error, setError] = useState("");
  const changed = reviewed !== revision;
  const set = (key, value) => setFields(previous => ({ ...previous, [key]: value }));
  function submit(event) {
    event.preventDefault();
    if (changed) { setError("Review the latest source or disposition before submitting."); return; }
    const payload = referral ? tbDrStatusPayload(fields, reviewed) : tbDrIssuePayload(fields, reviewed);
    const errors = tbDrReferralErrors(payload, referral || preview);
    if (Object.keys(errors).length) { setError(Object.values(errors).join(" ")); return; }
    setError(""); onSave(payload, referral?.id || null);
  }
  if (suspended) return null;
  return <form aria-label={referral ? "Record DR-TB referral disposition" : "Authorize outbound DR-TB referral"} onSubmit={submit} className="space-y-3 border-t border-neutral-200 pt-4">
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {changed && <div className="space-y-2"><p role="alert" className="text-sm text-red-800">The reviewed source or referral disposition changed. Review the latest information before continuing.</p><Button type="button" variant="secondary" disabled={busy} onClick={() => { setReviewed(revision); setFields(previous => ({ ...previous, confirmed: false, status: "" })); setError(""); }}>Review latest source</Button></div>}
    <fieldset disabled={busy || changed} className="space-y-3">
      {referral ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-neutral-700">RHU-recorded disposition<select className={control} name="status" value={fields.status} onChange={event => set("status", event.target.value)} required><option value="">Choose a disposition</option>{referral.allowed_statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="block text-sm font-medium text-neutral-700">Report / action date<input type="date" className={control} name="eventOn" required min={referral.earliest_event_on} max={referral.today} value={fields.eventOn} onChange={event => set("eventOn", event.target.value)} /></label>
        </div>
        <label className="block text-sm font-medium text-neutral-700">Note / reported basis<textarea className={control} name="note" rows={3} maxLength={2000} required value={fields.note} onChange={event => set("note", event.target.value)} /></label>
      </> : <>
        <label className="block text-sm font-medium text-neutral-700">External PMDT / DR-TB facility<input className={control} name="destinationName" required maxLength={255} value={fields.destinationName} onChange={event => set("destinationName", event.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-neutral-700">Destination address (optional)<textarea className={control} name="destinationAddress" rows={2} maxLength={1000} value={fields.destinationAddress} onChange={event => set("destinationAddress", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700">Destination contact (optional)<input className={control} name="destinationContact" maxLength={255} value={fields.destinationContact} onChange={event => set("destinationContact", event.target.value)} /></label></div>
        <label className="block text-sm font-medium text-neutral-700">Clinical reason / referral instructions<textarea className={control} name="reason" required rows={3} maxLength={2000} value={fields.reason} onChange={event => set("reason", event.target.value)} /></label>
        <label className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" name="confirmed" className="mt-1 accent-ink-800" required checked={fields.confirmed} onChange={event => set("confirmed", event.target.checked)} /><span>I reviewed the finalized diagnosis and diagnostic evidence and authorize this outbound DR-TB referral.</span></label>
      </>}
      <Button type="submit" variant="brand" disabled={busy || changed}>{busy ? "Saving…" : referral ? "Record disposition" : "Authorize outbound referral"}</Button>
    </fieldset>
  </form>;
}

function ReferralDocument({ referral, busy, onPrint }) {
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink-900">{referral.reference} · {referral.status_label}</p><Button variant="secondary" disabled={busy} onClick={() => onPrint(referral.id)}>Download referral slip</Button></div>
    {referral.status === "cancelled" && <p className="text-sm font-semibold text-red-800">This referral was cancelled. Retain it as historical documentation.</p>}
    <ReviewedSource patient={referral.patient_snapshot} source={referral.source_snapshot} />
    <p className="text-sm text-neutral-700"><strong>Destination:</strong> {referral.destination_name}<span className="block whitespace-pre-wrap">{referral.destination_address} {referral.destination_contact}</span></p>
    <p className="whitespace-pre-wrap break-words text-sm text-neutral-700">{referral.reason}</p>
    <p className="text-xs text-neutral-500">Authorized by {referral.authorized_name} · {dateTime(referral.authorized_at)}</p>
    <ol className="divide-y divide-neutral-200">{referral.events.map(event => <li key={event.id} className="space-y-1 py-2 text-sm text-neutral-700"><p className="font-medium">{event.event_on} · {dispositionLabels[event.status]}</p><p className="whitespace-pre-wrap break-words">{event.note}</p><p className="text-xs text-neutral-500">{event.recorder_name} · {dateTime(event.recorded_at)}</p></li>)}</ol>
  </div>;
}

export default function TbDrReferralPanel({ recordId }) {
  const query = useQuery({ queryKey: ["tb-dr-referral", String(recordId)], queryFn: () => getTbDrReferralPreview(recordId), retry: false, refetchOnWindowFocus: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const attempt = useRef(null);
  const running = useRef(false);
  const data = query.data;
  const ready = Boolean(data) && !accessBlocked && !query.isError && !query.isFetching && !query.isPaused;
  async function revalidate() {
    const result = await query.refetch();
    if (result.data && !result.isError && !result.isFetching && !result.isPaused) setAccessBlocked(false);
    return result;
  }
  async function save(payload, referralId) {
    if (running.current) return;
    attempt.current = tbDrReferralAttempt(attempt.current, recordId, referralId, payload);
    running.current = true; setBusy(true); setError("");
    try {
      await saveTbDrReferral(attempt.current);
      setEpoch(previous => previous + 1);
      await revalidate();
    } catch (failure) {
      setError(failure.isNetworkError || failure.status >= 500 ? "The save could not be confirmed. Retry with the same entries, or refresh to review the recorded referral." : failureMessage(failure));
      if ([403, 404].includes(failure.status)) {
        setAccessBlocked(true);
        // A paused offline check must not keep the save controls busy or expose
        // previously cached information after a confirmed scoped denial.
        void revalidate();
      } else if (failure.status === 409) await revalidate();
    } finally { running.current = false; setBusy(false); }
  }
  async function download(id) {
    setBusy(true); setError("");
    try { await downloadTbDrReferralPdf(id); }
    catch (failure) {
      setError(failureMessage(failure));
      if ([403, 404].includes(failure.status)) setAccessBlocked(true);
      void revalidate();
    }
    finally { setBusy(false); }
  }
  return <section aria-label="Outbound DR-TB referral" className="my-5 min-w-0 space-y-4 border-t border-neutral-200 bg-white px-4 py-5 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-ink-900">Outbound DR-TB referral</h2><Button variant="secondary" disabled={busy} onClick={revalidate}>Refresh referral</Button></div>
    <p className="text-sm text-neutral-600">Refer to an external PMDT / DR-TB facility. DS-TB treatment-card registration does not apply to this classification.</p>
    {(query.isError || accessBlocked) && <div className="space-y-2"><p role="alert" className="text-sm text-red-800">Unable to load outbound DR-TB referral. Access may have changed.</p><Button variant="secondary" onClick={revalidate}>Retry</Button></div>}
    {!ready && !query.isError && !accessBlocked && <p role="status" className="text-sm text-neutral-600">Checking referral access…</p>}
    {ready && error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {ready && (data.current ? <ReferralDocument referral={data.current} busy={busy} onPrint={download} /> : <>
      <ReviewedSource patient={data.patient_snapshot} source={data.source_snapshot} />
      {!data.eligible && <p className="text-sm text-neutral-700">{data.reason}</p>}
      {data.eligible && !data.can_authorize && <p className="text-sm text-neutral-700">The RHU physician with referral and clinical duties must authorize the outbound referral.</p>}
    </>)}
    {data?.eligible && data.can_authorize && <TbDrReferralForm key={`issue:${epoch}`} preview={data} busy={busy} suspended={!ready} onSave={save} />}
    {data?.current?.can_update && <TbDrReferralForm key={`status:${data.current.id}:${epoch}`} preview={data} referral={data.current} busy={busy} suspended={!ready} onSave={save} />}
    {ready && <>
      <p className="text-xs text-neutral-500">Disposition records describe RHU actions or information reported to RHU. Attendance reports are separate from a treatment outcome.</p>
      {data.history.filter(row => row.id !== data.current?.id).map(row => <details key={row.id} className="border-t border-neutral-200 pt-3"><summary className="cursor-pointer text-sm font-medium text-ink-800">Previous referral · {row.reference} · {row.status_label}</summary><div className="mt-3"><ReferralDocument referral={row} busy={busy} onPrint={download} /></div></details>)}
    </>}
  </section>;
}
