import { X } from "lucide-react";
import FullSidebarNav from "./FullSidebarNav";
import LogoMark from "./LogoMark";
import SidebarUserFooter from "./SidebarUserFooter";

export default function MobileSidebarDrawer({
  open,
  menuSections,
  user,
  isMenuActive,
  onClose,
  onLogout,
}) {
  return (
    <aside
      className={`fixed left-0 top-0 z-50 flex h-dvh max-h-dvh w-[min(88vw,320px)] flex-col overflow-hidden border-r border-[#E5E7EB] bg-white shadow-2xl shadow-black/15 transition-transform duration-300 ease-in-out md:hidden ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#991B1B] bg-[#B91C1C] px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMark />

          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white">
              AKAY
            </p>
           <p className="text-[8px] uppercase tracking-[0.16em] text-red-100">
              Health Coordination
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-red-100 transition hover:bg-white/10 hover:text-white"
          aria-label="Close sidebar"
        >
          <X size={17} />
        </button>
      </div>

      <FullSidebarNav
        menuSections={menuSections}
        isMenuActive={isMenuActive}
        onNavigate={onClose}
      />

      <SidebarUserFooter user={user} onLogout={onLogout} />
    </aside>
  );
}
