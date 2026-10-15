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
        <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">
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
          border-neutral-200
          bg-white
          px-3
          py-2
          text-sm text-neutral-900
          shadow-xs
          transition-all
          focus:border-ink-300
          focus:outline-none
          focus:ring-4
          focus:ring-ink-100
          disabled:bg-neutral-50
          disabled:text-neutral-500
          ${error ? "border-alert-300 focus:border-alert-300 focus:ring-alert-100" : ""}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-alert-700">{error}</p>}
    </div>
  );
}
