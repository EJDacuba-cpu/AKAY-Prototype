import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Boxes,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  Users,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { getCurrentUser, logoutUser } from "../../utils/auth";
import { useNotifications } from "../../hooks/useNotificationsContext";
import NotificationDropdown from "../features/notifications/NotificationDropdown";
import NotificationModal from "../features/notifications/NotificationModal";

let sidebarExpandedMemory = false;

const LOGO_SRC = "/akay-logo-only.png";

const menuByRole = {
  admin: [
    {
      section: "Overview",
      items: [
        { label: "Dashboard", path: "/admin/dashboard", icon: LayoutGrid },
      ],
    },
    {
      section: "Management",
      items: [{ label: "Accounts", path: "/admin/users", icon: Users }],
    },
    {
      section: "System",
      items: [
        { label: "Reports", path: "/admin/reports", icon: FileText },
        { label: "Audit Logs", path: "/admin/audit-logs", icon: Activity },
      ],
    },
  ],
  bhc: [
    {
      section: "Overview",
      items: [{ label: "Dashboard", path: "/bhc/dashboard", icon: LayoutGrid }],
    },
    {
      section: "Patient Care",
      items: [
        { label: "Patients", path: "/bhc/patients", icon: Users },
        {
          label: "Health Records",
          path: "/bhc/health-records",
          icon: FileText,
        },
        { label: "Referrals", path: "/bhc/referrals", icon: ClipboardList },
      ],
    },
    {
      section: "Coordination",
      items: [
        {
          label: "Medicine Availability",
          path: "/bhc/medicine-availability",
          icon: Boxes,
        },
        { label: "Reports", path: "/bhc/reports", icon: FileText },
      ],
    },
  ],
  rhu: [
    {
      section: "Overview",
      items: [{ label: "Dashboard", path: "/rhu/dashboard", icon: LayoutGrid }],
    },
    {
      section: "Referral Management",
      items: [
        {
          label: "Incoming Referrals",
          path: "/rhu/incoming-referrals",
          icon: ClipboardList,
        },
        { label: "QR Scanner", path: "/rhu/qr-scanner", icon: QrCode },
      ],
    },
    {
      section: "Clinical Records",
      items: [
        { label: "Patients", path: "/rhu/patients", icon: Users },
        {
          label: "Health Records",
          path: "/rhu/health-records",
          icon: FileText,
        },
        {
          label: "Doctor Schedule",
          path: "/rhu/doctor-schedule",
          icon: CalendarDays,
        },
      ],
    },
    {
      section: "Operations",
      items: [
        {
          label: "Medicine Management",
          path: "/rhu/medicine-management",
          icon: Boxes,
        },
        { label: "Reports", path: "/rhu/reports", icon: Activity },
      ],
    },
  ],
};

const roleLabel = {
  admin: "Municipal Health Officer",
  bhc: "Barangay Health Worker",
  rhu: "Rural Health Unit",
};

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
    setSelectedNotif(notif);
    setIsModalOpen(true);
    setIsNotifOpen(false);
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
    <div className="relative h-screen overflow-hidden bg-[#F8FAFC] text-[#1F2937]">
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
            user={user}
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
            user={user}
            isMenuActive={isMenuActive}
            onClose={() => setMobileDrawerOpen(false)}
            onLogout={handleLogout}
          />
        </>
      )}

      <main
        className={`flex h-screen min-w-0 flex-col transition-[margin] duration-300 ease-in-out ${
          hideSidebar ? "" : sidebarExpanded ? "md:ml-60" : "md:ml-[68px]"
        }`}
      >
        <header className="relative z-30 flex-shrink-0 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              {!hideSidebar && (
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#B91C1C] shadow-sm transition hover:bg-[#F9FAFB] md:hidden"
                  aria-label="Open sidebar"
                >
                  <Menu size={17} />
                </button>
              )}

              <h2 className="truncate text-base font-bold tracking-tight text-[#1F2937] sm:text-lg">
                {title}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 shadow-sm sm:flex">
                <MapPin size={12} className="text-[#B91C1C]" />
                <span className="max-w-[140px] truncate text-[10px] font-semibold text-[#4B5563]">
                  {user.facility}
                </span>
              </div>

              <span className="hidden rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#6B7280] shadow-sm md:inline-block">
                {roleLabel[role]}
              </span>

              <div className="relative z-[100]">
                <button
                  type="button"
                  onClick={() => setIsNotifOpen((prev) => !prev)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] shadow-sm transition hover:bg-[#F9FAFB] hover:text-[#B91C1C]"
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

function LogoMark({ size = "md" }) {
  const imageSize = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <img
        src={LOGO_SRC}
        alt="AKAY Logo"
        className={`${imageSize} object-contain`}
        draggable="false"
      />
    </div>
  );
}

