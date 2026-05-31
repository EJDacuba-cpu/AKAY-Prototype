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
          rounded-lg border border-[#E5E7EB]
          bg-[#F8FAFC]
          px-3 py-3 text-sm
          leading-relaxed text-[#0F172A]
          outline-none transition-all duration-200

          placeholder:text-[#BCC3CD]

          focus:border-[#FCA5A5]
          focus:bg-white
          focus:ring-3
          focus:ring-[#B91C1C]/[0.08]
        "
      />
    </div>
  );
}
