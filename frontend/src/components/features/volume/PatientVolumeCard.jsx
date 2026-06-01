import { HeartPulse } from "lucide-react";

import { stagger } from "../../../utils/animation";
import { getRhuVolumeSnapshot } from "../../../services/volumeService";

export default function PatientVolumeCard({
  delay = 0,
  snapshot,
  title = "RHU Patient Volume",
  subtitle = "Automatically based on today's RHU workload.",
  statusSuffix = "Volume",
}) {
  const volumeSnapshot = snapshot || getRhuVolumeSnapshot();
  const status = normalizeVolumeStatus(volumeSnapshot.status);
  const volumeMap = {
    Low: {
      label: "Low",
      helper: "Manageable patient flow",
      border: "#10B981",
      iconBg: "#ECFDF5",
      iconColor: "#047857",
      badge: "border-emerald-100 bg-emerald-50 text-emerald-700",
      pulse: "bg-emerald-500",
    },
    Normal: {
      label: "Normal",
      helper: "Stable patient activity",
      border: "#3B82F6",
      iconBg: "#EFF6FF",
      iconColor: "#1D4ED8",
      badge: "border-blue-100 bg-blue-50 text-blue-700",
      pulse: "bg-blue-500",
    },
    High: {
      label: "High",
      helper: "Heavy patient workload",
      border: "#D97706",
      iconBg: "#FFFBEB",
      iconColor: "#B45309",
      badge: "border-amber-100 bg-amber-50 text-amber-700",
      pulse: "bg-amber-500",
    },
  };

  const selected = volumeMap[status] || volumeMap.Normal;
  const statusLabel = [selected.label, statusSuffix].filter(Boolean).join(" ");
  const updatedLabel = volumeSnapshot.updatedLabel || "now";

  return (
    <div
      className="anim-fade-up group relative h-full min-h-[116px] overflow-hidden rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.04]"
      style={{ borderTopColor: selected.border, ...stagger(delay) }}
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(135deg, ${selected.iconBg} 0%, transparent 54%)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: selected.iconBg, color: selected.iconColor }}
        >
          <HeartPulse size={15} />
        </div>
      </div>

      <div className="relative mt-2 flex min-w-0 items-center gap-2">
        <p className="min-w-0 truncate text-xl font-bold leading-tight tracking-tight text-[#0F172A]">
          {statusLabel}
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${selected.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${selected.pulse}`} />
          Live
        </span>
      </div>

      <p className="relative mt-1 truncate text-[11px] font-medium leading-snug text-[#64748B]">
        {selected.helper || subtitle}
      </p>

      <div className="relative mt-2 flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] font-semibold text-[#9CA3AF]">
          Updated {updatedLabel}
        </p>
        <p className="shrink-0 rounded-md bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-bold text-[#64748B]">
          Load {formatLoadValue(volumeSnapshot.workloadScore)}
        </p>
      </div>
    </div>
  );
}

function normalizeVolumeStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (normalized.includes("high")) return "High";
  if (normalized.includes("normal") || normalized.includes("moderate")) {
    return "Normal";
  }

  return "Low";
}

function formatLoadValue(value) {
  const loadValue = Number(value || 0);
  return Number.isInteger(loadValue) ? String(loadValue) : loadValue.toFixed(1);
}
