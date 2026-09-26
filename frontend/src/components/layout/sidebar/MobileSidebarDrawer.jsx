import { X } from "lucide-react";
import FullSidebarNav from "./FullSidebarNav";
import LogoMark from "./LogoMark";
import SidebarUserFooter from "./SidebarUserFooter";
import { FOCUS_RING } from "./sidebarStyles";

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
      className={`font-sans antialiased fixed left-0 top-0 z-50 flex h-dvh max-h-dvh w-[min(88vw,320px)] flex-col overflow-hidden border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out md:hidden ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark />

          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight tracking-tight text-red-700">
              AKAY
            </p>
            <p className="mt-0.5 whitespace-nowrap text-[9px] font-semibold uppercase leading-tight tracking-wider text-gray-500">
              Community EHR System
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`flex h-9 w-9 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          aria-label="Close sidebar"
        >
          <X size={16} />
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
