/**
 * Card Component - Container for content
 * @component
 *
 * @param {React.ReactNode} children - Card content
 * @param {string} [className] - Additional CSS classes
 * @param {string} [variant='default'] - Card style: 'default', 'bordered', 'elevated'
 * @param {React.CSSProperties} [style] - Additional styles
 *
 * @example
 * <Card variant="bordered">
 *   <h2>Title</h2>
 *   <p>Content here</p>
 * </Card>
 */
export default function Card({
  children,
  className = "",
  variant = "default",
  style,
}) {
  const variantClasses = {
    default: "bg-white rounded-xl border border-[#E8ECF0] shadow-sm",
    bordered: "bg-white rounded-xl border-2 border-slate-200",
    elevated: "bg-white rounded-xl border border-[#E8ECF0] shadow-lg",
  };

  return (
    <div
      className={`
        ${variantClasses[variant]}
        ${className}
      `}
      style={style}
    >
      {children}
    </div>
  );
}
