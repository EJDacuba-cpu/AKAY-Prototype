import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  computeMedicineStatus,
  MEDICINE_CATEGORIES,
  MEDICINE_UNITS,
} from "../../../services/medicineService";

const DEFAULT_FORM = {
  name: "",
  category: "Basic Medicines",
  quantity: "",
  unit: "pcs",
  lowStockThreshold: "10",
  expiryDate: "",
  notes: "",
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

  useEffect(() => {
    if (!open) return;

    if (item) {
      setForm({
        name: item.name || "",
        category: item.category || "Basic Medicines",
        quantity: String(item.quantity ?? ""),
        unit: item.unit || "pcs",
        lowStockThreshold: String(item.lowStockThreshold ?? 10),
        expiryDate: item.expiryDate || "",
        notes: item.notes || "",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [open, item]);

  if (!open) return null;

  const previewQuantity = mode === "edit" ? item?.quantity : form.quantity;
  const previewStatus = computeMedicineStatus(previewQuantity, form.lowStockThreshold);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      ...form,
      name: form.name.trim(),
      lowStockThreshold: parseInt(form.lowStockThreshold, 10) || 0,
      notes: form.notes.trim(),
    };
    if (mode === "add") {
      payload.quantity = parseInt(form.quantity, 10) || 0;
    } else {
      delete payload.quantity;
    }
    onSubmit?.(payload);
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xl shadow-black/10"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#F3F4F6] px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">
              {title || (mode === "edit" ? "Edit Medicine" : "Add Medicine")}
            </h2>
            <p className="mt-0.5 text-xs text-[#9CA3AF]">
              {mode === "edit"
                ? "Edit item details. Use Restock or Adjust Stock to change quantity."
                : "Opening balance sets the first ledgered stock quantity."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-red-50 hover:text-[#B91C1C]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Medicine / Supply Name" required className="md:col-span-2">
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="e.g. Paracetamol 500mg"
                className={inputClass}
                required
              />
            </Field>

            <Field label="Category">
              <select
                value={form.category}
                onChange={(event) =>
                  updateField("category", event.target.value)
                }
                className={inputClass}
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
              />
            </Field>

            {mode === "add" && (
              <Field label="Opening Balance" required>
                <input
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(event) =>
                    updateField("quantity", event.target.value)
                  }
                  placeholder="0"
                  className={inputClass}
                  required
                />
              </Field>
            )}

            <Field label="Unit">
              <select
                value={form.unit}
                onChange={(event) => updateField("unit", event.target.value)}
                className={inputClass}
              >
                {MEDICINE_UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </Field>

            <Field label="Low Stock Threshold" required>
              <input
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(event) =>
                  updateField("lowStockThreshold", event.target.value)
                }
                className={inputClass}
                required
              />
            </Field>

            <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                {mode === "edit" ? "Current Stock" : "Computed Status"}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#B91C1C]">
                {mode === "edit"
                  ? `${Number(item?.quantity || 0).toLocaleString()} ${item?.unit || ""}`
                  : previewStatus}
              </p>
            </div>

            <Field label="Notes" className="md:col-span-2">
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Optional coordination note..."
                rows={3}
                className={`${inputClass} min-h-21 resize-none py-2.5`}
              />
            </Field>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#F3F4F6] bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-4 text-xs font-semibold text-[#6B7280] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-9 rounded-lg bg-[#B91C1C] px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
          >
            {mode === "edit" ? "Save Changes" : "Add Medicine"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required = false, className = "", children }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="ml-0.5 text-[#B91C1C]">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#BCC3CD] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10";
