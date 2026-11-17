import { ModalButton, ModalFooter, ModalShell } from "../../common";
import usePrintDocument from "../../../hooks/usePrintDocument";
import "./prescription-document.css";

export default function PrescriptionPreviewModal({ prescription, onClose }) {
  const print = usePrintDocument("#consultation-prescription", { title: "Prescription" });
  const { patient, doctor, medicines, date, recordId } = prescription;
  return (
    <ModalShell open title="Prescription" size="3xl" onClose={onClose} footer={
      <ModalFooter>
        <ModalButton onClick={onClose}>Close</ModalButton>
        <ModalButton variant="primary" onClick={print}>Print Prescription</ModalButton>
      </ModalFooter>
    }>
      <article id="consultation-prescription" data-print-key={recordId} className="prescription-document text-sm text-ink-800">
        <h1 className="text-center text-lg font-bold">Prescription</h1>
        <div className="mt-6 space-y-1">
          <p><strong>Patient:</strong> {patient.name}</p>
          <p><strong>Age:</strong> {patient.age}</p>
          <p><strong>Sex:</strong> {patient.sex}</p>
          <p><strong>Date:</strong> {date}</p>
          <p><strong>Address:</strong> {patient.address}</p>
        </div>
        <div className="mt-6 text-3xl" aria-label="Prescription">℞</div>
        {medicines.map((medicine, index) => (
          <section key={index} className="prescription-medicine mt-4 space-y-1">
            <h2 className="font-semibold">{index + 1}. {medicine.medicineName} — {medicine.strength}</h2>
            <p>Dose: {medicine.dose}</p>
            <p>Route: {medicine.route}</p>
            <p>Frequency: {medicine.frequency}</p>
            <p>Duration: {medicine.duration}</p>
            <p>Quantity: {medicine.authorizedQuantity} {medicine.authorizedUnit}</p>
            {medicine.instructions?.trim() && <p>Instructions: {medicine.instructions}</p>}
          </section>
        ))}
        <div className="prescription-signature mt-8 ml-auto w-fit max-w-full text-center">
          <p className="font-semibold">Dr. {doctor.name.replace(/^Dr\.?\s+/i, "")}</p>
          <p>PRC License No.: {doctor.prcLicenseNumber}</p>
          <div className="prescription-signature-line border-b border-ink-800" />
          <p className="mt-1">Physician's Signature</p>
        </div>
        <footer className="mt-8 text-center text-xs text-neutral-500">Generated through AKAY</footer>
      </article>
    </ModalShell>
  );
}
