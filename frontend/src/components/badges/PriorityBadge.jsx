export default function PriorityBadge({ priority }) {
  const map = {
    High: {
      bg: "#FEF2F2",
      text: "#B91C1C",
      dot: "#EF4444",
    },

    Medium: {
      bg: "#FFFBEB",
      text: "#B45309",
      dot: "#F59E0B",
    },

    Normal: {
      bg: "#F8FAFC",
      text: "#475569",
      dot: "#10B981",
    },
  };

  const s = map[priority] || map.Normal;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold"
      style={{
        backgroundColor: s.bg,
        color: s.text,
      }}
    >
      <span className="relative flex h-2 w-2">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-40"
          style={{
            backgroundColor: s.dot,
          }}
        />

        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{
            backgroundColor: s.dot,
          }}
        />
      </span>

      {priority}
    </span>
  );
}
