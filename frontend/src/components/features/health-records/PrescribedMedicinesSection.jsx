import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

const EMPTY_DRAFT = {
  category: "",
  medicineId: "",
  quantity: "",
  instructions: "",
};

export default function PrescribedMedicinesSection({
  catalog = [],
  value = [],
  onChange,
  disabled = false,
  loading = false,
  error = "",
  onRetry,
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [validationError, setValidationError] = useState("");
  const items = useMemo(
    () => (Array.isArray(catalog) ? catalog.filter((item) => item?.id && item?.name) : []),
    [catalog],
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.category || "Uncategorized").filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [items],
  );
  const filtered = useMemo(() => {
    const query = String(draft.medicineId && !draft.category ? "" : "").trim();
    return items.filter((item) => {
      const categoryMatch = !draft.category || (item.category || "Uncategorized") === draft.category;
      if (!categoryMatch) return false;
      if (!query) return true;
      return String(item.name).toLowerCase().includes(query.toLowerCase());
    });
  }, [items, draft.category]);
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((item) => String(item.name).toLowerCase().includes(q));
  }, [filtered, search]);
  const selected = items.find((item) => String(item.id) === String(draft.medicineId));

  function addLine() {
    if (disabled) return;
    if (!selected) {
      setValidationError("Select a medicine from the RHU catalog.");
      return;
    }
    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setValidationError("Enter a quantity of at least 1.");
      return;
    }
    setValidationError("");
    onChange?.([
      ...value,
      {
        medicineId: selected.id,
        medicineName: selected.name,
        name: selected.name,
        category: selected.category || draft.category || "",
        unit: selected.unit || "",
        quantity,
        instructions: String(draft.instructions || "").trim(),
      },
    ]);
    setDraft(EMPTY_DRAFT);
    setSearch("");
  }

  function removeLine(index) {
    if (disabled) return;
    onChange?.(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {loading && <p className="text-xs text-neutral-500">Loading the RHU medicine catalog…</p>}
      {error && (
        <p role="alert" className="text-xs text-[#B91C1C]">
          {error}{" "}
          {onRetry && (
            <button type="button" className="underline" onClick={onRetry}>
              Retry
            </button>
          )}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Category</span>
          <select
            value={draft.category}
            disabled={disabled}
            onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value, medicineId: "" }))}
            className="h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs sm:col-span-1 lg:col-span-2">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Search medicine</span>
          <input
            value={search}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Medicine name"
            className="h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Quantity</span>
          <input
            type="number"
            min="1"
            value={draft.quantity}
            disabled={disabled}
            onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))}
            className="h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm"
          />
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Medicine</span>
        <select
          value={draft.medicineId}
          disabled={disabled}
          onChange={(event) => setDraft((current) => ({ ...current, medicineId: event.target.value }))}
          className="h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm"
        >
          <option value="">Select a medicine</option>
          {visible.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.unit ? ` (${item.unit})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Instruction</span>
        <textarea
          rows={2}
          value={draft.instructions}
          disabled={disabled}
          onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
          placeholder="How the patient should take this medicine"
          className="w-full rounded-none border border-[#D1D5DB] bg-white px-3 py-2 text-sm"
        />
      </label>
      {validationError && <p className="text-xs font-medium text-[#DC2626]">{validationError}</p>}
      <button
        type="button"
        disabled={disabled}
        onClick={addLine}
        className="inline-flex items-center gap-1.5 rounded-none border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
      >
        <Plus size={14} />
        Add prescription
      </button>
      {value.length > 0 && (
        <ul className="divide-y divide-[#E5E7EB] border border-[#E5E7EB]">
          {value.map((line, index) => (
            <li key={`${line.medicineId}-${index}`} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#111827]">
                  {line.medicineName || line.name} · {line.quantity}
                  {line.unit ? ` ${line.unit}` : ""}
                </p>
                {line.instructions && <p className="mt-0.5 text-xs text-neutral-600">{line.instructions}</p>}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="flex h-8 w-8 items-center justify-center text-neutral-400 hover:text-[#B91C1C]"
                  aria-label="Remove prescription"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
