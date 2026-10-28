import { Input } from "../../ui/input";
import { expiryGroups, groupLabel, validateReceiptExpiry } from "../../../utils/medicineExpiryGroups";
import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, PackageMinus, PackagePlus } from "lucide-react";
import {
  ModalButton,
  ModalShell,
} from "../../common";
import { createIdempotencyKey } from "../../../utils/idempotency";
import {
  formatStockQuantity,
  previewInventoryResult,
} from "../../../utils/medicineInventoryPreview";
import { createSubmitGate } from "../../../utils/medicineSubmitGate";

export default function MedicineInventoryActionModal({
  open,
  mode,
  item,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({
    expiryDate: "", expiryNotApplicable: false, expiry_group_id: "",
    quantity: "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const formId = useId();
  const gateRef = useRef(null);
  if (gateRef.current == null) gateRef.current = createSubmitGate();

  useEffect(() => {
    if (!open) return;
    gateRef.current.end();
    setForm({
      expiryDate: "", expiryNotApplicable: false, expiry_group_id: "",
    quantity: "",
      reason: "",
    });
    setSubmitting(false);
    setError("");
    setIdempotencyKey(createIdempotencyKey());
  }, [open, mode, item]);

  if (!open || !item) return null;

  const isRestock = mode === "restock";
  const group = expiryGroups(item).find(g => String(g.id) === String(form.expiry_group_id));
  const preview = previewInventoryResult({
    mode: isRestock ? "restock" : "deduct",
    currentQuantity: item.quantity,
    inputQuantity: form.quantity,
    unit: item.unit,
  });

  async function handleSubmit(event) {
    event.preventDefault();
    if (!gateRef.current.begin()) return;
    const issue = isRestock ? validateReceiptExpiry({ ...form, itemType: item.itemType }) : !group ? "Select the expiry group to deduct from." : Number(form.quantity) > Number(group.available_quantity) ? "Quantity exceeds this group?s available stock." : "";
    if (issue || preview.wouldBeNegative) {
      setError(issue || "Resulting stock cannot be negative.");
      gateRef.current.end();
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await onSubmit?.(
        {
          expiryDate: form.expiryDate, expiryNotApplicable: form.expiryNotApplicable, expiry_group_id: form.expiry_group_id,
          quantity: Number(form.quantity),
          reason: form.reason.trim(),
        },
        { idempotencyKey },
      );
    } catch (submitError) {
      setError(
        submitError?.message || "Unable to update medicine inventory.",
      );
      setSubmitting(false);
      gateRef.current.end();
    }
  }

  return (
    <ModalShell
      open={Boolean(open && item)}
      title={isRestock ? "Restock Medicine" : "Deduct Stock"}
      subtitle={item.name}
      icon={
        isRestock ? <PackagePlus size={14} /> : <PackageMinus size={14} />
      }
      size="lg"
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
            disabled={submitting || preview.wouldBeNegative}
            aria-busy={submitting}
          >
            {submitting && <LoaderCircle size={14} className="animate-spin" />}
            {submitting
              ? "Saving..."
              : isRestock
                ? "Add Stock"
                : "Deduct Stock"}
          </ModalButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handleSubmit}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Current quantity → Resulting quantity
            </p>
            <p className="mt-1 text-base font-semibold text-[#0F172A]">
              {formatStockQuantity(preview.current, preview.unit)}
              {" → "}
              {formatStockQuantity(preview.resulting, preview.unit)}
            </p>
            {preview.wouldBeNegative && (
              <p role="alert" className="mt-2 text-xs font-medium text-[#B91C1C]">
                Resulting stock cannot be negative.
              </p>
            )}
          </div>

          {isRestock ? <Field label="Received Stock Expiry" required>
            <Input aria-label="Received Stock Expiry" type="date" disabled={submitting || form.expiryNotApplicable} value={form.expiryDate}
              onChange={e => setForm(current => ({ ...current, expiryDate: e.target.value }))} />
            {item.itemType === "health_supply" && <label className="mt-2 flex gap-2 text-xs text-neutral-600">
              <input type="checkbox" checked={form.expiryNotApplicable} disabled={submitting} onChange={e => setForm(current => ({ ...current, expiryNotApplicable: e.target.checked, expiryDate: "" }))} />
              Not Applicable ? no manufacturer-defined expiry.
            </label>}
          </Field> : <Field label="Expiry Group ? Available Pool" required>
            <select aria-label="Expiry group to deduct" className={inputClass} value={form.expiry_group_id} required disabled={submitting}
              onChange={e => setForm(current => ({ ...current, expiry_group_id: e.target.value }))}>
              <option value="">Select an expiry group</option>
              {expiryGroups(item).filter(g => Number(g.available_quantity) > 0).map(g => <option key={g.id} value={g.id}>{groupLabel(g)} ? {g.available_quantity} available</option>)}
            </select>
            <p className="mt-1 text-xs text-neutral-600">Quarantined stock must use Dispose in Medicine Details.</p>
          </Field>}
          <Field label={isRestock ? "Quantity to Add" : "Quantity"} required>
            <input
              type="number"
              min="1"
              max="2147483647"
              value={form.quantity}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  quantity: event.target.value,
                }))
              }
              className={inputClass}
              required
            />
          </Field>

          <Field label="Reason" required>
            <textarea
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              rows={3}
              maxLength={1000}
              className={`${inputClass} min-h-24 resize-none py-2.5`}
              placeholder={
                isRestock
                  ? "Enter the restock reason"
                  : "Damaged, expired, lost, missing, or other deduction reason"
              }
              required
            />
          </Field>

          {error && (
            <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3.5 py-3 text-xs font-medium text-[#B91C1C]">
              {error}
            </div>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="ml-0.5 text-[#B91C1C]">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm text-[#1F2937] outline-none transition-all focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10";
