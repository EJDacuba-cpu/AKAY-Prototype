/**
 * FormPanel Component - Reusable form container with submit/cancel actions
 * @component
 *
 * @param {string} title - Form title
 * @param {React.ReactNode} children - Form fields
 * @param {Function} onSubmit - Submit handler
 * @param {Function} [onCancel] - Cancel handler
 * @param {boolean} [isLoading=false] - Loading state
 * @param {string} [submitLabel='Submit'] - Submit button text
 * @param {string} [cancelLabel='Cancel'] - Cancel button text
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <FormPanel
 *   title="Add Patient"
 *   onSubmit={handleSubmit}
 *   onCancel={handleCancel}
 * >
 *   <FormGroup label="Name">
 *     <Input type="text" />
 *   </FormGroup>
 * </FormPanel>
 */
import { Button } from "../atoms";

export default function FormPanel({
  title,
  children,
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  className = "",
}) {
  return (
    <div
      className={`
        rounded-2xl
        border border-[#E8ECF0]
        bg-white
        shadow-sm
        ${className}
      `}
    >
      {/* Header */}
      {title && (
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
      )}

      {/* Content */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        className="space-y-6 p-6"
      >
        {children}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
          {onCancel && (
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={isLoading}
              type="button"
            >
              {cancelLabel}
            </Button>
          )}
          <Button variant="primary" type="submit" isLoading={isLoading}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
