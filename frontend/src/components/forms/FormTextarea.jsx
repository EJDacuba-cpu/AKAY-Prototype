export default function FormTextarea({
  label,
  name,
  value,
  onChange,
  placeholder,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>

      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="
          min-h-[100px]
          w-full resize-none
          rounded-lg border border-[#E8ECF0]
          bg-[#FAFBFC]
          px-3 py-3 text-sm
          leading-relaxed text-[#1A1A1A]
          outline-none transition-all duration-200

          placeholder:text-[#BCC3CD]

          focus:border-[#0B2E59]/20
          focus:bg-white
          focus:ring-4
          focus:ring-[#0B2E59]/[0.04]
        "
      />
    </div>
  );
}
