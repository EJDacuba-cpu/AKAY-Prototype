import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Menu } from "lucide-react";
import WorkingFacility from "./WorkingFacility";
import TopBarBreadcrumbs from "./TopBarBreadcrumbs";
import { getBreadcrumbs } from "../../utils/breadcrumbs";
import { navigationAllowed } from "../../utils/dashboardAccess";
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
  // Replaces the default content padding, for pages that manage their own
  // edge spacing (e.g. a full-bleed board that fills the viewport).
  contentClassName = "px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 lg:p-5",
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

  const menuSections = (menuByRole[role] || []).map(section => ({ ...section,
    items: section.items.filter(item => navigationAllowed(getCurrentUser(), item.path)),
  })).filter(section => section.items.length);
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
      if (import.meta.env.DEV) {
        console.warn("Logout endpoint was unavailable; local session cleared.", {
          status: error?.status || null,
          code: error?.code || "",
        });
      }
    } finally {
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
    <div className="relative flex h-dvh overflow-hidden bg-gray-50 text-gray-900">
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
            border-radius: 0;
          }
        `}
      </style>

      {!hideSidebar && (
        <div className="no-print">
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
              className="fixed inset-0 z-40 bg-gray-950/25 transition-opacity md:hidden"
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
        </div>
      )}

      <main
        className={`flex h-dvh min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out ${
          hideSidebar ? "" : sidebarExpanded ? "md:ml-60" : "md:ml-[72px]"
        }`}
      >
<header className="no-print relative z-30 shrink-0 border-b border-gray-200 bg-white font-sans antialiased">
  <div className="flex h-14 items-center justify-between px-3.5 sm:h-[62px] sm:px-5">
<div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
  {!hideSidebar && (
    <button
      type="button"
      onClick={() => setMobileDrawerOpen(true)}
      className="flex h-9 w-9 shrink-0 items-center justify-center border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 md:hidden"
      aria-label="Open sidebar"
    >
      <Menu size={16} />
    </button>
  )}

  <TopBarBreadcrumbs crumbs={getBreadcrumbs(location.pathname, title, location.search)} />
</div>

            <div className="flex items-center gap-2">
              <WorkingFacility />
              <div className="relative z-[100]">
                <button
                  type="button"
                  onClick={() => setIsNotifOpen((prev) => !prev)}
                  className="relative flex h-9 w-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  aria-label={
                    unreadCount > 0
                      ? `Notifications, ${unreadCount} unread`
                      : "Notifications"
                  }
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
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

        <section className={`akay-content-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${contentClassName}`}>
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
        description="Signing out will discard unfinished form data on this device."
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
