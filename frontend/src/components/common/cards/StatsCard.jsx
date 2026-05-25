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
      border: "#0B2E59",
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
    },

    blue: {
      border: "#2563EB",
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
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
  };

  const c = map[color] || map.navy;

  return (
    <div
      className="anim-fade-up group relative overflow-hidden rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.04]"
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

      <div className="relative flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div
          className="rounded-lg p-2.5 transition-transform duration-300 group-hover:scale-110"
          style={{
            backgroundColor: c.iconBg,
            color: c.iconColor,
          }}
        >
          {icon}
        </div>
      </div>

      <p
        className="anim-count relative mt-4 text-2xl font-bold leading-none tracking-tight text-[#0B2E59]"
        style={stagger(delay + 2)}
      >
        {value}
      </p>

      <p className="relative mt-1 text-xs text-[#9CA3AF]">{subtitle}</p>
    </div>
  );
}



