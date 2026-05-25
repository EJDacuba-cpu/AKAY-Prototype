/**
 * Badge Component - Display labels and tags
 * @component
 *
 * @param {string} [variant='default'] - Badge style: 'default', 'primary', 'success', 'warning', 'danger'
 * @param {string} [size='md'] - Badge size: 'sm', 'md', 'lg'
 * @param {React.ReactNode} children - Badge content
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <Badge variant="success">Active</Badge>
 */
export default function Badge({
  variant = "default",
  size = "md",
  children,
  className = "",
}) {
  const variantClasses = {
    default: "bg-slate-100 text-slate-700",
    primary: "bg-blue-100 text-blue-700",
    success: "bg-green-100 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  };

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  return (
    <span
      className={`
        inline-block
        rounded-lg
        font-medium
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
