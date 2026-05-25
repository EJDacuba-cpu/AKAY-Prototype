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
    default: "bg-[#F3F4F6] text-[#6B7280]",

    danger: "bg-red-100 text-red-700",

    success: "bg-emerald-100 text-emerald-700",

    warning: "bg-amber-100 text-amber-700",
  };

  return (
    <section
      className="
        anim-fade-up

        overflow-hidden

        rounded-2xl

        border border-[#E8ECF0]

        bg-white

        p-5

        shadow-sm
        shadow-black/[0.02]
      "
      style={stagger(delay)}
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div
                className="
                  flex h-8 w-8
                  items-center justify-center

                  rounded-lg

                  bg-[#EFF6FF]

                  text-[#2563EB]
                "
              >
                {icon}
              </div>
            )}

            <h2
              className="
                text-sm
                font-semibold
                text-[#0B2E59]
              "
            >
              {title}
            </h2>

            {badge && (
              <span
                className={`
                  rounded-lg
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
                text-[#9CA3AF]
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



