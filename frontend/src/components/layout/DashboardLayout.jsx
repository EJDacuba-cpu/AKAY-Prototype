import { useEffect, useState } from "react";
import { Bell, MapPin, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { getCurrentUser, logoutUser } from "../../utils/auth";
import {
  formatDisplayValue,
  formatFacilityName,
  formatUserName,
} from "../../utils/formatters";
import { useNotifications } from "../../hooks/useNotificationsContext";
import NotificationDropdown from "../features/notifications/NotificationDropdown";
import NotificationModal from "../features/notifications/NotificationModal";
import {
  DesktopSidebar,
  MobileSidebarDrawer,
  menuByRole,
  roleLabel,
} from "./sidebar";

let sidebarExpandedMemory = false;

export default function DashboardLayout({
  role,
  title,
  children,
  hideSidebar = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(sidebarExpandedMemory);

  const {
    unreadCount,
    markAsRead,
    deleteNotification,
    selectedNotif,
    setSelectedNotif,
  } = useNotifications();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const menuSections = menuByRole[role] || [];
  const user = getCurrentUser() || {
    name: "AKAY User",
    position: "Personnel",
    facility: "Bulakan, Bulacan",
  };
  const displayUser = {
    ...user,
    name: formatUserName(user, "AKAY User"),
    position: formatDisplayValue(user.position || user.role, "Personnel"),
    facility: formatFacilityName(
      user.facility ||
        user.barangayHealthCenter ||
        user.barangay_health_center ||
        user.ruralHealthUnit ||
        user.rural_health_unit,
      "Bulakan, Bulacan",
    ),
  };

  useEffect(() => {
    sidebarExpandedMemory = sidebarExpanded;
  }, [sidebarExpanded]);

  function handleLogout() {
    logoutUser();
    navigate("/login");
  }

  function isMenuActive(path) {
    if (location.pathname === path) return true;
    if (path === `/${role}/dashboard`) return false;
    return location.pathname.startsWith(path);
  }

  const handleDropdownSelect = (notif) => {
    markAsRead(notif.id);
    setIsNotifOpen(false);
    if (notif?.link) {
      navigate(notif.link);
      return;
    }
    setSelectedNotif(notif);
    setIsModalOpen(true);
  };

  const handleSeeAll = () => {
    setIsNotifOpen(false);
    navigate("/notifications");
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedNotif(null);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <style>
        {`
          .akay-sidebar-scroll {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }

          .akay-sidebar-scroll::-webkit-scrollbar {
            display: none;
          }

          .akay-content-scroll {
            scrollbar-width: thin;
            scrollbar-color: #E5E7EB transparent;
          }

          .akay-content-scroll::-webkit-scrollbar {
            width: 5px;
          }

          .akay-content-scroll::-webkit-scrollbar-track {
            background: transparent;
          }

          .akay-content-scroll::-webkit-scrollbar-thumb {
            background-color: #D1D5DB;
            border-radius: 999px;
          }
        `}
      </style>

      {!hideSidebar && (
        <>
          <DesktopSidebar
            expanded={sidebarExpanded}
            menuSections={menuSections}
            user={displayUser}
            isMenuActive={isMenuActive}
            onToggle={() => setSidebarExpanded((prev) => !prev)}
            onLogout={handleLogout}
          />

          {mobileDrawerOpen && (
            <div
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm md:hidden"
            />
          )}

          <MobileSidebarDrawer
            open={mobileDrawerOpen}
            menuSections={menuSections}
            user={displayUser}
            isMenuActive={isMenuActive}
            onClose={() => setMobileDrawerOpen(false)}
            onLogout={handleLogout}
          />
        </>
      )}

      <main
        className={`flex h-screen min-w-0 flex-col transition-[margin] duration-300 ease-in-out ${
          hideSidebar ? "" : sidebarExpanded ? "md:ml-60" : "md:ml-[72px]"
        }`}
      >
<header className="relative z-30 shrink-0 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
  <div className="flex h-[62px] items-center justify-between px-5">
<div className="flex min-w-0 items-center gap-3">
  {!hideSidebar && (
    <button
      type="button"
      onClick={() => setMobileDrawerOpen(true)}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#B91C1C] shadow-sm transition hover:bg-[#FEF2F2] md:hidden"
      aria-label="Open sidebar"
    >
      <Menu size={17} />
    </button>
  )}

  <div className="flex min-w-0 items-center gap-3">
    <span className="h-6 w-1 rounded-full bg-[#B91C1C]" />

    <h2 className="truncate text-base font-black tracking-tight text-[#0F172A]">
      {title}
    </h2>
  </div>
</div>

            <div className="flex items-center gap-2">
              <div className="hidden h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 shadow-sm sm:flex">
                <MapPin size={12} className="text-[#B91C1C]" />
                <span className="max-w-[140px] truncate text-[10px] font-semibold text-[#4B5563]">
                  {displayUser.facility}
                </span>
              </div>

              <span className="hidden h-8 items-center rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2 text-[10px] font-semibold text-[#64748B] shadow-sm md:inline-flex">
                {roleLabel[role]}
              </span>

              <div className="relative z-[100]">
                <button
                  type="button"
                  onClick={() => setIsNotifOpen((prev) => !prev)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#64748B] shadow-sm transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
                  aria-label="Notifications"
                >
                  <Bell size={15} />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#B91C1C] text-[8px] font-bold text-white ring-2 ring-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {isNotifOpen && (
                  <NotificationDropdown
                    isOpen={isNotifOpen}
                    onClose={() => setIsNotifOpen(false)}
                    onSelect={handleDropdownSelect}
                    onSeeAll={handleSeeAll}
                  />
                )}
              </div>
            </div>
          </div>
        </header>

        <section className="akay-content-scroll flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-5">
          {children}
        </section>
      </main>

      <NotificationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        notification={selectedNotif}
        onViewRecord={(notif) => {
          if (notif?.link) {
            handleCloseModal();
            navigate(notif.link);
          }
        }}
        onDelete={deleteNotification}
      />
    </div>
  );
}
