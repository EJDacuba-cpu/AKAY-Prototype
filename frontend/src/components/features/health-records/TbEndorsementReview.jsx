import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../ui/button";
import { searchBhcPatients } from "../../../services/monitoringHandoffService";
import { formatPatientName } from "../../../utils/formatters";
import { TB_ENDORSEMENT_LABELS, tbEndorsementActionPayload } from "../../../utils/tbEndorsements";
import SharedTbCaseView from "./SharedTbCaseView";

const control = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ink-400";

export function TbEndorsementReview({ endorsement: row, onAction, busy = false }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState("");
  const [verified, setVerified] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const handleCardReady = useCallback(ready => { setCardReady(ready); if (!ready) setConfirmed(false); }, []);
  const [reason, setReason] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  async function search(event) {
    event.preventDefault();
    if (searching || query.trim().length < 2) return;
    setSearching(true); setError(""); setSelected(""); setVerified(false);
    try { setMatches(await searchBhcPatients(query.trim())); }
    catch (failure) { setMatches([]); setError(failure.message || "Unable to search BHC registrations."); }
    finally { setSearching(false); }
  }
  function act(action) {
    const payload = tbEndorsementActionPayload(action, row, { linkedPatientId: selected, identityConfirmed: verified, confirmed, reason });
    if (action === "link" && (!selected || !verified)) { setError("Select the BHC registration and confirm the patient's identity."); return; }
    if (action === "accept" && (!confirmed || !cardReady)) { setError("Review Form 4B and confirm acceptance first."); return; }
    if (action === "decline" && !payload.reason) { setError("Enter a reason for declining."); return; }
    setError(""); onAction(action, payload);
  }
  const source = row.source_patient || {};
  return <section aria-label="TB endorsement review" className="min-w-0 space-y-4">
    <h2 className="text-base font-semibold text-ink-900">{row.case_number} · {TB_ENDORSEMENT_LABELS[row.status]}</h2>
    <p className="text-sm text-neutral-700">{formatPatientName(source)} · {source.birthdate || "Birth date not recorded"} · {source.sex || "Sex not recorded"}</p>
    <p className="text-sm text-neutral-600">From {row.sending_rhu?.name} to {row.receiving_bhc?.name}</p>
    {row.note && <p className="whitespace-pre-wrap border-l-2 border-neutral-300 pl-3 text-sm text-neutral-700">{row.note}</p>}
    {row.reason && <p className="text-sm text-neutral-600">Reason: {row.reason}</p>}
    {row.linked_patient && <Link className="text-sm font-medium text-ink-800 underline underline-offset-4" to={`/bhc/patients/${row.linked_patient.id}?tab=programs`}>Open BHC patient registration</Link>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {row.can_link && <div className="space-y-3 border-t border-neutral-200 pt-4">
      <p className="text-sm text-neutral-600">Find the existing BHC registration and verify that it belongs to this patient.</p>
      <form onSubmit={search} className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm text-neutral-700">Search BHC registrations<input className={control} value={query} onChange={event => setQuery(event.target.value)} disabled={busy || searching} /></label><Button type="submit" variant="secondary" disabled={busy || searching || query.trim().length < 2}>{searching ? "Searching…" : "Search"}</Button></form>
      {matches.length > 0 && <label className="block text-sm text-neutral-700">Matching BHC registrations<select className={control} value={selected} onChange={event => { setSelected(event.target.value); setVerified(false); }} disabled={busy}><option value="">Select a registration</option>{matches.map(patient => <option key={patient.id} value={patient.id}>{formatPatientName(patient)} · {patient.birthdate || "No birth date"} · {patient.sex}</option>)}</select></label>}
      <label className="flex items-start gap-2 text-sm text-neutral-700"><input className="mt-1" type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} disabled={busy || !selected} /><span>I verified that the selected BHC registration belongs to this patient.</span></label>
      <Button variant="brand" disabled={busy || !selected || !verified} onClick={() => act("link")}>Link BHC registration</Button>
      <p className="text-sm text-neutral-600">If no registration exists, <Link className="underline underline-offset-4" to="/bhc/patients/add">register the patient</Link>, then return here to verify and link it.</p>
    </div>}
    {row.can_read_case && <div className="border-t border-neutral-200 pt-4"><SharedTbCaseView caseId={row.case_id} onReadyChange={handleCardReady} /></div>}
    {row.can_accept && <div className="space-y-3"><label className="flex items-start gap-2 text-sm text-neutral-700"><input className="mt-1" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy || !cardReady} /><span>I reviewed Form 4B and accept this BHC as the DOTS treatment partner.</span></label><Button variant="brand" disabled={busy || !confirmed || !cardReady} onClick={() => act("accept")}>Accept for DOTS</Button></div>}
    {row.can_decline && <div className="space-y-2 border-t border-neutral-200 pt-3"><label className="block text-sm text-neutral-700">Decline reason<textarea className={control} rows={2} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label><Button variant="secondary" disabled={busy || !reason.trim()} onClick={() => act("decline")}>Decline endorsement</Button></div>}
  </section>;
}
