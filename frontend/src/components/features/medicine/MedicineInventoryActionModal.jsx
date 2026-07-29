import { useEffect, useId, useState } from "react";
import { LoaderCircle, Package, PackagePlus } from "lucide-react";
import {
  ModalButton,
  ModalShell,
} from "../../common";

const ACTIONS = [
  { value: "adjustment_in", label: "Adjustment In" },
  { value: "adjustment_out", label: "Adjustment Out" },
  { value: "damaged_disposal", label: "Damaged Disposal" },
  { value: "expired_disposal", label: "Expired Disposal" },
  { value: "correction", label: "Correction" },
];

export default function MedicineInventoryActionModal({
  open,
  mode,
  item,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({
    action: "adjustment_out",
    direction: "out",
    quantity: "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();

  useEffect(() => {
    if (!open) return;
    setForm({
      action: "adjustment_out",
      direction: "out",
      quantity: "",
      reason: "",
    });
    setSubmitting(false);
    setError("");
  }, [open, mode, item]);

  if (!open || !item) return null;

  const isRestock = mode === "restock";

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    try {
      setSubmitting(true);
      setError("");
      await onSubmit?.({
        ...form,
        quantity: Number(form.quantity),
        reason: form.reason.trim(),
      });
    } catch (submitError) {
      setError(
        submitError?.message || "Unable to update medicine inventory.",
      );
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open={Boolean(open && item)}
      title={isRestock ? "Restock Medicine" : "Adjust Stock"}
      subtitle={item.name}
      icon={
        isRestock ? <PackagePlus size={14} /> : <Package size={14} />
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
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting && <LoaderCircle size={14} className="animate-spin" />}
            {submitting
              ? "Saving..."
              : isRestock
                ? "Add Stock"
                : "Apply Adjustment"}
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
              Current Quantity
            </p>
            <p className="mt-1 text-base font-semibold text-[#0F172A]">
              {Number(item.quantity || 0).toLocaleString()} {item.unit || ""}
            </p>
          </div>

          {!isRestock && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Action" required>
                <select
                  value={form.action}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      action: event.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  {ACTIONS.map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </select>
              </Field>

              {form.action === "correction" && (
                <Field label="Direction" required>
                  <select
                    value={form.direction}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        direction: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="in">Increase</option>
                    <option value="out">Decrease</option>
                  </select>
                </Field>
              )}
            </div>
          )}

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

          <Field label="Reason / Reference" required>
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
              placeholder="Enter the stock movement reason"
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
