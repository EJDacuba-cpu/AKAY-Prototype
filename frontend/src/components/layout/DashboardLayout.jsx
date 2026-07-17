import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { getCurrentUser, logoutUser } from "../../utils/auth";
import {
  formatDisplayValue,
  formatFacilityName,
  formatUserName,
} from "../../utils/formatters";
import { useNotifications } from "../../hooks/useNotificationsContext";
import {
  ConfirmationModal,
  ConnectionStatusBanner,
  TopLoadingBar,
} from "../common";
import useConnectionStatus from "../../hooks/useConnectionStatus";
import { useAkayLoadingLifecycle } from "../../hooks/useAkayLoadingLifecycle";
import {
  AKAY_CONTENT_LOADING_END,
  AKAY_CONTENT_LOADING_START,
} from "../../utils/loadingEvents";
import NotificationDropdown from "../features/notifications/NotificationDropdown";
import NotificationModal from "../features/notifications/NotificationModal";
import {
  DesktopSidebar,
  MobileSidebarDrawer,
  menuByRole,
  roleLabel,
} from "./sidebar";

let sidebarExpandedMemory = false;
const ROUTE_LOADING_MIN_MS = 520;
const ROUTE_LOADING_FADE_MS = 360;

export default function DashboardLayout({
  role,
  title,
  children,
  hideSidebar = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

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
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeLoadingComplete, setRouteLoadingComplete] = useState(false);
  const [contentLoadingCount, setContentLoadingCount] = useState(0);
  const routeLoadingStartedAtRef = useRef(0);
  const routeCompleteTimerRef = useRef(null);
  const routeFadeTimerRef = useRef(null);
  const connectionStatus = useConnectionStatus();
  const { shouldShowRouteLoading } = useAkayLoadingLifecycle();
  const routeKey = location.pathname;

  const menuSections = menuByRole[role] || [];
  const user = getCurrentUser() || {
    name: "AKAY User",
    position: "Personnel",
    facility: "Bulakan, Bulacan",
  };
  const displayUser = {
    ...user,
    name: formatUserName(user, "AKAY User"),
    position: formatDisplayValue(
      user.position || roleLabel[role] || user.role,
      "Personnel",
    ),
    roleLabel: roleLabel[role] || formatDisplayValue(user.role, "Personnel"),
    facility: formatFacilityName(
      user.facility_name ||
        user.facilityName ||
        user.assigned_facility ||
        user.assignedFacility ||
        user.facility ||
        user.assignedBarangayHealthCenter ||
        user.assignedRuralHealthUnit ||
        user.barangayHealthCenter ||
        user.barangay_health_center ||
        user.ruralHealthUnit ||
        user.rural_health_unit,
      role === "admin" ? "Municipal Health Office" : "No facility assigned",
    ),
  };

  useEffect(() => {
    sidebarExpandedMemory = sidebarExpanded;
  }, [sidebarExpanded]);

  useEffect(() => {
    function clearRouteLoadingTimers() {
      window.clearTimeout(routeCompleteTimerRef.current);
      window.clearTimeout(routeFadeTimerRef.current);
    }

    if (!shouldShowRouteLoading(routeKey)) {
      clearRouteLoadingTimers();
      setRouteLoading(false);
      setRouteLoadingComplete(false);
      return undefined;
    }

    clearRouteLoadingTimers();
    routeLoadingStartedAtRef.current = Date.now();
    setRouteLoading(true);
    setRouteLoadingComplete(false);

    return clearRouteLoadingTimers;
  }, [routeKey, shouldShowRouteLoading]);

  useEffect(() => {
    function handleContentLoadingStart() {
      setContentLoadingCount((count) => count + 1);
    }

    function handleContentLoadingEnd() {
      setContentLoadingCount((count) => Math.max(0, count - 1));
    }

    window.addEventListener(
      AKAY_CONTENT_LOADING_START,
      handleContentLoadingStart,
    );
    window.addEventListener(AKAY_CONTENT_LOADING_END, handleContentLoadingEnd);

    return () => {
      window.removeEventListener(
        AKAY_CONTENT_LOADING_START,
        handleContentLoadingStart,
      );
      window.removeEventListener(
        AKAY_CONTENT_LOADING_END,
        handleContentLoadingEnd,
      );
    };
  }, []);

  useEffect(() => {
    window.clearTimeout(routeCompleteTimerRef.current);
    window.clearTimeout(routeFadeTimerRef.current);

    if (!routeLoading || contentLoadingCount > 0) return undefined;

    const elapsed = Date.now() - routeLoadingStartedAtRef.current;
    const completionDelay = Math.max(ROUTE_LOADING_MIN_MS - elapsed, 120);

    routeCompleteTimerRef.current = window.setTimeout(() => {
      setRouteLoadingComplete(true);
      routeFadeTimerRef.current = window.setTimeout(() => {
        setRouteLoading(false);
        setRouteLoadingComplete(false);
      }, ROUTE_LOADING_FADE_MS);
    }, completionDelay);

    return () => {
      window.clearTimeout(routeCompleteTimerRef.current);
      window.clearTimeout(routeFadeTimerRef.current);
    };
  }, [contentLoadingCount, routeLoading, routeKey]);

  useEffect(() => {
    if (!connectionStatus.restoredAt) return;

    queryClient.refetchQueries({ type: "active" });
  }, [connectionStatus.restoredAt, queryClient]);

  useEffect(() => {
    function handleBlockingLoadingStart() {
      setIsNotifOpen(false);
      setMobileDrawerOpen(false);
    }

    window.addEventListener(
      "akay:blocking-loading-start",
      handleBlockingLoadingStart,
    );

    return () => {
      window.removeEventListener(
        "akay:blocking-loading-start",
        handleBlockingLoadingStart,
      );
    };
  }, []);

  function handleLogoutRequest() {
    if (logoutLoading) return;
    setIsNotifOpen(false);
    setMobileDrawerOpen(false);
    setLogoutModalOpen(true);
  }

  async function handleConfirmLogout() {
    if (logoutLoading) return;

    setLogoutLoading(true);
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout request failed; clearing local session.", error);
    } finally {
      queryClient.clear();
      setLogoutModalOpen(false);
      setLogoutLoading(false);
      navigate("/login", { replace: true });
    }
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
    <div className="relative flex h-dvh overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
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
            onLogout={handleLogoutRequest}
          />

          {mobileDrawerOpen && (
            <div
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-sm transition-opacity md:hidden"
            />
          )}

          <MobileSidebarDrawer
            open={mobileDrawerOpen}
            menuSections={menuSections}
            user={displayUser}
            isMenuActive={isMenuActive}
            onClose={() => setMobileDrawerOpen(false)}
            onLogout={handleLogoutRequest}
          />
        </>
      )}

      <main
        className={`flex h-dvh min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out ${
          hideSidebar ? "" : sidebarExpanded ? "md:ml-60" : "md:ml-[72px]"
        }`}
      >
