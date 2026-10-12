import { formatDisplayValue } from "../../../utils/formatters";

const STYLES = {
  Active: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
  Inactive: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
};

/** Active / Inactive pill, shared by the Users table and Account details. */
export default function AccountStatusBadge({ status }) {
  const displayStatus = formatDisplayValue(status, "Active");

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        STYLES[displayStatus] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {displayStatus}
    </span>
  );
}
