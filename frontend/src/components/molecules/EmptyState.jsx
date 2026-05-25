/**
 * EmptyState Component - Display when no data available
 * @component
 *
 * @param {React.ReactNode} icon - Icon component to display
 * @param {string} title - Empty state title
 * @param {string} [description] - Empty state description
 * @param {React.ReactNode} [action] - Optional action button
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <EmptyState
 *   icon={<Users size={48} />}
 *   title="No patients found"
 *   description="Try adjusting your search filters"
 *   action={<Button onClick={handleAdd}>Add Patient</Button>}
 * />
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}) {
  return (
    <div
      className={`
        flex
        flex-col
        items-center
        justify-center
        gap-4
        rounded-2xl
        bg-slate-50
        py-12
        px-4
        text-center
        ${className}
      `}
    >
      <div className="rounded-full bg-slate-200 p-4 text-slate-400">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="max-w-xs text-sm text-slate-600">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
