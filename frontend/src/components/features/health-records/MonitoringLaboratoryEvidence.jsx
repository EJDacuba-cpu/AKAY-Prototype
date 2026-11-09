import { useQuery } from "@tanstack/react-query";
import { getMonitoringLaboratoryEvidence } from "../../../services/laboratoryService";
import { LaboratoryEvidenceList } from "./LaboratoryEvidence";

export default function MonitoringLaboratoryEvidence({ patientId, conditionIds = [] }) {
  const query = useQuery({ queryKey: ["monitoring-laboratory-evidence", String(patientId)], queryFn: () => getMonitoringLaboratoryEvidence(patientId), enabled: Boolean(patientId) });
  const selected = new Set(conditionIds.map(String));
  const entries = (query.data || []).filter(entry => selected.has(String(entry.conditionId)));
  return <section className="my-4 min-w-0 space-y-3 border border-neutral-200 bg-white p-4">
    <h3 className="text-sm font-semibold text-ink-900">RHU Laboratory Evidence</h3>
    {query.isFetching && <p role="status" className="text-xs text-neutral-500">Loading shared laboratory evidence…</p>}
    {query.isError ? <p role="alert" className="text-xs text-red-700">Unable to load evidence. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p> : <LaboratoryEvidenceList entries={entries} emptyMessage="No laboratory evidence shared for the selected monitoring conditions." />}
  </section>;
}
