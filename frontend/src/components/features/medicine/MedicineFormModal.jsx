import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, PackagePlus } from "lucide-react";
import {
  ModalButton,
  ModalShell,
} from "../../common";
import {
  computeMedicineStatus,
  MEDICINE_CATEGORIES,
  MEDICINE_UNITS,
} from "../../../services/medicineService";
import { createIdempotencyKey } from "../../../utils/idempotency";
import {
  formatStockQuantity,
  previewInventoryResult,
} from "../../../utils/medicineInventoryPreview";
import {
  medicineFormHasErrors,
  medicineFormNeedsCorrection,
  validateMedicineForm,
} from "../../../utils/medicineFormValidation";
import { createSubmitGate } from "../../../utils/medicineSubmitGate";

const DEFAULT_FORM = {
  name: "",
  category: "Basic Medicines",
  quantity: "",
  unit: "pcs",
  lowStockThreshold: "10",
  expiryDate: "",
  notes: "",
  reason: "",
};

export default function MedicineFormModal({
  open,
  mode = "add",
  item = null,
  title,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const formId = useId();
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createSubmitGate();

  useEffect(() => {
    if (!open) return;

    gateRef.current.end();
    setSubmitting(false);
    setError("");
    setFieldErrors({});
    setIdempotencyKey(createIdempotencyKey());

    if (item) {
      setForm({
        name: item.name || "",
        category: item.category || "Basic Medicines",
        quantity: String(item.quantity ?? ""),
        unit: item.unit || "pcs",
        lowStockThreshold: String(item.lowStockThreshold ?? 10),
        expiryDate: item.expiryDate || "",
        notes: item.notes || "",
        reason: "",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [open, item, mode]);

  if (!open) return null;

  const originalQuantity = Number(item?.quantity ?? 0);
  const correctionOptions = {
    originalQuantity,
    reconciliationRequired: Boolean(item?.reconciliationRequired),
  };
  const needsCorrection =
    mode === "edit" && medicineFormNeedsCorrection(form, correctionOptions);
  const previewStatus = computeMedicineStatus(
    form.quantity,
    form.lowStockThreshold,
  );
  const stockPreview =
    mode === "edit"
      ? previewInventoryResult({
          mode: "correction",
          currentQuantity: originalQuantity,
          inputQuantity: form.quantity,
          unit: form.unit || item?.unit,
        })
      : null;

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!gateRef.current.begin()) return;

    const nextErrors = validateMedicineForm(form, mode, correctionOptions);
    if (medicineFormHasErrors(nextErrors)) {
      setFieldErrors(nextErrors);
      gateRef.current.end();
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      lowStockThreshold: parseInt(form.lowStockThreshold, 10) || 0,
      notes: form.notes.trim(),
    };
    if (mode === "add") {
      payload.quantity = parseInt(form.quantity, 10) || 0;
      delete payload.reason;
    } else if (needsCorrection) {
      payload.quantity = parseInt(form.quantity, 10);
      payload.reason = form.reason.trim();
    } else {
      delete payload.quantity;
      delete payload.reason;
    }

    try {
      setSubmitting(true);
      setError("");
      await onSubmit?.(payload, {
        idempotencyKey:
          mode === "add" || needsCorrection ? idempotencyKey : undefined,
      });
    } catch (submitError) {
      setError(submitError?.message || "Unable to save this medicine.");
      setSubmitting(false);
      gateRef.current.end();
    }
  }

  return (
    <ModalShell
      open={open}
      title={title || (mode === "edit" ? "Edit Medicine" : "Add Medicine")}
      subtitle={
        mode === "edit"
          ? "Edit item details. Changing recorded stock requires a reason and writes an inventory correction."
          : "Opening balance sets the first ledgered stock quantity."
      }
      icon={<PackagePlus size={14} />}
      size="xl"
      onClose={onClose}
      closeDisabled={submitting}
      dismissOnBackdrop={!submitting}
      dismissOnEscape={!submitting}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={submitting}>
            Cancel
          </ModalButton>
          <ModalButton
            type="submit"
            form={formId}
            variant="primary"
            primary
            disabled={submitting || Boolean(stockPreview?.wouldBeNegative)}
            aria-busy={submitting}
          >
            {submitting && <LoaderCircle size={14} className="animate-spin" />}
            {submitting
              ? "Saving..."
              : mode === "edit"
                ? "Save Changes"
                : "Add Medicine"}
          </ModalButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handleSubmit}
      >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Medicine / Supply Name"
              required
              className="md:col-span-2"
              error={fieldErrors.name}
            >
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="e.g. Paracetamol 500mg"
                className={inputClass}
                aria-invalid={fieldErrors.name ? true : undefined}
                disabled={submitting}
              />
            </Field>

            <Field label="Category">
              <select
                value={form.category}
                onChange={(event) =>
                  updateField("category", event.target.value)
                }
                className={inputClass}
                disabled={submitting}
              >
                {MEDICINE_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>

            <Field label="Expiry Date">
              <input
                type="date"
                value={form.expiryDate}
                onChange={(event) =>
                  updateField("expiryDate", event.target.value)
                }
                className={inputClass}
                disabled={submitting}
              />
            </Field>

            {mode === "add" && (
              <Field label="Opening Balance" required error={fieldErrors.quantity}>
                <input
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(event) =>
                    updateField("quantity", event.target.value)
                  }
                  placeholder="0"
                  className={inputClass}
                  aria-invalid={fieldErrors.quantity ? true : undefined}
                  disabled={submitting}
                />
              </Field>
            )}

            {mode === "edit" && (
              <Field
                label="Recorded Stock"
                required
                error={fieldErrors.quantity}
              >
                <input
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(event) =>
                    updateField("quantity", event.target.value)
                  }
                  className={inputClass}
                  aria-invalid={fieldErrors.quantity ? true : undefined}
                  disabled={submitting}
                />
              </Field>
            )}

            <Field label="Unit">
              <select
                value={form.unit}
                onChange={(event) => updateField("unit", event.target.value)}
                className={inputClass}
                disabled={submitting}
              >
                {MEDICINE_UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </Field>

            <Field
              label="Low Stock Threshold"
              required
              error={fieldErrors.lowStockThreshold}
            >
              <input
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(event) =>
                  updateField("lowStockThreshold", event.target.value)
                }
                className={inputClass}
                aria-invalid={fieldErrors.lowStockThreshold ? true : undefined}
                disabled={submitting}
              />
            </Field>

            {mode === "add" ? (
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Computed Status
                </p>
                <p className="mt-1 text-sm font-semibold text-[#B91C1C]">
                  {previewStatus}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Current quantity → Resulting quantity
                </p>
                <p className="mt-1 text-sm font-semibold text-[#0F172A]">
                  {formatStockQuantity(stockPreview?.current, stockPreview?.unit)}
                  {" → "}
                  {formatStockQuantity(stockPreview?.resulting, stockPreview?.unit)}
                </p>
                {stockPreview?.wouldBeNegative && (
                  <p role="alert" className="mt-2 text-xs font-medium text-[#B91C1C]">
                    Resulting stock cannot be negative.
                  </p>
                )}
              </div>
            )}

            {mode === "edit" && item?.reconciliationRequired && (
              <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-medium text-amber-800">
                This item needs stock verification after a dispensing discrepancy.
                Confirm or correct the quantity and enter a reason.
              </div>
            )}

            {needsCorrection && (
              <Field
                label="Reason"
                required
                className="md:col-span-2"
                error={fieldErrors.reason}
              >
                <textarea
                  value={form.reason}
                  onChange={(event) => updateField("reason", event.target.value)}
                  placeholder="Explain why the recorded stock is being corrected"
                  rows={3}
                  maxLength={1000}
                  className={`${inputClass} min-h-21 resize-none py-2.5`}
                  aria-invalid={fieldErrors.reason ? true : undefined}
                  disabled={submitting}
                />
              </Field>
            )}

            <Field label="Notes" className="md:col-span-2">
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Optional coordination note..."
                rows={3}
                className={`${inputClass} min-h-21 resize-none py-2.5`}
                disabled={submitting}
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="md:col-span-2 rounded-lg border border-red-100 bg-red-50 px-3.5 py-3 text-xs font-medium text-[#B91C1C]"
              >
                {error}
              </div>
            )}
          </div>
      </form>
    </ModalShell>
  );
}

function Field({ label, required = false, className = "", error, children }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="ml-0.5 text-[#B91C1C]">*</span>}
      </label>
      {children}
      {(error || required) && (
        <p
          role={error ? "alert" : undefined}
          className="mt-1 min-h-4 text-xs leading-4 text-[#B91C1C]"
        >
          {error || ""}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#BCC3CD] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60";
