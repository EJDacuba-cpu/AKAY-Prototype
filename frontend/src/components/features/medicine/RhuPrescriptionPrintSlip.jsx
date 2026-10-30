import "./rhu-prescription-print.css";

export default function RhuPrescriptionPrintSlip({
  patientName = "",
  visitDate = "",
  facility = "",
  prescriptionText = "",
}) {
  return (
    <div className="rhu-prescription-print hidden print:block">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-800">Prescription</p>
      <h1 className="mt-2 text-lg font-bold text-ink-800">{patientName || "Patient"}</h1>
      <p className="mt-1 text-sm text-neutral-600">{facility}</p>
      <p className="text-sm text-neutral-600">{visitDate}</p>
      <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{prescriptionText}</p>
    </div>
  );
}
