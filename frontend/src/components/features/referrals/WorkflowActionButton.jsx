import { Link } from "react-router";

const palette = {
  blue: {
    base: "bg-blue-50 border-blue-200 text-blue-700",
    hover:
      "hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm hover:shadow-blue-100",
  },
  red: {
    base: "bg-red-50 border-red-200 text-red-700",
    hover:
      "hover:bg-red-100 hover:border-red-300 hover:shadow-sm hover:shadow-red-100",
  },
  amber: {
    base: "bg-amber-50 border-amber-200 text-amber-700",
    hover:
      "hover:bg-amber-100 hover:border-amber-300 hover:shadow-sm hover:shadow-amber-100",
  },
  emerald: {
    base: "bg-emerald-50 border-emerald-200 text-emerald-700",
    hover:
      "hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-sm hover:shadow-emerald-100",
  },
  gray: {
    base: "bg-gray-50 border-gray-200 text-gray-600",
    hover: "hover:bg-gray-100 hover:border-gray-300",
  },
};

export default function WorkflowActionButton({
  icon: Icon,
  label,
  color = "blue",
  onClick,
  to,
}) {
  const s = palette[color] || palette.blue;
  const cls = `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 active:scale-[0.97] ${s.base} ${s.hover}`;

  const inner = (
    <>
      <Icon size={13} strokeWidth={2.2} />
      <span className="hidden lg:inline whitespace-nowrap">{label}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
