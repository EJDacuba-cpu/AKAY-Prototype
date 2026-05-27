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

/* AKAY HEALTHCARE BRAND SYSTEM (Red & White) */

/* MENU CONFIGURATION */

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
        {
          label: "Doctor Schedule",
          path: "/admin/doctor-schedule",
          icon: CalendarDays,
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
        { label: "Notifications", path: "/bhc/notifications", icon: Bell },
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
        {
          label: "Feedback / Return Slip",
          path: "/rhu/feedback",
          icon: FileText,
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

export default function DashboardLayout({ role, title, children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuSections = menuByRole[role] || [];

  const user = getCurrentUser() || {
    name: "AKAY User",
    position: "Authorized Personnel",
    facility: "Bulakan, Bulacan",
  };

  function handleLogout() {
    logoutUser();
    navigate("/login");
  }

  function isMenuActive(path) {
    if (location.pathname === path) return true;
    const dashboardPath = `/${role}/dashboard`;
    if (path === dashboardPath) return false;
    return location.pathname.startsWith(path);
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#FAFAFA] text-[#1F2937]">
      {/* Subtle Red Background Glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(153,27,27,0.03),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(185,28,28,0.03),transparent_40%)]" />

      {/* Hide Scrollbar Utility */}
      <style>{`
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
      `}</style>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* SIDEBAR — narrowed from w-72 to w-56 (224px) */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-56 flex-col border-r border-[#F3F4F6] bg-white shadow-xl shadow-black/5 backdrop-blur transition-transform duration-300
        ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo — reduced height */}
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

          {/* Mobile Close */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7280] transition-all hover:bg-[#FEF2F2] lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation — tighter spacing */}
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
                      className={`group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 text-[11px] font-medium transition-all duration-200
                        ${
                          active
                            ? "bg-[#991B1B] text-white shadow-lg shadow-red-900/20"
                            : "text-[#4B5563] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                        }`}
                    >
                      {/* Active Indicator */}
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

        {/* User Panel — more compact */}
        <div className="border-t border-[#FEE2E2] p-3">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-[#1F2937]">
                {user.name}
              </p>
              <p className="truncate text-[9px] text-[#9CA3AF]">
                {user.position}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] py-2 text-[10px] font-semibold text-[#991B1B] transition-all hover:bg-[#FEE2E2]"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA — matches sidebar width */}
      <main className="flex h-screen flex-col lg:ml-56">
        {/* TOPBAR — reduced padding & height */}
        <header className="flex-shrink-0 border-b border-[#F3F4F6] bg-white/90 backdrop-blur-xl">
          <div className="flex h-12 items-center justify-between px-3 sm:px-5 lg:px-5">
            {/* Left Side */}
            <div className="flex items-center gap-2.5">
              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#F3F4F6] bg-white text-[#991B1B] shadow-sm transition-all hover:bg-[#FEF2F2] lg:hidden"
              >
                <Menu size={16} />
              </button>

              <div>
                <h2 className="truncate text-base font-bold tracking-tight text-[#1F2937]">
                  {title}
                </h2>
              </div>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-2">
              {/* Facility Badge */}
              <div className="hidden items-center gap-1.5 rounded-xl border border-[#F3F4F6] bg-white px-2.5 py-1.5 shadow-sm sm:flex">
                <MapPin size={12} className="text-[#991B1B]" />
                <span className="max-w-[160px] truncate text-[10px] font-semibold text-[#4B5563]">
                  {user.facility}
                </span>
              </div>

              {/* Role Badge — compact inline label */}
              <span className="hidden rounded-xl border border-[#F3F4F6] bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#6B7280] shadow-sm md:inline-block">
                {roleLabel[role]}
              </span>

              {/* Notification Bell */}
              <button className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-[#F3F4F6] bg-white text-[#6B7280] shadow-sm transition-all hover:bg-[#FEF2F2] hover:text-[#991B1B]">
                <Bell size={14} />

                {/* Red Ping Dot */}
                <span className="absolute right-1 top-1 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT — fills remaining height, scrolls internally */}
        <section className="akay-content-scroll flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-5">
          {children}
        </section>
      </main>
    </div>
  );
}
