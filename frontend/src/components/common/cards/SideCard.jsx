import { stagger } from "../../../utils/animation";

export default function SideCard({
  title,
  subtitle,
  icon,
  badge,
  badgeType = "default",
  children,
  delay = 0,
}) {
  const badgeStyles = {
    default: "bg-[#F8FAFC] text-[#64748B] border border-[#E5E7EB]",

    danger: "bg-red-50 text-red-700 border border-red-100",

    success: "bg-emerald-50 text-emerald-700 border border-emerald-100",

    warning: "bg-amber-50 text-amber-700 border border-amber-100",
  };

  return (
    <section
      className="
        anim-fade-up

        overflow-hidden

        rounded-xl

        border border-[#E5E7EB]

        bg-white

        p-4

        shadow-sm
        shadow-black/[0.02]
      "
      style={stagger(delay)}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div
                className="
                  flex h-8 w-8
                  items-center justify-center

                  rounded-lg

                  bg-[#FEF2F2]

                  text-[#B91C1C]
                "
              >
                {icon}
              </div>
            )}

            <h2
              className="
                text-sm
                font-semibold
                text-[#0F172A]
              "
            >
              {title}
            </h2>

            {badge && (
              <span
                className={`
                  rounded-md
                  px-2.5 py-1

                  text-[10px]
                  font-semibold

                  ${badgeStyles[badgeType] || badgeStyles.default}
                `}
              >
                {badge}
              </span>
            )}
          </div>

          {subtitle && (
            <p
              className="
                mt-1

                text-xs
                leading-relaxed
                text-[#64748B]
              "
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}



