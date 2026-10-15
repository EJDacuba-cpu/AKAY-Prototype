import { useId, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "../../ui/input";
import Select from "../../common/atoms/Select";
import { addressText, patientName } from "../../../services/mockFamilyRegistry";

export function FamilyField({ label, error, children, required, id }) {
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium text-neutral-900">{label}{required && <span className="ml-1 text-red-700">*</span>}</label>
    {children}
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

export function FamilySelect({ label, error, options, required = true, ...props }) {
  const id = useId();
  return <FamilyField label={label} error={error} id={id} required={required}>
    <Select {...props} id={id} required={required} options={options} placeholder="Select"
      aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
      className="h-11 !rounded-md !bg-white shadow-none" />
  </FamilyField>;
}

export function PatientPicker({ patients, selectedId, onSelect, error, label = "Find registered patient", describe, emptyText = "No matching unlinked patients." }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const results = patients.filter(patient => `${patientName(patient)} ${patient.id} ${addressText(patient)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = patients.find(patient => patient.id === selectedId);
  return <FamilyField label={label} id={id} required error={error}>
    <div className="relative">
      <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-neutral-500" />
      <Input id={id} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search patient name or address" className="pl-10 shadow-none"
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />
    </div>
    {selected && <p className="flex items-center gap-2 text-sm"><Check size={16} aria-hidden="true" />Selected: {patientName(selected)}</p>}
    <div className="max-h-64 overflow-y-auto divide-y divide-neutral-200 border-y border-neutral-200" role="group" aria-label={label}>
      {results.map(patient => {
        const { disabled = false, note = "" } = describe?.(patient) || {};
        return <label key={patient.id} className={`flex items-start gap-3 px-2 py-3 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-neutral-50"}`}>
          <input type="radio" name={id} value={patient.id} checked={selectedId === patient.id} disabled={disabled} onChange={() => onSelect(patient.id)} className="mt-1 accent-red-700" />
          <span className="min-w-0 text-sm"><span className="block font-medium">{patientName(patient)}</span><span className="mt-1 block text-xs text-neutral-500">{patient.birthDate || "Date of birth not recorded"} · {addressText(patient)}</span>{note && <span className="mt-1 block text-xs text-neutral-500">{note}</span>}</span>
        </label>;
      })}
      {!results.length && <p className="py-6 text-sm text-neutral-500" role="status">{emptyText}</p>}
    </div>
  </FamilyField>;
}
