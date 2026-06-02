import { formatDisplayValue } from "../../../utils/formatters";

export default function PatientDetailItem({ label, value }) {
  const displayValue = formatDisplayValue(value, "Not recorded");

  return (
    <div>
      <p
        className="
          text-[10px]
          font-semibold
          uppercase
          tracking-widest
          text-[#9CA3AF]
        "
      >
        {label}
      </p>

      <p
        className="
          mt-1
          text-sm
          font-medium
          text-[#0F172A]
        "
      >
        {displayValue}
      </p>
    </div>
  );
}
