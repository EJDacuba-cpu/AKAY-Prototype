import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import { getTbMonitoring, getTbMonitoringEntry, saveTbMonitoring } from "../../../services/tbCaseService";
import { TB_DOSE_LABELS, tbMonitoringPayload, tbMonitoringErrors, tbMonitoringAttempt } from "../../../utils/tbMonitoring";

const control = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400";
const timestamp = value => value ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "—";
const failureMessage = failure => Object.values(failure.errors || {}).flat().join(" ") || failure.message || "Unable to save this observation.";

export function TbMonitoringForm({ context, entry = null, busy = false, suspended = false, onSave, onCancel }) {
  const [fields, setFields] = useState({ observedOn: context.today, doseStatus: entry?.dose_status || "", weightKg: entry?.weight_kg || "",
    notes: entry?.notes || "", reason: "", voided: entry?.voided || false });
  const [error, setError] = useState("");
  const set = (key, value) => setFields(previous => ({ ...previous, [key]: value }));
  function submit(event) {
    event.preventDefault();
    const payload = tbMonitoringPayload(fields, context.endorsement, entry);
    const errors = tbMonitoringErrors(payload, context);
    if (Object.keys(errors).length) { setError(Object.values(errors).join(" ")); return; }
    setError(""); onSave(payload, entry?.id || null);
  }
  // Suspending the DOM keeps draft state inside this mounted form component.
  if (suspended) return null;
  return <form onSubmit={submit} className="space-y-3 border-t border-neutral-200 pt-4" aria-label={entry ? "Correct DOTS observation" : "Record DOTS observation"}>
    {entry && <p className="text-sm font-semibold text-ink-900">Correct entry · {entry.observed_on} · version {entry.version}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <fieldset disabled={busy} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {!entry && <label className="block text-sm font-medium text-neutral-700">Observation date<input type="date" className={control} required min={context.start_date} max={context.today} value={fields.observedOn} onChange={event => set("observedOn", event.target.value)} /></label>}
        <label className="block text-sm font-medium text-neutral-700">Dose observation<select className={control} value={fields.doseStatus} onChange={event => set("doseStatus", event.target.value)} disabled={fields.voided}><option value="">Not observed / weight only</option>{Object.entries(TB_DOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block text-sm font-medium text-neutral-700">Weight (kg, optional)<input type="number" className={control} min="0.01" max="9999.99" step="0.01" value={fields.weightKg} onChange={event => set("weightKg", event.target.value)} disabled={fields.voided} /></label>
      </div>
      <label className="block text-sm font-medium text-neutral-700">Notes / RHU instructions<textarea className={control} maxLength={1000} rows={2} value={fields.notes} onChange={event => set("notes", event.target.value)} required={!fields.voided && fields.doseStatus === "on_hold"} /></label>
      {entry && <>
        <label className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" className="mt-1 accent-ink-800" checked={fields.voided} onChange={event => set("voided", event.target.checked)} /><span>Void this observation. Its date and previous versions remain in history.</span></label>
        <label className="block text-sm font-medium text-neutral-700">Correction reason<textarea className={control} required maxLength={1000} rows={2} value={fields.reason} onChange={event => set("reason", event.target.value)} /></label>
      </>}
      <div className="flex flex-wrap gap-2"><Button variant="brand" type="submit">{busy ? "Saving…" : entry ? "Save correction" : "Save observation"}</Button>{entry && <Button variant="secondary" type="button" onClick={onCancel}>Cancel correction</Button>}</div>
    </fieldset>
  </form>;
}

export default function TbMonitoringPanel({ caseId, enabled = true }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [formEpoch, setFormEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessLost, setAccessLost] = useState(false);
  const running = useRef(false);
  const attempt = useRef(null);
  const query = useQuery({ queryKey: ["tb-monitoring", String(caseId), page], queryFn: () => getTbMonitoring(caseId, page), enabled, retry: false, refetchOnWindowFocus: false });
  const history = useQuery({ queryKey: ["tb-monitoring-entry", String(caseId), String(historyId)], queryFn: () => getTbMonitoringEntry(caseId, historyId), enabled: enabled && Boolean(historyId), retry: false });
  const denied = accessLost || [403, 404].includes(query.error?.status) || [403, 404].includes(history.error?.status);
  useEffect(() => {
    if (denied) {
      void client.invalidateQueries({ queryKey: ["tb-case", String(caseId)] });
      void client.invalidateQueries({ queryKey: ["tb-monitoring", String(caseId)] });
    }
  }, [denied, client, caseId]);
  function refresh() {
    setHistoryId(null); setAccessLost(false); setEditing(null); setError("");
    return query.refetch();
  }
  async function save(payload, entryId) {
    if (running.current) return;
    attempt.current = tbMonitoringAttempt(attempt.current, caseId, entryId, payload);
    running.current = true; setBusy(true); setError("");
    try {
      await saveTbMonitoring(attempt.current);
      setEditing(null); setFormEpoch(previous => previous + 1);
      await Promise.all([client.invalidateQueries({ queryKey: ["tb-monitoring"] }), client.invalidateQueries({ queryKey: ["tb-monitoring-entry"] }),
        client.invalidateQueries({ queryKey: ["tb-case-endorsements"] })]);
    } catch (failure) {
      const uncertain = failure.isNetworkError || failure.status >= 500;
      setError(uncertain ? "The save could not be confirmed. Retry with these same entries to recover it safely, or refresh to review the log." : failureMessage(failure));
      if ([403, 404].includes(failure.status)) setAccessLost(true);
      else if (failure.status === 409) { setEditing(null); await query.refetch(); }
    } finally { running.current = false; setBusy(false); }
  }
  if (denied) return <section className="space-y-2 border-t border-neutral-200 pt-4"><p role="alert" className="text-sm text-red-800">DOTS monitoring is unavailable. Access may have changed.</p><Button variant="secondary" onClick={refresh}>Retry</Button></section>;
  const data = query.data;
  const show = enabled && data && !query.isError && !query.isFetching;
  return <section aria-label="DOTS and weight monitoring" className="min-w-0 space-y-4 border-t border-neutral-200 pt-4">
    {query.isError && <div className="space-y-2"><p role="alert" className="text-sm text-red-800">DOTS monitoring is unavailable. Access may have changed.</p><Button variant="secondary" onClick={refresh}>Retry</Button></div>}
    {!show && !query.isError && <p role="status" className="text-sm text-neutral-600">Checking DOTS monitoring access…</p>}
    {show && <><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold text-ink-900">Daily DOTS &amp; weight monitoring</h3><Button variant="secondary" disabled={busy} onClick={refresh}>Refresh log</Button></div>
    <p className="text-sm text-neutral-600">Record what was observed. Unrecorded days remain unknown; dispensing does not establish supervised intake. Weight does not change the RHU prescription.</p>
    </>}
    {show && error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {data?.can_write && <TbMonitoringForm key={`${editing?.id || "new"}:${editing?.version || 0}:${formEpoch}`} context={data} entry={editing} busy={busy} suspended={!show} onSave={save} onCancel={() => setEditing(null)} />}
    {show && <>
    {!data.can_write && <p className="text-sm text-neutral-600">Observation entry requires an active case, a prescribed start date and acceptance by the assigned BHC. RHU staff review this log.</p>}
    {data.entries.data.length === 0 ? <p className="text-sm text-neutral-600">No observations recorded.</p>
      : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Dated medication and weight observations</caption><thead className="border-b border-neutral-200 text-neutral-600"><tr>{["Date", "Dose observation", "Weight (kg)", "Recorded by / BHC", "Notes", "Actions"].map(label => <th key={label} scope="col" className="px-2 py-2 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-neutral-200">{data.entries.data.map(row => <tr key={row.id} className="align-top text-neutral-700">
        <td className="whitespace-nowrap px-2 py-3 tabular-nums">{row.observed_on}<span className="mt-1 block text-xs text-neutral-500">v{row.version}</span></td>
        <td className="px-2 py-3">{row.voided ? "Voided" : TB_DOSE_LABELS[row.dose_status] || "Not observed"}</td>
        <td className="px-2 py-3 tabular-nums">{row.voided ? "—" : row.weight_kg || "—"}</td>
        <td className="px-2 py-3">{row.recorder_name}<span className="block text-xs text-neutral-500">{row.facility_name}</span><span className="block text-xs text-neutral-500">{timestamp(row.recorded_at)}</span></td>
        <td className="max-w-xs whitespace-pre-wrap break-words px-2 py-3">{row.notes || "—"}</td>
        <td className="px-2 py-3"><div className="flex flex-wrap gap-2">{row.can_correct && data.can_write && <Button variant="secondary" disabled={busy} onClick={() => { setEditing(row); setError(""); }}>Correct entry</Button>}<Button variant="secondary" disabled={busy} onClick={() => setHistoryId(historyId === row.id ? null : row.id)} aria-expanded={historyId === row.id}>History</Button></div></td>
      </tr>)}</tbody></table></div>}
    {data.entries.last_page > 1 && <div className="flex items-center gap-3"><Button variant="secondary" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm text-neutral-600">{page} / {data.entries.last_page}</span><Button variant="secondary" disabled={busy || page >= data.entries.last_page} onClick={() => setPage(page + 1)}>Next</Button></div>}
    {historyId && <section aria-label="Observation revision history" className="space-y-2 border-t border-neutral-200 pt-3"><h4 className="text-sm font-semibold text-ink-900">Observation history</h4>
      {history.isError ? <div><p role="alert" className="text-sm text-red-800">Unable to load observation history.</p><Button variant="secondary" onClick={() => history.refetch()}>Retry</Button></div>
        : !history.data || history.isFetching ? <p role="status" className="text-sm text-neutral-600">Loading history…</p>
        : <ol className="divide-y divide-neutral-200">{history.data.revisions.map(revision => <li key={revision.id} className="space-y-1 py-3 text-sm text-neutral-700"><p className="font-medium">{revision.values.observed_on} · v{revision.version} · {revision.values.voided ? "Voided" : TB_DOSE_LABELS[revision.values.dose_status] || "Not observed"} · {revision.values.weight_kg || "—"} kg</p><p>{revision.recorder_name} · {timestamp(revision.recorded_at)}</p>{revision.values.notes && <p className="whitespace-pre-wrap break-words">{revision.values.notes}</p>}{revision.reason && <p className="whitespace-pre-wrap break-words">Reason: {revision.reason}</p>}</li>)}</ol>}
    </section>}
    </>}
  </section>;
}
