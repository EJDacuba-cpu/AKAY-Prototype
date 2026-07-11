import { Package, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMedicineQuantity } from "../../../services/medicineService";

const EMPTY_DRAFT = {
  medicineId: "",
  quantity: "",
  remarks: "",
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isUnavailable(item) {
  return (
    toNumber(item?.quantity) <= 0 ||
    String(item?.status || item?.availabilityStatus || "")
      .toLowerCase()
      .includes("unavailable")
  );
}

export default function DispensedMedicinesSection({
  inventory = [],
  value = [],
  onChange,
  disabled = false,
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const inventoryById = useMemo(
    () => new Map(inventory.map((item) => [String(item.id), item])),
    [inventory],
  );
  const selectedMedicine = inventoryById.get(String(draft.medicineId));

  function updateDraft(key, nextValue) {
    setError("");
    setDraft((current) => ({ ...current, [key]: nextValue }));
  }

  function addMedicine() {
    const medicine = inventoryById.get(String(draft.medicineId));
    const quantity = toNumber(draft.quantity);

    if (!medicine) {
      setError("Please select a medicine.");
      return;
    }
    if (isUnavailable(medicine)) {
      setError("This medicine is out of stock.");
      return;
    }
    if (quantity <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }
    if (quantity > toNumber(medicine.quantity)) {
      setError("Quantity cannot exceed available stock.");
      return;
    }
    if (value.some((item) => String(item.medicineId) === String(medicine.id))) {
      setError("This medicine is already added. Remove it first to change the quantity.");
      return;
    }

    onChange?.([
      ...value,
      {
        medicineId: String(medicine.id),
        medicineName: medicine.name,
        category: medicine.category,
        availableStock: medicine.quantity,
        quantity,
        unit: medicine.unit || "",
        remarks: draft.remarks.trim(),
      },
    ]);
    setDraft(EMPTY_DRAFT);
  }

  function removeMedicine(medicineId) {
    onChange?.(value.filter((item) => String(item.medicineId) !== String(medicineId)));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E8ECF0] bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(110px,0.6fr)_minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Select Medicine / Supply
            </label>
            <select
              value={draft.medicineId}
              onChange={(event) => updateDraft("medicineId", event.target.value)}
              disabled={disabled}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Choose from BHC Inventory</option>
              {inventory.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={isUnavailable(item)}
                >
                  {item.name} - {item.category || "Uncategorized"} -{" "}
                  {formatMedicineQuantity(item)} - {item.status}
                </option>
              ))}
            </select>
            {selectedMedicine && (
              <p className="mt-1 text-[11px] text-[#64748B]">
                Available stock:{" "}
                <span className="font-semibold text-[#0F172A]">
                  {formatMedicineQuantity(selectedMedicine)}
                </span>
              </p>
            )}
          </div>

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
              placeholder="Optional"
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

        {error && (
          <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-[#B91C1C]">
            {error}
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">
          Medicines listed here will be deducted from BHC inventory after saving
          this health record.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="hidden grid-cols-[minmax(180px,1.5fr)_100px_100px_minmax(160px,1fr)_80px] border-b border-[#EEF2F6] bg-[#F8FAFC] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#64748B] md:grid">
          <span>Medicine / Supply</span>
          <span>Quantity</span>
          <span>Unit</span>
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
                className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(180px,1.5fr)_100px_100px_minmax(160px,1fr)_80px] md:items-center"
              >
                <div>
                  <p className="font-semibold text-[#0F172A]">
                    {item.medicineName}
                  </p>
                  <p className="text-[11px] text-[#94A3B8]">{item.category}</p>
                </div>
                <p className="text-[#475569]">{item.quantity}</p>
                <p className="text-[#475569]">{item.unit || "-"}</p>
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
