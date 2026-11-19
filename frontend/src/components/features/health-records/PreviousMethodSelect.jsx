import { getPreviousMethodOptions } from "../../../utils/familyPlanning";

export default function PreviousMethodSelect({ patient, value = "", hasLinkedDefault, onChange }) {
  const options = getPreviousMethodOptions(patient);
  return (
    <label className="block text-xs">
      <span className="mb-1.5 block font-semibold uppercase tracking-wide text-[#374151]">Previous Method</span>
      <select
        name="familyPlanningPreviousMethod"
        className="h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled={hasLinkedDefault}>Select previous method...</option>
        {value && !options.includes(value) && (
          <option value={value} disabled>{value} (previously saved)</option>
        )}
        {options.map((method) => <option key={method}>{method}</option>)}
      </select>
    </label>
  );
}
