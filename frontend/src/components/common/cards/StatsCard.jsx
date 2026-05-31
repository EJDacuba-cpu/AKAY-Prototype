import { stagger } from "../../../utils/animation";

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = "navy",
  delay = 0,
}) {
  const map = {
    navy: {
      border: "#B91C1C",
      iconBg: "#FEF2F2",
      iconColor: "#B91C1C",
    },

    red: {
      border: "#B91C1C",
      iconBg: "#FEF2F2",
      iconColor: "#B91C1C",
    },

    blue: {
      border: "#64748B",
      iconBg: "#F8FAFC",
      iconColor: "#64748B",
    },

    slate: {
      border: "#64748B",
      iconBg: "#F8FAFC",
      iconColor: "#64748B",
    },

    amber: {
      border: "#D97706",
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
    },

    emerald: {
      border: "#059669",
      iconBg: "#ECFDF5",
      iconColor: "#047857",
    },
  };

  const c = map[color] || map.navy;

  return (
    <div
      className="anim-fade-up group relative overflow-hidden rounded-xl border border-[#E5E7EB] border-t-2 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#FECACA] hover:shadow-md hover:shadow-black/[0.04]"
      style={{
        borderTopColor: c.border,
        ...stagger(delay),
      }}
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(135deg, ${c.iconBg} 0%, transparent 50%)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94A3B8]">
          {title}
        </p>

        <div
          className="rounded-lg p-2 transition-transform duration-200 group-hover:scale-105"
          style={{
            backgroundColor: c.iconBg,
            color: c.iconColor,
          }}
        >
          {icon}
        </div>
      </div>

      <p
        className="anim-count relative mt-3 text-2xl font-black leading-none tracking-tight text-[#0F172A]"
        style={stagger(delay + 2)}
      >
        {value}
      </p>

      {subtitle && (
        <p className="relative mt-1 text-xs font-medium text-[#64748B]">
          {subtitle}
        </p>
      )}
    </div>
  );
}



