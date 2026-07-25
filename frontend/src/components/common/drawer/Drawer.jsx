import { X } from "lucide-react";

export default function Drawer({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  widthClassName = "w-[min(92vw,420px)]",
}) {
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-[9998] bg-slate-950/25 backdrop-blur-sm transition-opacity"
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed right-0 top-0 z-[9999] flex h-dvh ${widthClassName} flex-col overflow-hidden border-l border-[#E5E7EB] bg-white shadow-2xl shadow-black/15 transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EEF2F6] px-5 py-4">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h2 className="text-sm font-bold text-[#1E293B]">{title}</h2>
              )}
              {description && (
                <p className="text-xs text-[#64748B]">{description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
