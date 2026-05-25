/**
 * LoadingSpinner Component - Show loading state
 * @component
 *
 * @param {string} [size='md'] - Spinner size: 'sm', 'md', 'lg'
 * @param {string} [label] - Optional loading message
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <LoadingSpinner size="lg" label="Loading data..." />
 */
export default function LoadingSpinner({ size = "md", label, className = "" }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <svg
        className={`animate-spin text-[#0B2E59] ${sizeClasses[size]}`}
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
      {label && <p className="text-sm text-slate-600">{label}</p>}
    </div>
  );
}
