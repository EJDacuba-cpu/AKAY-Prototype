export default function StatusBadge({ status }) {
  const map = {
    Active: { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
    Completed: { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
    "For Referral": { bg: "#FFF7ED", text: "#C2410C", dot: "#F97316" },
    Referred: { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
    "For Monitoring": { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
    Inactive: { bg: "#F8FAFC", text: "#475569", dot: "#94A3B8" },
  };

  const s = map[status] || map.Inactive;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {status}
    </span>
  );
}
