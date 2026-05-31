/**
 * Input Component - Form input field
 * @component
 *
 * @param {string} type - Input type: 'text', 'email', 'password', 'number', 'date', 'tel'
 * @param {string} placeholder - Placeholder text
 * @param {string} value - Current value
 * @param {Function} onChange - Change handler
 * @param {string} [label] - Optional label
 * @param {string} [error] - Error message
 * @param {boolean} [disabled=false] - Whether input is disabled
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <Input
 *   type="email"
 *   label="Email"
 *   placeholder="user@example.com"
 *   value={email}
 *   onChange={(e) => setEmail(e.target.value)}
 * />
 */
export default function Input({
  type = "text",
  placeholder,
  value,
  onChange,
  label,
  error,
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
      <input
        type={type}
        placeholder={placeholder}
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
          ${error ? "border-red-500" : ""}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
