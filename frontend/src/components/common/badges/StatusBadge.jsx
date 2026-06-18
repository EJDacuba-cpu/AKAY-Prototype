import {
  formatDisplayValue,
  normalizeHealthRecordStatus,
} from "../../../utils/formatters";

export default function StatusBadge({ status }) {
  const displayStatus = normalizeHealthRecordStatus(
    formatDisplayValue(status, "Pending"),
    "Pending",
  );
  const map = {
    Active: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0", dot: "#10B981" },
    Completed: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0", dot: "#10B981" },
    Pending: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
    Received: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
    "Routine Monitoring": { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
    "Follow-up Required": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
    "Under Observation": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
    "For Monitoring": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
    "Needs Referral": { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA", dot: "#F97316" },
    "For Referral": { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA", dot: "#F97316" },
    Referred: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
    "Referred/Pending": { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
    "No-Show": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
    Cancelled: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", dot: "#DC2626" },
    Inactive: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", dot: "#DC2626" },
    "Low Stock": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
    Unavailable: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", dot: "#DC2626" },
    "Not recorded": { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1", dot: "#94A3B8" },
  };

  const s = map[displayStatus] || map["Not recorded"];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, borderColor: s.border, color: s.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {displayStatus}
    </span>
  );
}
