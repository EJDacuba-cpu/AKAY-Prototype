/**
 * FormGroup Component - Container for form field with label and help text
 * @component
 *
 * @param {string} label - Field label
 * @param {React.ReactNode} children - Form input element
 * @param {string} [helpText] - Help text below field
 * @param {string} [error] - Error message
 * @param {boolean} [required=false] - Show required indicator
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <FormGroup label="Full Name" required>
 *   <Input type="text" placeholder="John Doe" />
 * </FormGroup>
 */
export default function FormGroup({
  label,
  children,
  helpText,
  error,
  required = false,
  className = "",
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label className="flex items-center gap-1 text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-600">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {helpText && !error && (
        <p className="text-xs text-slate-500">{helpText}</p>
      )}
    </div>
  );
}
