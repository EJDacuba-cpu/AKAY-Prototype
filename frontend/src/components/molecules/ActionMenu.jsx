/**
 * ActionMenu Component - Dropdown menu with actions
 * @component
 *
 * @param {Array<{label: string, icon?: React.ReactNode, onClick: Function, variant?: 'default'|'danger'}>} items - Menu items
 * @param {string} [trigger='...'] - Trigger text/icon
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <ActionMenu
 *   items={[
 *     { label: 'Edit', onClick: handleEdit },
 *     { label: 'Delete', onClick: handleDelete, variant: 'danger' }
 *   ]}
 * />
 */
import { useState, useRef, useEffect } from "react";
import { MoreVertical } from "lucide-react";

export default function ActionMenu({ items, trigger = "...", className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg border border-slate-300 p-2 hover:bg-slate-100"
      >
        {typeof trigger === "string" ? trigger : trigger}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-40 rounded-lg border border-slate-200 bg-white shadow-lg">
          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                item.onClick?.();
                setIsOpen(false);
              }}
              className={`
                block
                w-full
                px-4
                py-2
                text-left
                text-sm
                hover:bg-slate-50
                first:rounded-t-lg
                last:rounded-b-lg
                ${
                  item.variant === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : ""
                }
              `}
            >
              <div className="flex items-center gap-2">
                {item.icon && item.icon}
                {item.label}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
