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
          bg-white
          px-3.5 py-3 text-sm
          leading-relaxed text-[#1F2937]
          outline-none transition-all duration-200

          placeholder:text-[#9CA3AF]

          focus:border-[#B91C1C]
          focus:bg-white
          focus:ring-2
          focus:ring-[#B91C1C]/10
        "
      />
    </div>
  );
}
