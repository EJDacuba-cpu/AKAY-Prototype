import { useState } from "react";
import {
  Activity,
  Bell,
  Boxes,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  QrCode,
  Users,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { getCurrentUser, logoutUser } from "../../utils/auth";
import { useNotifications } from "../../hooks/useNotificationsContext";
import NotificationDropdown from "../features/notifications/NotificationDropdown";
import NotificationModal from "../features/notifications/NotificationModal";

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
      items: [
        { label: "User Management", path: "/admin/users", icon: Users },
        {
          label: "Doctor Management",
          path: "/admin/doctors",
          icon: HeartPulse,
        },
      ],
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <div className="relative h-screen overflow-hidden bg-[#FAFAFA] text-[#1F2937]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(153,27,27,0.03),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(185,28,28,0.03),transparent_40%)]" />
      <style>
        {`.akay-sidebar-scroll{scrollbar-width:none;-ms-overflow-style:none}.akay-sidebar-scroll::-webkit-scrollbar{display:none}.akay-content-scroll{scrollbar-width:thin;scrollbar-color:#E5E7EB transparent}.akay-content-scroll::-webkit-scrollbar{width:5px}.akay-content-scroll::-webkit-scrollbar-track{background:transparent}.akay-content-scroll::-webkit-scrollbar-thumb{background-color:#D1D5DB;border-radius:999px}`}
      </style>

      {/* Sidebar — only renders when hideSidebar is false */}
      {!hideSidebar && (
        <>
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
            />
          )}

          <aside
            className={`fixed left-0 top-0 z-40 flex h-full w-56 flex-col border-r border-[#F3F4F6] bg-white shadow-xl shadow-black/5 transition-transform duration-300 ${
              sidebarOpen
                ? "translate-x-0"
                : "-translate-x-full lg:translate-x-0"
            }`}
          >
            <div className="flex h-14 items-center justify-between border-b border-[#FEE2E2] px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#991B1B] to-[#7F1D1D] shadow-lg shadow-red-900/20">
                  <span className="text-xs font-black tracking-tight text-white">
                    AK
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold tracking-tight text-[#991B1B]">
                    AKAY
                  </p>
                  <p className="text-[8px] uppercase tracking-[0.16em] text-[#9CA3AF]">
                    Health Coordination
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7280] hover:bg-[#FEF2F2] lg:hidden"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="akay-sidebar-scroll flex-1 overflow-y-auto px-2.5 py-3">
              {menuSections.map((section) => (
                <div key={section.section} className="mb-4">
                  <p className="mb-1.5 px-2.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#991B1B] opacity-70">
                    {section.section}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isMenuActive(item.path);
                      return (
                        <Link
                          key={item.label}
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 text-[11px] font-medium transition-all duration-200 ${
                            active
                              ? "bg-[#991B1B] text-white shadow-lg shadow-red-900/20"
                              : "text-[#4B5563] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                          }`}
                        >
                          {active && (
                            <div className="absolute left-0 top-0 h-full w-0.5 rounded-r-full bg-[#FECACA]" />
                          )}
                          <Icon size={15} strokeWidth={active ? 2.3 : 1.8} />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="border-t border-[#FEE2E2] p-3">
              <p className="truncate text-[11px] font-semibold text-[#1F2937]">
                {user.name}
              </p>
              <p className="truncate text-[9px] text-[#9CA3AF]">
                {user.position}
              </p>
              <button
                onClick={handleLogout}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] py-2 text-[10px] font-semibold text-[#991B1B] hover:bg-[#FEE2E2]"
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Main content — offset only when sidebar is visible */}
      <main
        className={`flex h-screen flex-col ${hideSidebar ? "" : "lg:ml-56"}`}
      >
        <header className="relative z-50 flex-shrink-0 border-b border-[#F3F4F6] bg-white/90 backdrop-blur-xl">
          <div className="flex h-12 items-center justify-between px-3 sm:px-5">
            <div className="flex items-center gap-2.5">
              {/* Hamburger — only when sidebar exists */}
              {!hideSidebar && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#F3F4F6] bg-white text-[#991B1B] shadow-sm hover:bg-[#FEF2F2] lg:hidden"
                >
                  <Menu size={16} />
                </button>
              )}
              <h2 className="truncate text-base font-bold tracking-tight text-[#1F2937]">
                {title}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 rounded-xl border border-[#F3F4F6] bg-white px-2.5 py-1.5 shadow-sm sm:flex">
                <MapPin size={12} className="text-[#991B1B]" />
                <span className="max-w-[140px] truncate text-[10px] font-semibold text-[#4B5563]">
                  {user.facility}
                </span>
              </div>
              <span className="hidden rounded-xl border border-[#F3F4F6] bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#6B7280] shadow-sm md:inline-block">
                {roleLabel[role]}
              </span>

              <div className="relative z-[100]">
                <button
                  onClick={() => setIsNotifOpen((prev) => !prev)}
                  className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-[#F3F4F6] bg-white text-[#6B7280] shadow-sm hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                >
                  <Bell size={14} />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#991B1B] text-[8px] font-bold text-white ring-2 ring-white">
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
