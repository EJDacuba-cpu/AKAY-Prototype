export default function PatientCategoryBadge({ category }) {
  const map = {
    "Pregnant Patient": {
      bg: "#FFF1F2",
      text: "#BE123C",
      border: "#FECDD3",
    },

    "Senior Citizen": {
      bg: "#F5F3FF",
      text: "#6D28D9",
      border: "#DDD6FE",
    },

    Immunization: {
      bg: "#EFF6FF",
      text: "#1D4ED8",
      border: "#BFDBFE",
    },

    "General Consultation": {
      bg: "#F8FAFC",
      text: "#475569",
      border: "#E2E8F0",
    },

    "For Monitoring": {
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FDE68A",
    },
  };

  const s = map[category] || map["General Consultation"];

  return (
    <span
      className="inline-block rounded-lg border px-2.5 py-1 text-[10px] font-semibold"
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
