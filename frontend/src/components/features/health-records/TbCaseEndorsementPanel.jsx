import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import { getTbCaseEndorsements, createTbEndorsement, getTbEndorsement, actOnTbEndorsement } from "../../../services/tbCaseService";
import { TB_ENDORSEMENT_LABELS, tbEndorsementPayload, tbEndorsementErrors, tbEndorsementAttempt, tbEndorsementActionPayload, tbDecisionRecorded } from "../../../utils/tbEndorsements";

const control = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400";
const failureMessage = failure => Object.values(failure.errors || {}).flat().join(" ") || failure.message || "Unable to update the endorsement. Refresh and try again.";

export default function TbCaseEndorsementPanel({ caseId }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["tb-case-endorsements", String(caseId)], queryFn: () => getTbCaseEndorsements(caseId), retry: false, refetchOnWindowFocus: false });
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef(null);
  const running = useRef(false);
  const data = query.data;
  async function refresh() {
    await Promise.all([client.invalidateQueries({ queryKey: ["tb-case"] }), client.invalidateQueries({ queryKey: ["tb-cases"] }), client.invalidateQueries({ queryKey: ["tb-endorsements"] })]);
    await query.refetch();
  }
  async function submit(event, revoke = false) {
    event.preventDefault();
    if (running.current) return;
    const payload = revoke ? tbEndorsementActionPayload("revoke", { ...data.current, case_version: data.case_version }, { reason })
      : tbEndorsementPayload({ caseVersion: data.case_version, receivingBhcId: target, note });
    const errors = revoke ? (payload.reason ? {} : { reason: "Enter the reason for revoking this endorsement." }) : tbEndorsementErrors(payload);
    if (Object.keys(errors).length) { setError(Object.values(errors).join(" ")); return; }
    if (!revoke) attempt.current = tbEndorsementAttempt(attempt.current, caseId, payload);
    const current = data.current;
    running.current = true; setBusy(true); setError("");
    try {
      if (revoke) await actOnTbEndorsement(current.id, "revoke", payload);
      else await createTbEndorsement(attempt.current);
      setReason(""); setNote(""); setTarget("");
    } catch (failure) {
      let recorded = false;
      if (failure.isNetworkError || failure.status >= 500) {
        if (revoke) recorded = await getTbEndorsement(current.id).then(row => tbDecisionRecorded("revoke", payload, row)).catch(() => false);
        else recorded = await getTbCaseEndorsements(caseId).then(next => next.current?.receiving_bhc?.id === payload.receiving_bhc_id && next.current?.note === payload.note).catch(() => false);
      }
      if (!recorded) setError(failureMessage(failure));
    } finally { await refresh(); running.current = false; setBusy(false); }
  }
  if (query.isError) return <section className="space-y-2"><p role="alert" className="text-sm text-red-800">Unable to load BHC endorsement.</p><Button variant="secondary" onClick={() => query.refetch()}>Retry</Button></section>;
  if (!data) return <p role="status" className="text-sm text-neutral-600">Loading BHC endorsement…</p>;
  return <section className="min-w-0 space-y-3 border-t border-neutral-200 pt-4" aria-label="BHC treatment endorsement">
    <h3 className="text-sm font-semibold text-ink-900">BHC treatment endorsement</h3>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {data.current ? <div className="space-y-3">
      <p className="text-sm text-neutral-700"><strong>{data.current.receiving_bhc?.name}</strong> · {TB_ENDORSEMENT_LABELS[data.current.status]}</p>
      <p className="whitespace-pre-wrap text-sm text-neutral-600">{data.current.note}</p>
      {data.current.status === "linkage_needed" && <p className="text-sm text-neutral-600">The receiving BHC must verify and link its patient registration before reviewing the card.</p>}
      {data.can_revoke && <form onSubmit={event => submit(event, true)} className="space-y-2"><label className="block text-sm text-neutral-700">Revocation reason<textarea className={control} rows={2} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label><Button variant="destructive" disabled={busy} type="submit">Revoke endorsement</Button></form>}
    </div> : data.can_endorse ? <form onSubmit={submit} className="space-y-3">
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm font-medium text-neutral-700">Receiving BHC<select className={control} value={target} onChange={event => setTarget(event.target.value)}><option value="">Select a BHC</option>{data.candidates.map(bhc => <option key={bhc.id} value={bhc.id}>{bhc.name}</option>)}</select></label>
        <label className="block text-sm font-medium text-neutral-700">Treatment handoff instructions<textarea className={control} rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
      </fieldset>
      {data.candidates.length === 0 && <p className="text-sm text-neutral-600">No active eligible BHC is available.</p>}
      <Button type="submit" variant="brand" disabled={busy || data.candidates.length === 0}>{busy ? "Saving…" : "Endorse to BHC"}</Button>
    </form> : <p className="text-sm text-neutral-600">New TB treatment endorsements are retired. Use Manage to BHC on the RHU consultation for continued BHC monitoring. Historical endorsements remain listed below.</p>}
    {data.history.length > 0 && <details><summary className="cursor-pointer text-sm font-medium text-neutral-700">Endorsement history</summary><ul className="mt-2 divide-y divide-neutral-200">{data.history.map(row => <li key={row.id} className="py-2 text-sm text-neutral-600"><span className="font-medium text-ink-900">{row.receiving_bhc?.name}</span> · {TB_ENDORSEMENT_LABELS[row.status]}{row.reason && <p>{row.reason}</p>}</li>)}</ul></details>}
  </section>;
}
