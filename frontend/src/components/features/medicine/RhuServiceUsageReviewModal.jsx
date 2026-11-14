import { ModalButton, ModalFooter, ModalShell } from "../../common";
import DispensedMedicinesSection from "./DispensedMedicinesSection";

/**
 * Review clinically documented service usage and confirm RHU stock reconciliation.
 * Labeling avoids "Give vaccine" for already-administered EPI doses.
 */
export default function RhuServiceUsageReviewModal({
  row,
  facility,
  catalog,
  draft,
  onDraftChange,
  saving = false,
  catalogLoading = false,
  catalogError = "",
  onRetryCatalog,
  onClose,
  onConfirm,
  onNeedsReview,
}) {
  if (!row) return null;

  const pending = row.status === "pending" || row.status === "needs_review";

  return (
    <ModalShell
      open
      title="Review usage"
      subtitle={row.patientName}
      onClose={() => !saving && onClose?.()}
      size="xl"
      footer={
        <ModalFooter>
          <ModalButton disabled={saving} onClick={onClose}>
            Cancel
          </ModalButton>
          {pending ? (
            <>
              <ModalButton disabled={saving} onClick={onNeedsReview}>
                Mark for review
              </ModalButton>
              <ModalButton variant="primary" disabled={saving} onClick={onConfirm}>
                Confirm stock usage
              </ModalButton>
            </>
          ) : null}
        </ModalFooter>
      }
    >
      <div className="space-y-4 text-sm text-neutral-700">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Patient</dt>
            <dd className="mt-0.5 font-medium text-ink-800">{row.patientName || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Visit date</dt>
            <dd className="mt-0.5">{row.visitDate || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Source service</dt>
            <dd className="mt-0.5">{row.source || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Administered / used</dt>
            <dd className="mt-0.5">{row.administeredAt || row.visitDate || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Item</dt>
            <dd className="mt-0.5 font-medium text-ink-800">{row.itemSummary || row.itemDescription || "—"}</dd>
          </div>
          {row.note ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Note</dt>
              <dd className="mt-0.5">{row.note}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</dt>
            <dd className="mt-0.5 capitalize">{String(row.status || "pending").replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Facility</dt>
            <dd className="mt-0.5">{facility || "RHU"}</dd>
          </div>
        </dl>

        {row.status === "reconciled" ? (
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Stock usage already confirmed
            {row.inventoryTransactionId ? ` (transaction #${row.inventoryTransactionId})` : ""}.
          </p>
        ) : (
          <>
            <p className="text-xs text-neutral-600">
              Select the matching RHU inventory item and quantity to reconcile. Clinical
              dose metadata is not the same as inventory units — confirm packaging before deducting.
            </p>
            <DispensedMedicinesSection
              inventory={catalog}
              value={draft}
              onChange={onDraftChange}
              disabled={saving || !pending}
              loading={catalogLoading}
              error={catalogError}
              onRetry={onRetryCatalog}
              facilityLabel="RHU"
            />
          </>
        )}
      </div>
    </ModalShell>
  );
}
