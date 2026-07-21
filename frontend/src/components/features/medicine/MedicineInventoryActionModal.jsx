import { useEffect, useState } from "react";
import { LoaderCircle, X } from "lucide-react";

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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        aria-label="Close inventory action"
        className="absolute inset-0 bg-black/35"
        onClick={submitting ? undefined : onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xl shadow-black/10"
      >
        <div className="flex items-start justify-between border-b border-[#F3F4F6] px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">
              {isRestock ? "Restock Medicine" : "Adjust Stock"}
            </h2>
            <p className="mt-1 text-xs text-[#6B7280]">{item.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-red-50 hover:text-[#B91C1C] disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
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

        <div className="flex items-center justify-end gap-2 border-t border-[#F3F4F6] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 rounded-lg border border-[#E5E7EB] px-4 text-xs font-semibold text-[#6B7280] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="flex h-9 min-w-28 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:bg-[#D1D5DB]"
          >
            {submitting && <LoaderCircle size={14} className="animate-spin" />}
            {submitting
              ? "Saving..."
              : isRestock
                ? "Add Stock"
                : "Apply Adjustment"}
          </button>
        </div>
      </form>
    </div>
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