function DesktopSidebar({
  expanded,
  menuSections,
  user,
  isMenuActive,
  onToggle,
  onLogout,
}) {
  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-full flex-col overflow-hidden border-r border-[#E5E7EB] bg-white shadow-sm transition-[width] duration-300 ease-in-out md:flex ${
        expanded ? "w-60" : "w-[68px]"
      }`}
    >
      <div
        className={`flex h-16 shrink-0 items-center border-b border-[#E5E7EB] transition-all duration-300 ${
          expanded ? "px-3" : "justify-center px-0"
        }`}
      >
        <LogoMark />

        <div
          className={`min-w-0 flex-1 overflow-hidden transition-all duration-200 ${
            expanded
              ? "ml-3 max-w-[150px] opacity-100 delay-100"
              : "ml-0 max-w-0 opacity-0"
          }`}
        >
          <p className="text-sm font-bold tracking-tight text-[#B91C1C]">
            AKAY
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[8px] uppercase tracking-[0.16em] text-[#9CA3AF]">
            Community EHR System
          </p>
        </div>

        {expanded && (
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6B7280] transition hover:bg-[#F9FAFB] hover:text-[#B91C1C]"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {!expanded && (
        <div className="flex h-12 shrink-0 items-center justify-center border-b border-[#E5E7EB]">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] transition hover:bg-[#F9FAFB] hover:text-[#B91C1C]"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen size={17} />
          </button>
        </div>
      )}

      <nav className="akay-sidebar-scroll flex-1 overflow-y-auto px-2 py-4">
        {menuSections.map((section) => (
          <div key={section.section} className="mb-4">
            <p
              className={`mb-1 overflow-hidden whitespace-nowrap px-2 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF] transition-all duration-200 ${
                expanded ? "max-h-6 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {section.section}
            </p>

            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isMenuActive(item.path);

                return (
                  <Link
                    key={`${section.section}-${item.label}`}
                    to={item.path}
                    title={!expanded ? item.label : undefined}
                    aria-label={item.label}
                    className={`group relative flex h-11 w-full items-center rounded-xl transition-all duration-200 ${
                      expanded ? "px-3" : "justify-center px-0"
                    } ${
                      active
                        ? "bg-[#FEF2F2] text-[#B91C1C]"
                        : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#B91C1C]"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-2 h-7 w-1 rounded-r-full bg-[#B91C1C]" />
                    )}

                    <Icon
                      size={19}
                      strokeWidth={active ? 2.3 : 1.9}
                      className="shrink-0 transition-transform duration-200 group-hover:scale-105"
                    />

                    <span
                      className={`ml-3 overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 ${
                        expanded
                          ? "max-w-[150px] opacity-100 delay-75"
                          : "max-w-0 opacity-0"
                      }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[#E5E7EB] p-2">
        <div
          className={`overflow-hidden transition-all duration-200 ${
            expanded
              ? "mb-2 max-h-16 opacity-100 delay-75"
              : "mb-0 max-h-0 opacity-0"
          }`}
        >
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2">
            <p className="truncate text-xs font-semibold text-[#1F2937]">
              {user.name}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-[#9CA3AF]">
              {user.position}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          title="Sign out"
          aria-label="Sign out"
          className={`flex h-10 w-full items-center rounded-xl border border-[#E5E7EB] bg-white text-[#B91C1C] transition hover:bg-[#F9FAFB] ${
            expanded ? "gap-2 px-3" : "justify-center px-0"
          }`}
        >
          <LogOut size={17} className="shrink-0" />

          <span
            className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 ${
              expanded
                ? "max-w-[100px] opacity-100 delay-75"
                : "max-w-0 opacity-0"
            }`}
          >
            Sign out
          </span>
        </button>
      </div>
    </aside>
  );
}

function MobileSidebarDrawer({
  open,
  menuSections,
  user,
  isMenuActive,
  onClose,
  onLogout,
}) {
  return (
    <aside
      className={`fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col overflow-hidden border-r border-[#E5E7EB] bg-white shadow-2xl shadow-black/15 transition-transform duration-300 ease-in-out md:hidden ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-16 items-center justify-between border-b border-[#E5E7EB] px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMark />

          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-[#B91C1C]">
              AKAY
            </p>
            <p className="text-[8px] uppercase tracking-[0.16em] text-[#9CA3AF]">
              Health Coordination
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] transition hover:bg-[#F9FAFB] hover:text-[#B91C1C]"
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

function FullSidebarNav({ menuSections, isMenuActive, onNavigate }) {
  return (
    <nav className="akay-sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
      {menuSections.map((section) => (
        <div key={section.section} className="mb-5">
          <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF]">
            {section.section}
          </p>

          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isMenuActive(item.path);

              return (
                <Link
                  key={`${section.section}-${item.label}`}
                  to={item.path}
                  onClick={onNavigate}
                  className={`group relative flex h-10 items-center gap-2.5 rounded-xl px-3 text-[12px] font-semibold transition-all duration-200 ${
                    active
                      ? "bg-[#FEF2F2] text-[#B91C1C]"
                      : "text-[#4B5563] hover:bg-[#F9FAFB] hover:text-[#B91C1C]"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 h-7 w-1 rounded-r-full bg-[#B91C1C]" />
                  )}

                  <Icon
                    size={17}
                    strokeWidth={active ? 2.3 : 1.9}
                    className="shrink-0 transition-transform duration-200 group-hover:scale-105"
                  />

                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarUserFooter({ user, onLogout }) {
  return (
    <div className="border-t border-[#E5E7EB] p-3">
      <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
        <p className="truncate text-[12px] font-semibold text-[#1F2937]">
          {user.name}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-[#6B7280]">
          {user.position}
        </p>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-[11px] font-semibold text-[#B91C1C] transition hover:bg-[#F9FAFB]"
      >
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}
