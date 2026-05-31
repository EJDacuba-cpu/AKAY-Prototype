/**
 * Button Component - Reusable button with variants
 * @component
 *
 * @param {string} [variant='primary'] - Button style variant: 'primary', 'secondary', 'danger', 'ghost'
 * @param {string} [size='md'] - Button size: 'sm', 'md', 'lg'
 * @param {boolean} [disabled=false] - Whether button is disabled
 * @param {boolean} [isLoading=false] - Whether button shows loading state
 * @param {React.ReactNode} children - Button content
 * @param {React.CSSProperties} [style] - Additional styles
 * @param {Function} onClick - Click handler
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <Button variant="primary" size="lg" onClick={handleClick}>
 *   Click me
 * </Button>
 */
export default function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  isLoading = false,
  children,
  onClick,
  className = "",
  style,
  ...props
}) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg",
  };

  const variantClasses = {
    primary: "bg-[#B91C1C] text-white hover:bg-[#991B1B] active:bg-[#7F1D1D]",
    secondary:
      "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300",
    danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
    ghost:
      "bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        rounded-lg
        font-semibold
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      style={style}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
