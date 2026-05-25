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
          border border-[#E8ECF0]
          px-3 text-sm text-[#1A1A1A]
          outline-none transition-all duration-200

          focus:border-[#0B2E59]/20
          focus:bg-white
          focus:ring-4
          focus:ring-[#0B2E59]/[0.04]

          ${
            readOnly
              ? "cursor-not-allowed border-[#E8ECF0] bg-[#F3F4F6] text-[#6B7280]"
              : "bg-[#FAFBFC] hover:border-[#BCC3CD]"
          }
        `}
      />
    </div>
  );
}
