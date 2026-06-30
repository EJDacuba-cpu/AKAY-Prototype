export default function FormInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  readOnly,
  helperText,
  error,
  className = "",
  ...props
}) {
  return (
    <div className="min-w-0">
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
        readOnly={readOnly}
        {...props}
        className={`
          h-10 w-full rounded-xl
          border border-[#E8ECF0]
          bg-[#FAFBFC] px-3.5 text-sm text-[#1F2937]
          outline-none transition-all duration-200
          placeholder:text-[#9CA3AF]

          focus:border-[#B91C1C]
          focus:bg-white
          focus:ring-2
          focus:ring-[#B91C1C]/10

          ${
            error
              ? "border-[#B91C1C] bg-red-50/30 ring-2 ring-[#B91C1C]/10"
              : ""
          }
          ${
            readOnly
              ? "cursor-not-allowed border-[#E8ECF0] bg-[#F3F4F6] text-[#64748B]"
              : "hover:border-[#D1D5DB]"
          }
          ${className}
        `}
      />
      {error && (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}
      {helperText && (
        <p className="mt-1 text-[10px] leading-relaxed text-[#64748B]">
          {helperText}
        </p>
      )}
    </div>
  );
}