<header className="relative z-30 shrink-0 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
  <div className="flex h-14 items-center justify-between px-3.5 sm:h-[62px] sm:px-5">
<div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
  {!hideSidebar && (
    <button
      type="button"
      onClick={() => setMobileDrawerOpen(true)}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#B91C1C] shadow-sm transition hover:bg-[#FEF2F2] md:hidden"
      aria-label="Open sidebar"
    >
      <Menu size={17} />
    </button>
  )}

  <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
    <span className="h-5 w-1 shrink-0 rounded-full bg-[#B91C1C] sm:h-6" />

    <h2 className="truncate text-sm font-black tracking-tight text-[#0F172A] sm:text-base">
      {title}
    </h2>
  </div>
</div>

            <div className="flex items-center gap-2">
              <div className="relative z-[100]">
                <button
                  type="button"
                  onClick={() => setIsNotifOpen((prev) => !prev)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#64748B] shadow-sm transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] sm:h-9 sm:w-9 sm:rounded-lg"
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
        <ConnectionStatusBanner
          isOnline={connectionStatus.isOnline}
          restoredAt={connectionStatus.restoredAt}
        />
        <TopLoadingBar active={routeLoading} complete={routeLoadingComplete} />

        <section className="akay-content-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 lg:p-5">
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

      <ConfirmationModal
        open={logoutModalOpen}
        title="Log out?"
        description="Are you sure you want to log out of AKAY?"
        confirmText="Log out"
        cancelText="Cancel"
        loading={logoutLoading}
        loadingText="Logging out..."
        onCancel={() => {
          if (!logoutLoading) setLogoutModalOpen(false);
        }}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}
