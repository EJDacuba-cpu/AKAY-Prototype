export default function FormSelect({
  label,
  name,
  value,
  onChange,
  children,
  required,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}

        {required && <span className="text-red-400"> *</span>}
      </label>

      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="
          h-10 w-full appearance-none
          rounded-lg border border-[#E5E7EB]
          bg-white
          px-3.5 pr-8 text-sm text-[#1F2937]
          outline-none transition-all duration-200

          hover:border-[#D1D5DB]

          focus:border-[#B91C1C]
          focus:bg-white
          focus:ring-2
          focus:ring-[#B91C1C]/10
        "
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",

          backgroundRepeat: "no-repeat",

          backgroundPosition: "right 0.75rem center",
        }}
      >
        {children}
      </select>
    </div>
  );
}
