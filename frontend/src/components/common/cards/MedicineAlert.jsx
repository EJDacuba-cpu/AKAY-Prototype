import { Package } from "lucide-react";

export default function MedicineAlert({ name, status, qty }) {
  const danger = status === "Unavailable";

  return (
    <div
      className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 hover:shadow-sm"
      style={{
        borderColor: danger ? "#FECACA" : "#FDE68A",

        background: danger
          ? "linear-gradient(135deg, #FEF2F2 0%, #FFF 100%)"
          : "linear-gradient(135deg, #FFFBEB 0%, #FFF 100%)",
      }}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
        style={{
          backgroundColor: danger ? "#FEE2E2" : "#FEF3C7",

          color: danger ? "#DC2626" : "#D97706",
        }}
      >
        <Package size={14} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-[#1A1A1A]">
          {name}
        </p>

        <p className="text-[10px] text-[#9CA3AF]">{qty}</p>
      </div>

      <span
        className="flex-shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
        style={{
          backgroundColor: danger ? "#FEF2F2" : "#FFFBEB",
          borderColor: danger ? "#FECACA" : "#FDE68A",
          color: danger ? "#B91C1C" : "#B45309",
        }}
      >
        {status}
      </span>
    </div>
  );
}
