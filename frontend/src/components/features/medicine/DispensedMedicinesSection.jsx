import { AlertCircle, LoaderCircle, Package, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatMedicineQuantity,
  getMedicineExpiryStatus,
} from "../../../services/medicineService";

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

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getItemStatus(item) {
  if (!item) return "Available";
  const expiryStatus = getMedicineExpiryStatus(item);
  if (expiryStatus === "Expired") return "Expired";
  if (
    toNumber(item.quantity) <= 0 ||
    normalizeText(item.status || item.availabilityStatus).includes("unavailable")
  ) {
    return "Out of stock";
  }
  if (
    expiryStatus === "Expiring Soon" ||
    normalizeText(item.status || item.availabilityStatus).includes("low")
  ) {
    return "Low stock";
  }
  return "Available";
}

function isBlocked(item) {
  const status = getItemStatus(item);
  return status === "Expired" || status === "Out of stock";
}

function getStatusClasses(status) {
  if (status === "Expired" || status === "Out of stock") {
    return "border-red-100 bg-red-50 text-[#B91C1C]";
  }
  if (status === "Low stock") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }
  return "border-emerald-100 bg-emerald-50 text-emerald-700";
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
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [validationError, setValidationError] = useState("");
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
  const selectedStatus = getItemStatus(selectedMedicine);
  const draftWarnings = useMemo(
    () =>
      value
        .map((item) => {
          const inventoryItem = inventoryById.get(String(item.medicineId));
          if (!inventoryItem) {
            return `${item.medicineName || "Medicine"} is no longer listed in inventory.`;
          }
          const status = getItemStatus(inventoryItem);
          if (status === "Expired") {
            return `${item.medicineName || inventoryItem.name} is now expired.`;
          }
          if (status === "Out of stock") {
            return `${item.medicineName || inventoryItem.name} is now out of stock.`;
          }
          if (toNumber(item.quantity) > toNumber(inventoryItem.quantity)) {
            return `${item.medicineName || inventoryItem.name} exceeds current available stock.`;
          }
          return "";
        })
        .filter(Boolean),
    [inventoryById, value],
  );

  function updateDraft(key, nextValue) {
    setValidationError("");
    setDraft((current) => {
      if (key === "category") {
        return { ...current, category: nextValue, medicineId: "" };
      }
      return { ...current, [key]: nextValue };
    });
  }

  function addMedicine() {
    const medicine = inventoryById.get(String(draft.medicineId));
    const quantity = toNumber(draft.quantity);

    if (!draft.category) {
      setValidationError("Please select a category.");
      return;
    }
    if (!medicine) {
      setValidationError("Please select a medicine or supply.");
      return;
    }
    if (quantity <= 0) {
      setValidationError("Quantity must be greater than 0.");
      return;
    }
    if (getItemStatus(medicine) === "Expired") {
      setValidationError("This medicine is expired and cannot be dispensed.");
      return;
    }
    if (getItemStatus(medicine) === "Out of stock") {
      setValidationError("This medicine is out of stock.");
      return;
    }

    const existingItem = value.find(
      (item) => String(item.medicineId) === String(medicine.id),
    );
    const nextQuantity = quantity + toNumber(existingItem?.quantity);

    if (nextQuantity > toNumber(medicine.quantity)) {
      setValidationError("Quantity exceeds available stock.");
      return;
    }

    const nextItem = {
      medicineId: String(medicine.id),
      medicineName: medicine.name,
      category: medicine.category || "Uncategorized",
      availableStock: medicine.quantity,
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
  }

  function removeMedicine(medicineId) {
    onChange?.(value.filter((item) => String(item.medicineId) !== String(medicineId)));
  }

  if (loading && availableInventory.length === 0) {
    return (
      <div
        data-dispensed-medicines-section
        className="rounded-xl border border-[#E8ECF0] bg-white p-4"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[#64748B]">
          <LoaderCircle size={16} className="animate-spin" />
          Loading BHC inventory...
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="h-10 rounded-lg bg-slate-100" />
          <div className="h-10 rounded-lg bg-slate-100" />
          <div className="h-10 rounded-lg bg-slate-100" />
          <div className="h-10 rounded-lg bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error && availableInventory.length === 0) {
    return (
      <div
        data-dispensed-medicines-section
        className="rounded-xl border border-red-100 bg-red-50 p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#B91C1C]" />
            <div>
              <p className="text-sm font-bold text-[#0F172A]">
                Unable to load BHC inventory.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
                Please check your connection and try again.
              </p>
            </div>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-100 bg-white px-3 text-xs font-semibold text-[#B91C1C] transition hover:bg-red-50"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!loading && availableInventory.length === 0) {
    return (
      <div
        data-dispensed-medicines-section
        className="rounded-xl border border-[#E8ECF0] bg-white px-4 py-6 text-center text-sm text-[#64748B]"
      >
        No medicines or supplies registered in BHC inventory.
      </div>
    );
  }

  return (
    <div data-dispensed-medicines-section className="space-y-4">
      <div className="rounded-xl border border-[#E8ECF0] bg-white p-4">
        <div>
          <p className="text-xs leading-relaxed text-[#64748B]">
            Optional medicines or supplies given during this visit. Items listed
            here will be deducted from BHC inventory only after saving this
            health record.
          </p>
          {serviceHint && (
            <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-700">
              {serviceHint}
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Category
            </label>
            <select
              value={draft.category}
              onChange={(event) => updateDraft("category", event.target.value)}
              disabled={disabled}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Medicine / Supply
            </label>
            <select
              value={draft.medicineId}
              onChange={(event) => updateDraft("medicineId", event.target.value)}
              disabled={disabled || !draft.category}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {draft.category ? "Select medicine or supply" : "Select category first"}
              </option>
              {filteredInventory.map((item) => {
                const status = getItemStatus(item);
                return (
                  <option key={item.id} value={item.id} disabled={isBlocked(item)}>
                    {item.name} - {formatMedicineQuantity(item)}
                    {status !== "Available" ? ` - ${status}` : ""}
                  </option>
                );
              })}
            </select>
            {draft.category && filteredInventory.length === 0 && (
              <p className="mt-1 text-[11px] font-medium text-[#64748B]">
                No items found under this category.
              </p>
            )}
          </div>
        </div>

        {selectedMedicine && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#64748B]">
            <span>
              Available Stock:{" "}
              <strong className="text-[#0F172A]">
                {formatMedicineQuantity(selectedMedicine)}
              </strong>
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 font-semibold ${getStatusClasses(
                selectedStatus,
              )}`}
            >
              {selectedStatus}
            </span>
            {selectedMedicine.expiryDate && (
              <span>
                Expiry Date:{" "}
                <strong className="text-[#0F172A]">
                  {formatDate(selectedMedicine.expiryDate)}
                </strong>
              </span>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(110px,0.45fr)_minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Quantity
            </label>
            <input
              type="number"
              min="1"
              value={draft.quantity}
              onChange={(event) => updateDraft("quantity", event.target.value)}
              disabled={disabled}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Remarks
            </label>
            <input
              type="text"
              value={draft.remarks}
              onChange={(event) => updateDraft("remarks", event.target.value)}
              disabled={disabled}
              placeholder="Given during visit, provided after consultation..."
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <button
            type="button"
            onClick={addMedicine}
            disabled={disabled}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-xs font-semibold text-white transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Package size={14} />
            Add Medicine
          </button>
        </div>

        {validationError && (
          <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-[#B91C1C]">
            {validationError}
          </p>
        )}

        {draftWarnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <p className="font-bold">
              Some medicines in this draft may no longer be available. Please
              review before submitting.
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {draftWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="hidden grid-cols-[minmax(160px,1.35fr)_minmax(140px,1fr)_90px_80px_120px_minmax(140px,1fr)_80px] border-b border-[#EEF2F6] bg-[#F8FAFC] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#64748B] xl:grid">
          <span>Medicine / Supply</span>
          <span>Category</span>
          <span>Quantity</span>
          <span>Unit</span>
          <span>Available Stock</span>
          <span>Remarks</span>
          <span>Action</span>
        </div>

        {value.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[#64748B]">
            No medicines or supplies added.
          </div>
        ) : (
          <div className="divide-y divide-[#EEF2F6]">
            {value.map((item) => (
              <div
                key={item.medicineId}
                className="grid gap-2 px-3 py-3 text-sm xl:grid-cols-[minmax(160px,1.35fr)_minmax(140px,1fr)_90px_80px_120px_minmax(140px,1fr)_80px] xl:items-center"
              >
                <p className="font-semibold text-[#0F172A]">
                  {item.medicineName}
                </p>
                <p className="text-[#64748B]">{item.category || "-"}</p>
                <p className="text-[#475569]">{item.quantity}</p>
                <p className="text-[#475569]">{item.unit || "-"}</p>
                <p className="text-[#475569]">
                  {toNumber(item.availableStock).toLocaleString()} available
                </p>
                <p className="text-[#64748B]">{item.remarks || "-"}</p>
                <button
                  type="button"
                  onClick={() => removeMedicine(item.medicineId)}
                  disabled={disabled}
                  className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-[#E8ECF0] px-2.5 text-xs font-semibold text-[#64748B] transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={13} />
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
