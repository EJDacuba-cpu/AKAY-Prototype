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
        <label className="mb-2 block text-sm font-medium text-slate-700">
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
          border-slate-300
          px-3
          py-2
          text-base
          transition-all
          focus:border-[#0B2E59]
          focus:outline-none
          focus:ring-2
          focus:ring-[#0B2E59]/10
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
