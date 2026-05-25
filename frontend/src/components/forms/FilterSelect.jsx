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

          rounded-xl

          border border-[#E8ECF0]

          bg-[#FAFBFC]

          px-3

          text-sm
          text-[#1A1A1A]

          outline-none

          transition-all duration-200

          focus:border-[#2563EB]
          focus:bg-white
          focus:ring-2
          focus:ring-[#2563EB]/10
        "
      >
        {children}
      </select>
    </div>
  );
}
