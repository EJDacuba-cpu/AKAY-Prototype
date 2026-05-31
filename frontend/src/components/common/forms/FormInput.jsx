export default function FormInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  readOnly,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}

        {required && <span className="text-red-400"> *</span>}
      </label>

      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        className={`
          h-10 w-full rounded-lg
          border border-[#E5E7EB]
          px-3 text-sm text-[#0F172A]
          outline-none transition-all duration-200

          focus:border-[#FCA5A5]
          focus:bg-white
          focus:ring-3
          focus:ring-[#B91C1C]/[0.08]

          ${
            readOnly
              ? "cursor-not-allowed border-[#E5E7EB] bg-[#F1F5F9] text-[#64748B]"
              : "bg-[#F8FAFC] hover:border-[#CBD5E1]"
          }
        `}
      />
    </div>
  );
}
