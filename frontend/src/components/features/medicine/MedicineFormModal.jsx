import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, PackagePlus } from "lucide-react";
import { Input } from "../../ui/input";
import {
  ModalButton,
  ModalShell,
} from "../../common";
import { DatePickerField } from "../../common/forms/DatePickerField";
import { Button } from "../../ui/button";
import {
  computeMedicineStatus,
  MEDICINE_CATEGORIES,
  MEDICINE_UNITS,
} from "../../../services/medicineService";
import { createIdempotencyKey } from "../../../utils/idempotency";
import { formatStockQuantity } from "../../../utils/medicineInventoryPreview";
import {
  medicineFormHasErrors,
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
  itemType: "medicine",
  expiryNotApplicable: false,
  manufacturerLotNumber: "",
  notes: "",
};

export default function MedicineFormModal({
  open,
  mode = "add",
  item = null,
  title,
  role = "bhc",
  onClose,
  onSubmit,
  onViewExisting,
  onRestockExisting,
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const formId = useId();
  const gateRef = useRef(null);
  if (gateRef.current == null) gateRef.current = createSubmitGate();

  useEffect(() => {
    if (!open) return;

    gateRef.current.end();
    setSubmitting(false);
    setError("");
    setDuplicate(null);
    setFieldErrors({});
    setIdempotencyKey(createIdempotencyKey());

    if (item) {
      setForm({
        name: item.name || "",
        category: item.category || "Basic Medicines",
        quantity: String(item.quantity ?? ""),
        unit: item.unit || "pcs",
        lowStockThreshold: String(item.lowStockThreshold ?? 10),
        expiryDate: "",
        itemType: item.itemType || "medicine",
        expiryNotApplicable: false,
        manufacturerLotNumber: "",
        notes: item.notes || "",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [open, item, mode]);

  if (!open) return null;

  const previewStatus = computeMedicineStatus(
    form.quantity,
    form.lowStockThreshold,
  );

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

    const nextErrors = validateMedicineForm(form, mode);
    if (medicineFormHasErrors(nextErrors)) {
      setFieldErrors(nextErrors);
      gateRef.current.end();
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      lowStockThreshold: parseInt(form.lowStockThreshold, 10) || 0,
      notes: form.notes.trim(),
    };
    if (mode === "add") {
      payload.itemType = form.itemType;
      payload.expiryDate = form.expiryDate;
      payload.expiryNotApplicable = form.expiryNotApplicable;
      payload.manufacturerLotNumber = form.manufacturerLotNumber.trim();
      payload.quantity = parseInt(form.quantity, 10) || 0;
    }

    try {
      setSubmitting(true);
      setError("");
      setDuplicate(null);
      await onSubmit?.(payload, {
        idempotencyKey: mode === "add" ? idempotencyKey : undefined,
      });
    } catch (submitError) {
      if (submitError?.code === "MEDICINE_DUPLICATE_CATALOG") {
        setDuplicate(submitError.payload?.data || null);
        setError(submitError.message || "This item already exists in your inventory.");
      } else {
        setError(submitError?.message || "Unable to save this medicine.");
      }
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
          ? "Edit item details. Use Restock or Deduct Stock to record stock changes."
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
            disabled={submitting}
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

            {mode === "add" && <>
              <Field label="Item Type">
                <select aria-label="Item Type" value={form.itemType} className={inputClass} disabled={submitting}
                  onChange={e => setForm(current => ({ ...current, itemType: e.target.value, expiryNotApplicable: false }))}>
                  <option value="medicine">Medicine</option><option value="health_supply">Health supply</option>
                </select>
              </Field>
              <Field label="Manufacturer Lot Number" className="md:col-span-2">
                <Input
                  value={form.manufacturerLotNumber}
                  maxLength={120}
                  disabled={submitting}
                  placeholder="Optional"
                  onChange={(event) => updateField("manufacturerLotNumber", event.target.value)}
                />
                <p className="mt-1 text-xs text-neutral-600">Opening stock creates a new stock batch. Batch ID is assigned after save.</p>
              </Field>
              <DatePickerField
                label="Opening Stock Expiry"
                name="expiryDate"
                value={form.expiryDate}
                required={!form.expiryNotApplicable}
                disabled={submitting || form.expiryNotApplicable}
                error={fieldErrors.expiryDate}
                allowClear
                onChange={(value) => updateField("expiryDate", value)}
              />
              {form.itemType === "health_supply" && (
                <label className="flex items-start gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={form.expiryNotApplicable}
                    disabled={submitting}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        expiryNotApplicable: e.target.checked,
                        expiryDate: "",
                      }))
                    }
                  />
                  Not Applicable — this supply has no manufacturer-defined expiry.
                </label>
              )}
            </>}
            {mode === "edit" && <p className="text-xs text-neutral-600">Expiry dates belong to received stock batches. View them in Medicine Details.</p>}

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
                htmlFor={`${formId}-recorded-stock`}
              >
                <Input
                  id={`${formId}-recorded-stock`}
                  type="text"
                  value={formatStockQuantity(item?.quantity ?? 0, item?.unit)}
                  readOnly
                  className="h-10 rounded-lg border-neutral-200 bg-neutral-100 text-sm text-ink-800 shadow-none focus-visible:border-ink-400 focus-visible:ring-ink-400/30"
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

            {mode === "add" && (
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Computed Status
                </p>
                <p className="mt-1 text-sm font-semibold text-[#B91C1C]">
                  {previewStatus}
                </p>
              </div>
            )}

            {mode === "edit" && item?.reconciliationRequired && (
              <p role="status" className="md:col-span-2 text-xs leading-relaxed text-ink-800">
                <span className="font-semibold">Reconciliation required.</span> A dispensing shortage is still recorded. Saving item details will not clear it.
              </p>
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
              <div role="alert" className="md:col-span-2 space-y-2 rounded-lg bg-alert-50 p-3 text-xs text-alert-700">
                <p className="font-medium">{error}</p>
                {duplicate && (
                  <div className="space-y-2 text-ink-800">
                    <p>
                      Existing item <span className="font-semibold tabular-nums">#{duplicate.id}</span>
                      {duplicate.is_active === false ? " · Archived / inactive" : " · Active"}
                      {duplicate.unit ? ` · ${duplicate.unit}` : ""}
                    </p>
                    {duplicate.is_active === false ? (
                      <p className="text-neutral-600">
                        Restock is unavailable while this catalog item is inactive. Open details to review status; do not create a duplicate.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        onClick={() => {
                          onClose?.();
                          onViewExisting?.(duplicate.id, { role, active: duplicate.is_active !== false });
                        }}
                      >
                        View Details
                      </Button>
                      {duplicate.is_active !== false && (
                        <Button
                          type="button"
                          variant="brand"
                          size="compact"
                          onClick={() => {
                            onClose?.();
                            onRestockExisting?.(duplicate.id);
                          }}
                        >
                          Restock Existing Item
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
      </form>
    </ModalShell>
  );
}

function Field({ label, htmlFor, required = false, className = "", error, children }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="ml-0.5 text-[#B91C1C]">*</span>}
      </label>
      {children}
      {(error || required) && (
        <p
          role={error ? "alert" : undefined}
          className="mt-1 min-h-4 text-xs leading-4 text-alert-700"
        >
          {error || ""}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-ink-800 outline-none transition placeholder:text-neutral-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-alert-700 aria-invalid:ring-2 aria-invalid:ring-alert-700/15";
