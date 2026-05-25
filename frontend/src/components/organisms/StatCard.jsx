/**
 * StatCard Component - Display key statistics with animation
 * @component
 *
 * @param {string} title - Card title
 * @param {string|number} value - Main value to display
 * @param {string} [subtitle] - Subtitle or secondary info
 * @param {React.ReactNode} [icon] - Icon component
 * @param {string} [color='navy'] - Color variant: 'navy', 'blue', 'green', 'amber', 'red'
 * @param {string} [trend] - Trend indicator (+5%, -3%)
 * @param {number} [delay=0] - Animation delay in milliseconds
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <StatCard
 *   title="Total Patients"
 *   value={2435}
 *   subtitle="Active records"
 *   icon={<Users size={20} />}
 *   color="navy"
 *   trend="+12%"
 * />
 */
import { stagger } from "../../utils/animation";

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = "navy",
  trend,
  delay = 0,
  className = "",
}) {
  const colorMap = {
    navy: {
      border: "#0B2E59",
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      trendColor: "text-slate-600",
    },
    blue: {
      border: "#2563EB",
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      trendColor: "text-blue-600",
    },
    green: {
      border: "#10B981",
      iconBg: "#ECFDF5",
      iconColor: "#10B981",
      trendColor: "text-green-600",
    },
    amber: {
      border: "#D97706",
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
      trendColor: "text-amber-600",
    },
    red: {
      border: "#EF4444",
      iconBg: "#FEE2E2",
      iconColor: "#EF4444",
      trendColor: "text-red-600",
    },
  };

  const c = colorMap[color] || colorMap.navy;

  return (
    <div
      className={`
        anim-fade-up
        group
        relative
        overflow-hidden
        rounded-xl
        border
        border-[#E8ECF0]
        border-t-2
        bg-white
        p-5
        shadow-sm
        transition-all
        duration-300
        hover:-translate-y-0.5
        hover:shadow-lg
        hover:shadow-black/[0.04]
        ${className}
      `}
      style={{
        borderTopColor: c.border,
        ...stagger(delay),
      }}
    >
      {/* Gradient background on hover */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(135deg, ${c.iconBg} 0%, transparent 50%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          {icon && (
            <div
              className="rounded-lg p-2.5"
              style={{ backgroundColor: c.iconBg }}
            >
              <div style={{ color: c.iconColor }}>{icon}</div>
            </div>
          )}
        </div>

        {/* Body */}
        <div>
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <div className="mt-2 flex items-baseline justify-between">
            <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
            {trend && (
              <span className={`text-xs font-semibold ${c.trendColor}`}>
                {trend}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
