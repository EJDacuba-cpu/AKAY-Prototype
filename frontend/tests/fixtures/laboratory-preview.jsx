// Development-only synthetic fixture. No clinical backend requests are sent.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LaboratoryTestsEditor, LaboratoryEvidencePicker, LaboratoryEvidenceList } from "../../src/components/features/health-records/LaboratoryEvidence";
import { evidenceOptions } from "../../src/utils/laboratoryTests";
import "../../src/index.css";

const originalFetch = window.fetch;
window.fetch = (input, options) => String(input).includes("laboratory-attachments")
  ? Promise.resolve(new Response(JSON.stringify({ data: [], uploads_available: true }), { headers: { "Content-Type": "application/json" } }))
  : originalFetch(input, options);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Fixture() {
  const [tests, setTests] = useState([{ id: "550e8400-e29b-41d4-a716-446655440000", testName: "Urine culture and antimicrobial susceptibility", collectionDate: "2026-11-01", examinationDate: "", resultStatus: "Result Available", result: "" }]);
  const [selected, setSelected] = useState([]); const [confirmed, setConfirmed] = useState(false);
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6"><h1 className="text-xl font-semibold text-ink-900">Physical Examination</h1><label className="block text-sm text-neutral-700">General Examination Findings<textarea className="mt-2 w-full rounded-lg border border-neutral-300 p-3" rows={2} defaultValue="Synthetic UI fixture — no patient data" /></label>
    <LaboratoryTestsEditor tests={tests} onChange={setTests} context={{ patientId: 1, visitId: 1, consultationUuid: "550e8400-e29b-41d4-a716-446655440001" }} errors={{ "laboratoryTests.0.result": "Enter the laboratory result." }} />
    <section className="space-y-3 border border-neutral-200 p-4"><h2 className="text-sm font-semibold">Manage to BHC</h2><LaboratoryEvidencePicker options={evidenceOptions(tests)} selected={selected} confirmed={confirmed} onChange={(next, confirmation) => { setSelected(next); setConfirmed(confirmation); }} /></section>
    <section className="space-y-3 border border-neutral-200 p-4"><h2 className="text-sm font-semibold">RHU Laboratory Evidence — BHC read-only</h2><LaboratoryEvidenceList entries={[{ ...tests[0], result: "Synthetic reference result", resultStatus: "Result Available" }]} /></section>
  </main>;
}
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>);
