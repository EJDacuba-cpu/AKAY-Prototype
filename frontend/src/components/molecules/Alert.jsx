/**
 * Alert Component - Display notifications and alerts
 * @component
 *
 * @param {string} [variant='info'] - Alert type: 'info', 'success', 'warning', 'error'
 * @param {React.ReactNode} children - Alert content
 * @param {Function} [onClose] - Close handler
 * @param {boolean} [closeable=true] - Show close button
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <Alert variant="success" onClose={() => setAlert(null)}>
 *   Patient created successfully!
 * </Alert>
 */
export default function Alert({
  variant = "info",
  children,
  onClose,
  closeable = true,
  className = "",
}) {
  const variantClasses = {
    info: "bg-blue-50 text-blue-900 border-blue-200",
    success: "bg-green-50 text-green-900 border-green-200",
    warning: "bg-amber-50 text-amber-900 border-amber-200",
    error: "bg-red-50 text-red-900 border-red-200",
  };

  const iconClasses = {
    info: "text-blue-600",
    success: "text-green-600",
    warning: "text-amber-600",
    error: "text-red-600",
  };

  return (
    <div
      className={`
        flex items-start gap-3
        rounded-lg
        border
        p-4
        ${variantClasses[variant]}
        ${className}
      `}
    >
      <div className={`mt-0.5 flex-shrink-0 ${iconClasses[variant]}`}>
        {variant === "success" && (
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {variant === "error" && (
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {variant === "warning" && (
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
      <div className="flex-1">{children}</div>
      {closeable && onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 text-current opacity-70 hover:opacity-100"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
