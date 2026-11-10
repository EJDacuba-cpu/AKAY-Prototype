import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import { getTbCaseFollowUp, saveTbCaseFollowUp } from "../../../services/tbCaseFollowUpService";
import { TB_MILESTONES, TB_LAB_STATUSES, TB_OUTCOMES, tbFollowUpLabPayload, tbCaseClosePayload, tbCaseReopenPayload, tbCaseFollowUpErrors, tbCaseFollowUpAttempt } from "../../../utils/tbCaseFollowUp";

const control = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400";
const failureMessage = failure => Object.values(failure.errors || {}).flat().join(" ") || failure.message || "Unable to save the case decision.";
const dateTime = value => value ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "";
const labFields = lab => ({ milestone: lab?.milestone || "", testName: lab?.test_name || "", dueOn: lab?.due_on || "", status: lab?.status || "requested",
  collectionOn: lab?.collection_on || "", examinationOn: lab?.examination_on || "", result: lab?.result || "", notes: lab?.notes || "", correctionReason: "" });

function LabForm({ context, lab, busy, suspended, onSave, onCancel }) {
  const [fields, setFields] = useState(() => labFields(lab));
  const [reviewedVersion, setReviewedVersion] = useState(lab?.version || null);
  const [error, setError] = useState("");
  const changed = Boolean(lab) && lab.version !== reviewedVersion;
  const set = (key, value) => setFields(previous => ({ ...previous, [key]: value }));
  function submit(event) {
    event.preventDefault(); if (changed) return;
    const payload = tbFollowUpLabPayload(fields, lab ? { ...lab, version: reviewedVersion } : null);
    const errors = tbCaseFollowUpErrors(payload, context, "lab");
    if (Object.keys(errors).length) { setError(Object.values(errors).join(" ")); return; }
    setError(""); onSave("lab", payload, lab?.id || null);
  }
  if (suspended) return null;
  return <form aria-label={lab ? "Revise RHU follow-up laboratory" : "Record RHU follow-up laboratory"} onSubmit={submit} className="space-y-3 border-t border-neutral-200 pt-4">
    <h4 className="text-sm font-semibold text-ink-900">{lab ? "Revise laboratory entry" : "Record RHU follow-up laboratory"}</h4>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {changed && <div className="space-y-2"><p role="alert" className="text-sm text-red-800">A newer laboratory revision is available.</p><Button variant="secondary" type="button" disabled={busy} onClick={() => { setReviewedVersion(lab.version); setFields(labFields(lab)); }}>Review latest lab</Button></div>}
    <fieldset disabled={busy || changed} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium text-neutral-700">Milestone<select className={control} name="milestone" value={fields.milestone} required onChange={event => set("milestone", event.target.value)}><option value="">Choose milestone</option>{Object.entries(TB_MILESTONES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-sm font-medium text-neutral-700">Laboratory test<input className={control} name="testName" maxLength={255} required value={fields.testName} onChange={event => set("testName", event.target.value)} /></label>
        <label className="block text-sm font-medium text-neutral-700">Scheduled date<input className={control} name="dueOn" type="date" min={context.start_date} required value={fields.dueOn} onChange={event => set("dueOn", event.target.value)} /></label>
        <label className="block text-sm font-medium text-neutral-700">Result status<select className={control} name="labStatus" value={fields.status} onChange={event => set("status", event.target.value)}>{Object.entries(TB_LAB_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-sm font-medium text-neutral-700">Collection date<input className={control} name="collectionOn" type="date" min={context.start_date} max={context.today} value={fields.collectionOn} onChange={event => set("collectionOn", event.target.value)} /></label>
        <label className="block text-sm font-medium text-neutral-700">Examination date<input className={control} name="examinationOn" type="date" min={context.start_date} max={context.today} required={fields.status === "result_available"} value={fields.examinationOn} onChange={event => set("examinationOn", event.target.value)} /></label>
      </div>
      {fields.status === "result_available" && <label className="block text-sm font-medium text-neutral-700">Recorded laboratory result<textarea className={control} name="result" required rows={3} maxLength={10000} value={fields.result} onChange={event => set("result", event.target.value)} /></label>}
      <label className="block text-sm font-medium text-neutral-700">Laboratory notes<textarea className={control} name="labNotes" rows={2} maxLength={2000} value={fields.notes} onChange={event => set("notes", event.target.value)} /></label>
      {lab && <label className="block text-sm font-medium text-neutral-700">Revision reason<textarea className={control} name="correctionReason" required rows={2} maxLength={2000} value={fields.correctionReason} onChange={event => set("correctionReason", event.target.value)} /></label>}
      <div className="flex flex-wrap gap-2"><Button type="submit" variant="brand">{busy ? "Saving…" : lab ? "Save lab revision" : "Save laboratory entry"}</Button>{lab && <Button type="button" variant="secondary" onClick={onCancel}>Cancel revision</Button>}</div>
    </fieldset>
  </form>;
}

function DecisionForm({ context, action, busy, suspended, onSave }) {
  const [reviewed, setReviewed] = useState(context.case_version);
  const [fields, setFields] = useState({ outcomeStatus: "", outcomeOn: context.today, evidenceIds: [], note: "", confirmed: false });
  const [error, setError] = useState("");
  const changed = reviewed !== context.case_version;
  const set = (key, value) => setFields(previous => ({ ...previous, [key]: value }));
  function submit(event) {
    event.preventDefault(); if (changed) return;
    const payload = action === "close" ? tbCaseClosePayload(fields, reviewed) : tbCaseReopenPayload(fields, reviewed);
    const errors = tbCaseFollowUpErrors(payload, context, action);
    if (Object.keys(errors).length) { setError(Object.values(errors).join(" ")); return; }
    setError(""); onSave(action, payload, null);
  }
  if (suspended) return null;
  return <form aria-label={action === "close" ? "Close TB case" : "Reopen TB case"} onSubmit={submit} className="space-y-3 border-t border-neutral-200 pt-4">
    <h4 className="text-sm font-semibold text-ink-900">{action === "close" ? "Physician treatment outcome" : "Physician-authorized reopening"}</h4>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {changed && <div className="space-y-2"><p role="alert" className="text-sm text-red-800">The case, DOTS log or laboratory evidence changed. Review the latest information before deciding.</p><Button variant="secondary" type="button" disabled={busy} onClick={() => { setReviewed(context.case_version); setFields(previous => ({ ...previous, confirmed: false, evidenceIds: [] })); }}>Review latest case</Button></div>}
    <fieldset disabled={busy || changed} className="space-y-3">
      {action === "close" && <>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-neutral-700">Physician-determined outcome<select className={control} name="outcomeStatus" required value={fields.outcomeStatus} onChange={event => set("outcomeStatus", event.target.value)}><option value="">Choose an outcome</option>{Object.entries(TB_OUTCOMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="block text-sm font-medium text-neutral-700">Outcome date<input type="date" className={control} name="outcomeOn" required min={context.start_date} max={context.today} value={fields.outcomeOn} onChange={event => set("outcomeOn", event.target.value)} /></label></div>
        <div className="space-y-2"><p className="text-sm font-medium text-neutral-700">Select completed laboratory evidence reviewed for this outcome</p>{context.labs.filter(lab => lab.status === "result_available").map(lab => <label key={lab.id} className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" name={`evidence_${lab.id}`} className="mt-1 accent-ink-800" checked={fields.evidenceIds.includes(lab.id)} onChange={event => set("evidenceIds", event.target.checked ? [...fields.evidenceIds, lab.id] : fields.evidenceIds.filter(id => id !== lab.id))} /><span>{TB_MILESTONES[lab.milestone]} · {lab.test_name} · {lab.examination_on} · v{lab.version}: {lab.result}</span></label>)}</div>
      </>}
      <label className="block text-sm font-medium text-neutral-700">Clinical decision / reason<textarea className={control} name="note" maxLength={2000} rows={3} required value={fields.note} onChange={event => set("note", event.target.value)} /></label>
      <label className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" className="mt-1 accent-ink-800" name="confirmed" required checked={fields.confirmed} onChange={event => set("confirmed", event.target.checked)} /><span>{action === "close" ? "I reviewed the treatment course and laboratory evidence, verified the clinical criteria, and authorize this outcome and case closure." : "I reviewed this case and authorize reopening with the existing prescription and accepted treatment partner."}</span></label>
      <Button variant="brand" type="submit" disabled={busy || changed}>{busy ? "Saving…" : action === "close" ? "Close case with outcome" : "Reopen case"}</Button>
    </fieldset>
  </form>;
}

export default function TbCaseFollowUpPanel({ caseId, enabled = true, onAccessDenied }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["tb-follow-up", String(caseId)], queryFn: () => getTbCaseFollowUp(caseId), enabled, retry: false, refetchOnWindowFocus: false });
  const [editingId, setEditingId] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessBlocked, setAccessBlocked] = useState(false);
  const attempt = useRef(null); const running = useRef(false);
  const data = query.data;
  const ready = enabled && Boolean(data) && !accessBlocked && !query.isError && !query.isFetching && !query.isPaused;
  async function refresh() {
    const result = await query.refetch();
    if (result.data && !result.isError && !result.isFetching && !result.isPaused) setAccessBlocked(false);
    return result;
  }
  async function save(action, payload, labId) {
    if (running.current) return;
    attempt.current = tbCaseFollowUpAttempt(attempt.current, caseId, action, labId, payload);
    running.current = true; setBusy(true); setError("");
    try {
      await saveTbCaseFollowUp(attempt.current); setEditingId(null); setEpoch(previous => previous + 1);
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: ["tb-case", String(caseId)] }),
        client.invalidateQueries({ queryKey: ["tb-monitoring", String(caseId)] }), client.invalidateQueries({ queryKey: ["tb-case-endorsements", String(caseId)] }),
        client.invalidateQueries({ queryKey: ["tb-cases"] }), client.invalidateQueries({ queryKey: ["tb-registration", String(data.case.source_health_record_id)] })]);
    } catch (failure) {
      setError(failure.isNetworkError || failure.status >= 500 ? "The save could not be confirmed. Retry with the same entries, or refresh to review the case history." : failureMessage(failure));
      if ([403, 404].includes(failure.status)) { setAccessBlocked(true); onAccessDenied?.(); void refresh(); }
      else if (failure.status === 409) await refresh();
    } finally { running.current = false; setBusy(false); }
  }
  const editing = data?.labs.find(lab => lab.id === editingId) || null;
  return <section aria-label="TB follow-up and physician outcome" className="min-w-0 space-y-4 border-t border-neutral-200 pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold text-ink-900">RHU follow-up &amp; treatment outcome</h3><Button variant="secondary" disabled={busy} onClick={refresh}>Refresh case review</Button></div>
    {(query.isError || accessBlocked) && <div className="space-y-2"><p role="alert" className="text-sm text-red-800">TB follow-up is unavailable. Access may have changed.</p><Button variant="secondary" onClick={refresh}>Retry</Button></div>}
    {!ready && !query.isError && !accessBlocked && <p role="status" className="text-sm text-neutral-600">Checking follow-up access…</p>}
    {ready && <>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <p className="text-sm font-semibold text-ink-900">{data.case.status === "closed" ? `${TB_OUTCOMES[data.case.outcome_status] || "Closed; outcome not recorded"} · ${data.case.outcome_on || ""}` : "Active treatment case"}</p>
      {data.case.closed_name && <p className="whitespace-pre-wrap text-sm text-neutral-600">{data.case.closed_name} · {dateTime(data.case.closed_at)}<br />{data.case.outcome_note}</p>}
      <p className="text-sm text-neutral-600">Month 2, 5 and 6 follow-ups are tested and recorded at RHU. Dates and clinical outcomes require explicit review.</p>
      {data.labs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">RHU follow-up laboratory evidence</caption><thead><tr>{["Milestone / test", "Scheduled", "Status / examination", "Recorded result", "RHU recorder", "Actions"].map(label => <th scope="col" className="border-b border-neutral-200 px-2 py-2 font-medium text-neutral-600" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-neutral-200">{data.labs.map(lab => <tr key={lab.id} className="align-top text-neutral-700"><td className="px-2 py-3">{TB_MILESTONES[lab.milestone]}<span className="block font-medium">{lab.test_name} · v{lab.version}</span></td><td className="px-2 py-3 tabular-nums">{lab.due_on}</td><td className="px-2 py-3">{TB_LAB_STATUSES[lab.status]}<span className="block tabular-nums">{lab.examination_on}</span></td><td className="max-w-xs whitespace-pre-wrap break-words px-2 py-3">{lab.result || "—"}</td><td className="px-2 py-3">{lab.recorder_name}<span className="block text-xs text-neutral-500">{dateTime(lab.recorded_at)}</span></td><td className="px-2 py-3">{data.can_record_labs && <Button variant="secondary" disabled={busy} onClick={() => setEditingId(lab.id)}>Revise lab</Button>}</td></tr>)}</tbody></table></div> : <p className="text-sm text-neutral-600">No RHU follow-up laboratories recorded.</p>}
    </>}
    {data?.can_record_labs && <LabForm key={`lab:${editing?.id || "new"}:${epoch}`} context={data} lab={editing} suspended={!ready} busy={busy} onSave={save} onCancel={() => setEditingId(null)} />}
    {data?.can_close && <DecisionForm key={`close:${epoch}`} context={data} action="close" suspended={!ready} busy={busy} onSave={save} />}
    {data?.can_reopen && <DecisionForm key={`reopen:${epoch}`} context={data} action="reopen" suspended={!ready} busy={busy} onSave={save} />}
    {ready && data.events.length > 0 && <details><summary className="cursor-pointer text-sm font-medium text-ink-800">Clinical decision and laboratory history</summary><ol className="mt-2 divide-y divide-neutral-200">{data.events.map(event => <li key={event.id} className="space-y-1 py-3 text-sm text-neutral-700"><p className="font-medium">{event.kind === "closed" ? `Closed: ${TB_OUTCOMES[event.snapshot.outcome_status]}` : event.kind === "reopened" ? "Reopened by RHU physician" : `${event.snapshot.test_name} · ${TB_LAB_STATUSES[event.snapshot.status]} · v${event.snapshot.version}`}</p><p>{event.recorder_name} · {dateTime(event.recorded_at)}</p><p className="whitespace-pre-wrap break-words">{event.note}</p>{event.snapshot.result && <p className="whitespace-pre-wrap break-words">{event.snapshot.result}</p>}{event.snapshot.evidence_labs?.map(lab => <p key={lab.id} className="whitespace-pre-wrap break-words">Reviewed {lab.test_name} v{lab.version}: {lab.result}</p>)}</li>)}</ol></details>}
  </section>;
}
