/**
 * Select Component - Dropdown select field
 * @component
 *
 * @param {string} value - Current value
 * @param {Function} onChange - Change handler
 * @param {Array<{value: string, label: string}>} options - Select options
 * @param {string} [label] - Optional label
 * @param {string} [placeholder] - Placeholder text
 * @param {boolean} [disabled=false] - Whether disabled
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <Select
 *   label="Gender"
 *   value={gender}
 *   onChange={(e) => setGender(e.target.value)}
 *   options={[
 *     { value: 'M', label: 'Male' },
 *     { value: 'F', label: 'Female' }
 *   ]}
 * />
 */
export default function Select({
  value,
  onChange,
  options,
  label,
  placeholder,
  disabled = false,
  className = "",
  ...props
}) {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`
          w-full
          rounded-lg
          border
          border-[#E5E7EB]
          bg-[#F8FAFC]
          px-3
          py-2
          text-sm text-[#0F172A]
          transition-all
          focus:border-[#FCA5A5]
          focus:outline-none
          focus:ring-2
          focus:ring-[#B91C1C]/10
          disabled:bg-slate-100
          disabled:text-slate-500
          ${className}
        `}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
