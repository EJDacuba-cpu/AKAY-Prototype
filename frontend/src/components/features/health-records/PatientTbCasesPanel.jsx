import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../ui/button";
import { getPatientTbCases } from "../../../services/tbCaseService";
import SharedTbCaseView from "./SharedTbCaseView";

export default function PatientTbCasesPanel({ patientId }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const query = useQuery({ queryKey: ["tb-cases", String(patientId), page], queryFn: () => getPatientTbCases(patientId, page), retry: false });
  const rows = query.data?.data || [];
  return <section aria-label="Shared TB treatment cases" className="mb-5 min-w-0 space-y-4 border-b border-neutral-200 pb-5">
    <h2 className="text-base font-semibold text-ink-900">Shared TB treatment cards</h2>
    {query.isError ? <div className="space-y-2"><p role="alert" className="text-sm text-red-800">Unable to load shared TB cases.</p><Button variant="secondary" onClick={() => query.refetch()}>Retry</Button></div>
      : query.isPending ? <p role="status" className="text-sm text-neutral-600">Loading shared TB cases…</p>
      : <>
        {rows.length === 0 ? <p className="text-sm text-neutral-600">No linked Form 4B is shared with this BHC.</p> : <ul className="divide-y divide-neutral-200">{rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><p className="text-sm text-neutral-700"><strong>{row.case_number}</strong> · {row.status === "closed" ? "Closed" : "Active"}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setSelected(selected === row.id ? null : row.id)} aria-expanded={selected === row.id}>View Form 4B</Button><Button asChild variant="secondary"><Link to={`/bhc/patients?view=monitoring-requests&tab=tb-endorsements&case=${row.id}`}>Review endorsement</Link></Button></div></li>)}</ul>}
        {query.data?.last_page > 1 && <div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelected(null); }}>Previous</Button><Button variant="secondary" disabled={page >= query.data.last_page} onClick={() => { setPage(page + 1); setSelected(null); }}>Next</Button></div>}
        {selected && rows.some(row => row.id === selected) && <SharedTbCaseView key={selected} caseId={selected} />}
      </>}
  </section>;
}
