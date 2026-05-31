export default function StatusBadge({ status }) {
  const map = {
    Active: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0", dot: "#10B981" },
    Completed: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0", dot: "#10B981" },
    Pending: { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1", dot: "#94A3B8" },
    Received: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
    "For Referral": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
    Referred: { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1", dot: "#64748B" },
    "For Monitoring": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
    "No-Show": { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", dot: "#DC2626" },
    Cancelled: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", dot: "#DC2626" },
    Inactive: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", dot: "#DC2626" },
    "Low Stock": { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
    Unavailable: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", dot: "#DC2626" },
  };

  const s = map[status] || map.Pending;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, borderColor: s.border, color: s.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {status || "Pending"}
    </span>
  );
}
