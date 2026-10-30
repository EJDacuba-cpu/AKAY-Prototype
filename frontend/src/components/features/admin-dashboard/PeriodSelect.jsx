import { PERIOD_OPTIONS } from "../../../utils/adminDashboard";

export default function PeriodSelect({ value, onChange }) {
  return (
    <div>
      <label htmlFor="admin-dashboard-period" className="sr-only">
        Period
      </label>
      <select
        id="admin-dashboard-period"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-[#E8ECF0] bg-white px-3 py-2 text-sm font-semibold text-[#0F172A] shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
      >
        {PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
