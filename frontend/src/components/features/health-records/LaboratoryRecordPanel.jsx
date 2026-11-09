import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import ModalShell from "../../common/modals/ModalShell";
import useAccess from "../../../hooks/useAccess";
import { getLaboratoryTests, getLaboratoryHandoffs, getPatientLaboratoryTests, saveLaboratoryAddendum, shareLaboratoryEvidence } from "../../../services/laboratoryService";
import { laboratoryErrors, laboratorySummary } from "../../../utils/laboratoryTests";
import { LaboratoryAttachments, LaboratoryEvidenceList, LaboratoryEvidencePicker, LaboratoryFields } from "./LaboratoryEvidence";

export default function LaboratoryRecordPanel({ recordId, patientId }) {
  const access = useAccess();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["record-laboratory-tests", recordId], queryFn: () => getLaboratoryTests(recordId), enabled: Boolean(recordId) });
  const handoffs = useQuery({ queryKey: ["record-laboratory-handoffs", recordId], queryFn: () => getLaboratoryHandoffs(recordId), enabled: Boolean(recordId) && access.can("consultations.finalize") });
  const history = useQuery({ queryKey: ["patient-laboratory-tests", String(patientId)], queryFn: () => getPatientLaboratoryTests(patientId), enabled: Boolean(patientId) && access.can("consultations.finalize") });
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const entries = query.data?.data || [];
  async function refresh() {
    await query.refetch();
    if (access.can("consultations.finalize")) await handoffs.refetch();
    await client.invalidateQueries({ queryKey: ["patient-laboratory-tests"] });
  }
  async function save() {
    if (busy) return;
    if (!reason.trim()) { setError("Enter a reason for this addendum or sharing update."); return; }
    if (editing) {
      const errors = laboratoryErrors([editing]); setFieldErrors(errors);
      if (Object.keys(errors).length) return;
    }
    if (sharing && !sharing.confirmed) { setError("Confirm the evidence sharing update."); return; }
    setBusy(true); setError("");
    try {
      if (editing) await saveLaboratoryAddendum(recordId, editing, reason);
      if (sharing) await shareLaboratoryEvidence(sharing.id, sharing.selected, reason, sharing.sharingRevision);
      setEditing(null); setSharing(null); setReason(""); await refresh();
    } catch (failure) { setError(failure.message || "Unable to save laboratory evidence."); }
    finally { setBusy(false); }
  }
  const openEditor = entry => { setEditing({ ...entry }); setReason(""); setError(""); setFieldErrors({}); };
  return <section className="min-w-0 space-y-3 border border-neutral-200 bg-white p-4 sm:p-5" aria-label="Laboratory & Diagnostic Tests">
    <h2 className="text-sm font-semibold text-ink-900">Laboratory &amp; Diagnostic Tests</h2>
    {query.isPending && <p role="status" className="text-xs text-neutral-500">Loading laboratory records…</p>}
    {query.isError && <p role="alert" className="text-xs text-red-700">Unable to load laboratory records. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    {!query.isPending && !query.isError && <LaboratoryEvidenceList entries={entries} />}
    {entries.map(entry => <div key={entry.recordId} className="space-y-2 border-t border-neutral-200 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-neutral-600">{entry.testName} · Recorded {new Date(entry.createdAt).toLocaleString()} · Staff #{entry.createdBy}</span>
        {query.data?.can_addendum && <Button type="button" variant="secondary" size="compact" onClick={() => openEditor(entry)}>Add Result / Addendum</Button>}
      </div>
      {entry.addenda?.length > 0 && <details className="text-xs text-neutral-600"><summary className="cursor-pointer font-medium">Original result and {entry.addenda.length} addendum(s)</summary>
        <p className="mt-2 whitespace-pre-wrap break-words">Original: {laboratorySummary(entry.original)}</p>
        {entry.addenda.map(item => <div key={item.id} className="mt-2 border-l-2 border-neutral-200 pl-3"><p>{new Date(item.createdAt).toLocaleString()} · Staff #{item.createdBy} · {item.reason}</p><p className="whitespace-pre-wrap break-words">{laboratorySummary(item.data)}</p></div>)}
      </details>}
    </div>)}
    {handoffs.data?.length > 0 && <div className="space-y-2 border-t border-neutral-200 pt-3"><h3 className="text-xs font-semibold text-ink-900">BHC evidence sharing</h3><p className="text-xs text-neutral-500">Addenda and new attachments remain private until explicitly shared.</p>
      {handoffs.data.map(handoff => <div key={handoff.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600"><span>{handoff.condition} → {handoff.receivingBhc} · {handoff.evidence.length} shared</span>
        {access.can("consultations.finalize") && ["pending_review", "linkage_needed", "accepted_awaiting_first_visit", "monitoring_active"].includes(handoff.status) && <Button type="button" variant="secondary" size="compact" disabled={history.isPending || history.isError} onClick={() => { setSharing({ ...handoff, selected: handoff.evidence.map(entry => ({ reference: `record:${entry.recordId}`, version: entry.version })), confirmed: false }); setReason(""); setError(""); }}>Update Shared Evidence</Button>}
      </div>)}
    </div>}
    {(editing || sharing) && <ModalShell open title={editing ? "Laboratory Result Addendum" : "Update Shared Laboratory Evidence"} size="wide" onClose={() => { if (!busy) { setEditing(null); setSharing(null); } }}>
      <div className="space-y-4">
        <p className="text-xs text-neutral-500">The finalized clinical assessment and previously recorded results remain preserved.</p>
        {editing && <LaboratoryFields entry={editing} prefix="laboratoryTests.0" errors={fieldErrors} disabled={busy} onChange={setEditing} />}
        {sharing && <LaboratoryEvidencePicker options={(history.data || []).map(entry => ({ ...entry, reference: `record:${entry.recordId}` }))} selected={sharing.selected} confirmed={sharing.confirmed} disabled={busy} loading={history.isFetching} loadError={history.isError} onRefresh={async () => {
          await history.refetch(); const refreshed = await handoffs.refetch();
          setSharing(current => current ? { ...current, sharingRevision: refreshed.data?.find(row => row.id === current.id)?.sharingRevision ?? current.sharingRevision, confirmed: false } : null);
        }} onChange={(selected, confirmed) => setSharing({ ...sharing, selected, confirmed })} />}
        {sharing && sharing.selected.length === 0 && <label className="flex gap-2 text-xs"><input type="checkbox" checked={sharing.confirmed} onChange={event => setSharing({ ...sharing, confirmed: event.target.checked })} />I confirm withdrawing all shared laboratory evidence from this handoff.</label>}
        <label className="block text-xs font-medium text-neutral-700">Reason *<textarea rows={2} value={reason} maxLength={2000} disabled={busy} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm" /></label>
        {editing && <><p className="text-xs text-neutral-500">Attachment changes are saved immediately with the reason above.</p><LaboratoryAttachments context={{ recordId, testId: editing.id }} attachments={entries.find(entry => entry.recordId === editing.recordId)?.attachments || []} reason={reason} disabled={busy} uploadsAvailable={query.data?.uploads_available} onBusyChange={setBusy} onChanged={refresh} /></>}
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(null); setSharing(null); }}>Cancel</Button><Button type="button" variant="brand" disabled={busy} onClick={save}>{busy ? "Saving…" : sharing ? "Confirm Sharing Update" : "Save Addendum"}</Button></div>
      </div>
    </ModalShell>}
  </section>;
}
