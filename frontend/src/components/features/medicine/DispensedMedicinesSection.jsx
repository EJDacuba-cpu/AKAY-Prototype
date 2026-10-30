import MedicineAllocationFields from "./MedicineAllocationFields";
import { LedgerStamp } from "./MedicineInventoryTable";
import { allocationIntent, expiryGroups, groupLabel, validateManualAllocation } from "../../../utils/medicineExpiryGroups";
import { AlertCircle, LoaderCircle, Package, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMedicineQuantity } from "../../../services/medicineService";
import {
  EXPIRY_STATUS,
  STOCK_STATUS,
  expiryStatusTone,
  getMedicineExpiryStatus,
  getMedicineStockStatus,
  stockStatusTone,
} from "../../../utils/medicineInventoryStatus";

const EMPTY_DRAFT = {
  category: "",
  medicineId: "",
  quantity: "",
  remarks: "",
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasDraftValues(draft = {}) {
  return Boolean(
    draft.category ||
      draft.medicineId ||
      draft.quantity ||
      String(draft.remarks || "").trim(),
  );
}

function fieldClass(invalid) {
  return `h-10 w-full rounded-lg border bg-white px-3.5 text-sm text-ink-800 outline-none transition placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 ${
    invalid
      ? "border-alert-700 ring-2 ring-alert-700/15"
      : "border-neutral-200 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10"
  }`;
}

function itemNotice(item, inventoryItem) {
  if (!inventoryItem) {
    return { message: `${item.medicineName || "This item"} is no longer in inventory.`, critical: true };
  }
  const expiryStatus = getMedicineExpiryStatus(inventoryItem);
  const stockStatus = getMedicineStockStatus(inventoryItem);
  if (expiryStatus === EXPIRY_STATUS.EXPIRED) {
    return { message: "No dated stock is available. Confirming this records a shortage.", critical: true };
  }
  if (stockStatus === STOCK_STATUS.OUT_OF_STOCK) {
    return { message: "This item is now out of stock.", critical: true };
  }
  if (expiryStatus === EXPIRY_STATUS.EXPIRES_TODAY) {
    return { message: "This stock expires today.", critical: true };
  }
  if (expiryStatus === EXPIRY_STATUS.NOT_RECORDED) {
    return { message: "No expiry date is recorded.", critical: false };
  }
  if (toNumber(item.quantity) > toNumber(inventoryItem.stockSummary?.available ?? 0)) {
    return { message: "Quantity is more than available stock.", critical: true };
  }
  return null;
}

function allocationSummary(item, inventoryItem) {
  if (!Array.isArray(item.allocations)) return "Earliest expiry first";
  if (!item.allocations.length) return "Shortage — not taken from recorded stock";
  const groups = expiryGroups(inventoryItem);
  return item.allocations
    .map((allocation) => {
      const group = groups.find((entry) => Number(entry.id) === Number(allocation.expiry_group_id));
      return `${group ? groupLabel(group) : "Stock group"} · ${allocation.quantity}`;
    })
    .join("; ");
}

export default function DispensedMedicinesSection({
  inventory = [],
  value = [],
  onChange,
  disabled = false,
  loading = false,
  error = "",
  onRetry,
  serviceHint = "",
  facilityLabel = "BHC",
  pendingDraftError = "",
  onPendingDraftChange,
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [fieldError, setFieldError] = useState({ field: "", message: "" });
  const availableInventory = useMemo(
    () => inventory.filter((item) => item?.id && item?.name),
    [inventory],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          availableInventory
            .map((item) => item.category || "Uncategorized")
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [availableInventory],
  );
  const filteredInventory = useMemo(
    () =>
      availableInventory.filter(
        (item) => (item.category || "Uncategorized") === draft.category,
      ),
    [availableInventory, draft.category],
  );
  const inventoryById = useMemo(
    () => new Map(availableInventory.map((item) => [String(item.id), item])),
    [availableInventory],
  );
  const selectedMedicine = inventoryById.get(String(draft.medicineId));
  const selectedStockStatus = getMedicineStockStatus(selectedMedicine || {});
  const selectedExpiryStatus = selectedMedicine
    ? getMedicineExpiryStatus(selectedMedicine)
    : EXPIRY_STATUS.NOT_RECORDED;
  const allocationError = fieldError.field === "allocations" || fieldError.field === "reason";

  useEffect(
    () => () => onPendingDraftChange?.(false),
    [onPendingDraftChange],
  );

  function updateDraft(key, nextValue) {
    setFieldError({ field: "", message: "" });
    const nextDraft =
      key === "category"
        ? { ...draft, category: nextValue, medicineId: "" }
        : { ...draft, [key]: nextValue };
    if (key === "medicineId" || key === "category") {
      delete nextDraft.allocations;
      delete nextDraft.override_reason;
    }
    setDraft(nextDraft);
    onPendingDraftChange?.(hasDraftValues(nextDraft));
  }

  function addMedicine() {
    const medicine = inventoryById.get(String(draft.medicineId));
    const quantity = toNumber(draft.quantity);

    if (!draft.category) {
      setFieldError({ field: "category", message: "Select a category." });
      return;
    }
    if (!medicine) {
      setFieldError({ field: "medicineId", message: "Select a medicine or supply." });
      return;
    }
    if (quantity <= 0) {
      setFieldError({ field: "quantity", message: "Enter a quantity greater than 0." });
      return;
    }
    if (!Number.isInteger(quantity)) {
      setFieldError({ field: "quantity", message: "Enter a whole stock-unit quantity." });
      return;
    }
    if (Array.isArray(draft.allocations)) {
      const issue = validateManualAllocation(medicine, quantity, draft.allocations, draft.override_reason);
      if (issue) {
        setFieldError({
          field: /reason|explain why/i.test(issue) ? "reason" : "allocations",
          message: issue,
        });
        return;
      }
    }

    const existingItem = value.find(
      (item) => String(item.medicineId) === String(medicine.id),
    );
    if (existingItem && (Array.isArray(existingItem.allocations) || Array.isArray(draft.allocations))) {
      setFieldError({ field: "medicineId", message: "Remove the existing entry before changing a manual allocation for this item." });
      return;
    }
    const nextQuantity = quantity + toNumber(existingItem?.quantity);

    const nextItem = {
      medicineId: String(medicine.id),
      confirmedGiven: true,
      ...allocationIntent(draft),
      medicineName: medicine.name,
      category: medicine.category || "Uncategorized",
      availableStock: medicine.stockSummary?.available ?? 0,
      quantity: nextQuantity,
      unit: medicine.unit || "",
      remarks: [existingItem?.remarks, draft.remarks.trim()]
        .filter(Boolean)
        .join("; "),
    };

    onChange?.(
      existingItem
        ? value.map((item) =>
            String(item.medicineId) === String(medicine.id) ? nextItem : item,
          )
        : [...value, nextItem],
    );
    setDraft(EMPTY_DRAFT);
    onPendingDraftChange?.(false);
  }

  function removeMedicine(medicineId) {
    onChange?.(value.filter((item) => String(item.medicineId) !== String(medicineId)));
  }

  if (loading && availableInventory.length === 0) {
    return (
      <div data-dispensed-medicines-section className="flex items-center gap-2 text-sm text-neutral-600">
        <LoaderCircle size={16} className="animate-spin" />
        Loading {facilityLabel} inventory…
      </div>
    );
  }

  if (error && availableInventory.length === 0) {
    return (
      <div data-dispensed-medicines-section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 text-sm text-alert-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Unable to load {facilityLabel} inventory.</p>
            <p className="mt-0.5 text-xs text-neutral-600">Check your connection and try again.</p>
          </div>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-xs font-medium text-ink-800 hover:bg-neutral-50"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!loading && availableInventory.length === 0) {
    return (
      <p data-dispensed-medicines-section className="text-sm text-neutral-600">
        No medicines or supplies registered in {facilityLabel} inventory.
      </p>
    );
  }

  return (
    <div data-dispensed-medicines-section className="space-y-4">
      <p className="text-xs leading-relaxed text-neutral-600">
        Select an item and quantity, then click Confirm Dispensed/Given. Only items in the list below are saved and deducted from {facilityLabel} inventory with this visit.
      </p>
      {serviceHint && (
        <p className="text-xs leading-relaxed text-neutral-600">{serviceHint}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Category
          </label>
          <select
            value={draft.category}
            onChange={(event) => updateDraft("category", event.target.value)}
            disabled={disabled}
            aria-invalid={fieldError.field === "category" || undefined}
            className={fieldClass(fieldError.field === "category")}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {fieldError.field === "category" && (
            <p role="alert" className="mt-1 text-xs font-medium text-alert-700">{fieldError.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Medicine / Supply
          </label>
          <select
            value={draft.medicineId}
            onChange={(event) => updateDraft("medicineId", event.target.value)}
            disabled={disabled || !draft.category}
            aria-invalid={fieldError.field === "medicineId" || undefined}
            className={fieldClass(fieldError.field === "medicineId")}
          >
            <option value="">
              {draft.category ? "Select medicine or supply" : "Select category first"}
            </option>
            {filteredInventory.map((item) => {
              const stockStatus = getMedicineStockStatus(item);
              const expiryStatus = getMedicineExpiryStatus(item);
              const notes = [
                stockStatus !== STOCK_STATUS.IN_STOCK ? stockStatus : null,
                expiryStatus !== EXPIRY_STATUS.VALID ? expiryStatus : null,
              ].filter(Boolean);
              return (
                <option key={item.id} value={item.id}>
                  {item.name} - {formatMedicineQuantity(item)}
                  {notes.length ? ` - ${notes.join(", ")}` : ""}
                </option>
              );
            })}
          </select>
          {fieldError.field === "medicineId" && (
            <p role="alert" className="mt-1 text-xs font-medium text-alert-700">{fieldError.message}</p>
          )}
          {draft.category && filteredInventory.length === 0 && (
            <p className="mt-1 text-xs text-neutral-600">No items found under this category.</p>
          )}
        </div>
      </div>

      {selectedMedicine && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
          <span>
            Recorded stock:{" "}
            <strong className="font-semibold text-ink-800">
              {formatMedicineQuantity(selectedMedicine)}
            </strong>
          </span>
          <LedgerStamp label={selectedStockStatus} tone={stockStatusTone(selectedStockStatus)} appearance="plain" />
          <LedgerStamp label={selectedExpiryStatus} tone={expiryStatusTone(selectedExpiryStatus)} appearance="plain" />
          <span>
            Available to dispense:{" "}
            <strong className="font-semibold text-ink-800">
              {selectedMedicine.stockSummary?.available ?? 0} {selectedMedicine.unit}
            </strong>
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(110px,0.45fr)_minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Quantity
          </label>
          <input
            type="number"
            min="1"
            value={draft.quantity}
            onChange={(event) => updateDraft("quantity", event.target.value)}
            disabled={disabled}
            aria-invalid={fieldError.field === "quantity" || undefined}
            className={fieldClass(fieldError.field === "quantity")}
          />
          {fieldError.field === "quantity" && (
            <p role="alert" className="mt-1 text-xs font-medium text-alert-700">{fieldError.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Remarks
          </label>
          <input
            type="text"
            value={draft.remarks}
            onChange={(event) => updateDraft("remarks", event.target.value)}
            disabled={disabled}
            placeholder="Given during visit, provided after consultation..."
            className={fieldClass(false)}
          />
        </div>

        <button
          type="button"
          onClick={addMedicine}
          disabled={disabled}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-brand-600 px-4 text-xs font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Package size={14} />
          Confirm Dispensed/Given
        </button>
      </div>

      {selectedMedicine && (
        <MedicineAllocationFields
          medicine={selectedMedicine}
          quantity={draft.quantity}
          value={draft}
          disabled={disabled}
          error={allocationError ? fieldError.message : ""}
          onChange={(next) => {
            setDraft(next);
            setFieldError({ field: "", message: "" });
            onPendingDraftChange?.(true);
          }}
        />
      )}
      {!allocationError && fieldError.message && !["category", "medicineId", "quantity"].includes(fieldError.field) && (
        <p role="alert" className="text-xs font-medium text-alert-700">{fieldError.message}</p>
      )}
      {pendingDraftError && (
        <p role="alert" className="text-xs font-medium text-alert-700">{pendingDraftError}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="hidden grid-cols-[minmax(160px,1.35fr)_minmax(140px,1fr)_90px_80px_120px_minmax(140px,1fr)_80px] border-b border-neutral-200 bg-neutral-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-600 xl:grid">
          <span>Medicine / Supply</span>
          <span>Category</span>
          <span>Quantity</span>
          <span>Unit</span>
          <span>Available Stock</span>
          <span>Remarks</span>
          <span>Action</span>
        </div>

        {value.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-600">
            No medicines or supplies added.
          </p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {value.map((item) => {
              const inventoryItem = inventoryById.get(String(item.medicineId));
              const notice = itemNotice(item, inventoryItem);
              return (
                <div
                  key={item.medicineId}
                  className="grid gap-2 px-3 py-3 text-sm xl:grid-cols-[minmax(160px,1.35fr)_minmax(140px,1fr)_90px_80px_120px_minmax(140px,1fr)_80px] xl:items-start"
                >
                  <div>
                    <p className="font-semibold text-ink-800">{item.medicineName}</p>
                    {notice && (
                      <p className={`mt-1 text-xs ${notice.critical ? "font-medium text-alert-700" : "text-neutral-600"}`}>
                        {notice.message}
                      </p>
                    )}
                  </div>
                  <p className="text-neutral-600">{item.category || "—"}</p>
                  <p className="tabular-nums text-ink-800">{item.quantity}</p>
                  <p className="text-neutral-600">{item.unit || "—"}</p>
                  <p className="tabular-nums text-neutral-600">
                    {toNumber(item.availableStock).toLocaleString()} available
                  </p>
                  <div className="text-xs text-neutral-600">
                    <p>{item.remarks || "—"}</p>
                    <p>{allocationSummary(item, inventoryItem)}</p>
                    {item.override_reason && <p>{item.override_reason}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMedicine(item.medicineId)}
                    disabled={disabled}
                    className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 text-xs font-medium text-neutral-600 transition hover:border-alert-200 hover:bg-alert-50 hover:text-alert-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
