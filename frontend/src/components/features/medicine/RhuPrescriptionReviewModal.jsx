import usePrintDocument from "../../../hooks/usePrintDocument";
import { getCurrentUser } from "../../../utils/auth";
import { formatFacilityName } from "../../../utils/formatters";
import { ModalButton, ModalFooter, ModalShell } from "../../common";
import RhuPrescriptionPrintSlip from "./RhuPrescriptionPrintSlip";

export default function RhuPrescriptionReviewModal({
  row,
  facility = "",
  onClose,
  onDispense,
}) {
  const user = getCurrentUser();
  const printFacility = formatFacilityName(
    user?.ruralHealthUnit || user?.rural_health_unit || user?.facility || user?.assignedRuralHealthUnit,
    facility || "Not recorded",
  );
  const handlePrint = usePrintDocument(".rhu-prescription-print", {
    title: "AKAY Prescription",
    validate: () => {
      if (!row?.id || !row.prescriptionText?.trim()) {
        throw new Error("The saved prescription is unavailable. Reload the prescription and retry printing.");
      }
    },
  });
  if (!row) return null;
  const given = row.status === "given";

  return (
    <ModalShell
      open
      title="Review prescription"
      subtitle={row.patientName}
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooter>
          <ModalButton onClick={onClose}>Close</ModalButton>
          <ModalButton onClick={handlePrint}>Print</ModalButton>
          <ModalButton variant="primary" disabled={given} onClick={onDispense}>
            Dispense
          </ModalButton>
        </ModalFooter>
      }
    >
      <div className="space-y-3 print:hidden">
        <p className="text-sm text-neutral-600">{row.visitDate}</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{row.prescriptionText}</p>
        {given ? (
          <p className="text-xs text-neutral-600">Medicines have already been confirmed given for this visit.</p>
        ) : null}
      </div>
      <RhuPrescriptionPrintSlip
        recordId={row.id}
        patientName={row.patientName}
        visitDate={row.visitDate}
        facility={printFacility}
        prescriptionText={row.prescriptionText}
      />
    </ModalShell>
  );
}
