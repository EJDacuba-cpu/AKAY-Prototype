/**
 * Modal Component - Dialog overlay
 * @component
 *
 * @param {boolean} isOpen - Whether modal is visible
 * @param {Function} onClose - Close handler
 * @param {React.ReactNode} children - Modal content
 * @param {string} [title] - Modal title
 * @param {string} [size='md'] - Modal size: 'sm', 'md', 'lg', 'xl'
 * @param {boolean} [closeOnEscape=true] - Close on Escape key
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Confirm">
 *   <p>Are you sure?</p>
 * </Modal>
 */
export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  size = "md",
  closeOnEscape = true,
  className = "",
}) {
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  };

  // Handle Escape key
  React.useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className={`
          w-full
          rounded-2xl
          bg-white
          shadow-xl
          ${sizeClasses[size]}
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-700"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

import React from "react";
