import "./rhu-prescription-print.css";

export default function RhuPrescriptionPrintSlip({
  recordId = "",
  patientName = "",
  visitDate = "",
  facility = "",
  prescriptionText = "",
}) {
  return (
    <div data-print-key={recordId} className="rhu-prescription-print hidden print:block">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-800">Prescription</p>
      <h1 className="mt-2 text-lg font-bold text-ink-800">{patientName || "Not recorded"}</h1>
      <p className="mt-1 text-sm text-neutral-600">{facility || "Facility not recorded"}</p>
      <p className="text-sm text-neutral-600">Record #{recordId || "Not recorded"}</p>
      <p className="text-sm text-neutral-600">{visitDate || "Visit date not recorded"}</p>
      <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{prescriptionText}</p>
    </div>
  );
}
