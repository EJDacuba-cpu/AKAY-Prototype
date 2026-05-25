export default function CategoryBadge({ category }) {
  const map = {
    A1: {
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    },

    A2: {
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    },

    B1: {
      bg: "#EFF6FF",
      text: "#1D4ED8",
      border: "#BFDBFE",
    },

    B2: {
      bg: "#EFF6FF",
      text: "#1D4ED8",
      border: "#BFDBFE",
    },

    C1: {
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FDE68A",
    },

    C2: {
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FDE68A",
    },
  };

  const s = map[category] || {
    bg: "#F8FAFC",
    text: "#475569",
    border: "#E2E8F0",
  };

  return (
    <span
      className="inline-block rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold"
      style={{
        backgroundColor: s.bg,
        color: s.text,
        borderColor: s.border,
      }}
    >
      {category}
    </span>
  );
}
