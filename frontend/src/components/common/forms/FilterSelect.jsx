export default function FilterSelect({
  label,
  children,

  value,
  onChange,

  className = "",
}) {
  return (
    <div className={className}>
      <label
        className="
          mb-1.5 block

          text-[10px]
          font-semibold
          uppercase
          tracking-wider

          text-[#9CA3AF]
        "
      >
        {label}
      </label>

      <select
        value={value}
        onChange={onChange}
        className="
          h-10 w-full

          appearance-none

          rounded-lg

          border border-[#E5E7EB]

          bg-[#F8FAFC]

          px-3

          text-sm
          text-[#0F172A]

          outline-none

          transition-all duration-200

          focus:border-[#FCA5A5]
          focus:bg-white
          focus:ring-2
          focus:ring-[#B91C1C]/10
        "
      >
        {children}
      </select>
    </div>
  );
}
