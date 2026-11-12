import usePrintDocument from "../../../hooks/usePrintDocument";
import { getCurrentUser } from "../../../utils/auth";
import { formatFacilityName } from "../../../utils/formatters";
import { ModalButton, ModalFooter, ModalShell } from "../../common";
import RhuPrescriptionPrintSlip from "./RhuPrescriptionPrintSlip";

function medicineOrders(row) {
  if (Array.isArray(row?.prescriptions) && row.prescriptions.length > 0) {
    return row.prescriptions;
  }
  const text = String(row?.prescriptionText || "").trim();
  if (!text) return [];
  return text.split(/\n+/).map((line) => ({ line: line.trim() })).filter((item) => item.line);
}

function MedicineOrderCard({ order, index }) {
  const title = order.medicineName
    ? [order.medicineName, order.strength].filter(Boolean).join(" ")
    : order.line || `Order ${index + 1}`;
  const details = [
    ["Dose", order.dose],
    ["Route", order.route],
    ["Frequency", order.frequency],
    ["Duration", order.duration],
    ["Instructions", order.instructions],
    [
      "Authorized quantity",
      order.authorizedQuantity != null && order.authorizedUnit
        ? `${order.authorizedQuantity} ${order.authorizedUnit}`
        : order.authorizedQuantity != null
          ? String(order.authorizedQuantity)
          : order.authorizedUnit || "",
    ],
  ].filter(([, value]) => String(value || "").trim());

  return (
    <article className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
      {details.length ? (
        <dl className="mt-2 grid gap-1 text-xs text-neutral-700 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-ink-800">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-800">{order.line}</p>
      )}
    </article>
  );
}

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
  const orders = medicineOrders(row);

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-neutral-600">{row.visitDate}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Status: {given ? "Given" : "Pending"}
          </p>
        </div>
        <p className="text-xs text-neutral-600">
          Review the physician-authorized medicines below. Prepare inventory and confirm what was given.
        </p>
        <div className="space-y-2">
          {orders.length === 0 ? (
            <p className="text-sm text-neutral-600">No medicine orders are available for this visit.</p>
          ) : (
            orders.map((order, index) => (
              <MedicineOrderCard key={order.id || `${order.line}-${index}`} order={order} index={index} />
            ))
          )}
        </div>
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
