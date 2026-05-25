import { useState } from "react";

import {
  Activity,
  Bell,
  Boxes,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  QrCode,
  Users,
  X,
} from "lucide-react";

import { Link, useLocation, useNavigate } from "react-router";

/* ─────────────────────────────────────────────
   AKAY HEALTHCARE BRAND SYSTEM (Red & White)
───────────────────────────────────────────── */

const COLORS = {
  /* Primary Healthcare Red */
  primary: "#991B1B",
  primaryDark: "#7F1D1D",

  /* Background System */
  softBg: "#FAFAFA",
  softHover: "#FEF2F2" /* Very faint red tint */,
  softAccent: "#FECACA" /* Soft red border */,

  /* Borders */
  border: "#F3F4F6",

  /* Typography */
  textPrimary: "#1F2937",
  textSecondary: "#6B7280",
};

/* ─────────────────────────────────────────────
   MENU CONFIGURATION
───────────────────────────────────────────── */

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

  const user = JSON.parse(localStorage.getItem("akay_user")) || {
    name: "AKAY User",
    position: "Authorized Personnel",
    facility: "Bulakan, Bulacan",
  };

  function handleLogout() {
    localStorage.removeItem("akay_user");
    navigate("/login");
  }

  function isMenuActive(path) {
    if (location.pathname === path) return true;
    const dashboardPath = `/${role}/dashboard`;
    if (path === dashboardPath) return false;
    return location.pathname.startsWith(path);
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#FAFAFA] text-[#1F2937]">
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
      `}</style>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-72 flex-col border-r border-[#F3F4F6] bg-white shadow-xl shadow-black/5 backdrop-blur transition-transform duration-300
        ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex h-[72px] items-center justify-between border-b border-[#FEE2E2] px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#991B1B] to-[#7F1D1D] shadow-lg shadow-red-900/20">
              <span className="text-sm font-black tracking-tight text-white">
                AK
              </span>
            </div>

            <div>
              <p className="text-[15px] font-bold tracking-tight text-[#991B1B]">
                AKAY
              </p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-[#9CA3AF]">
                Health Coordination
              </p>
            </div>
          </div>

          {/* Mobile Close */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6B7280] transition-all hover:bg-[#FEF2F2] lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="akay-sidebar-scroll flex-1 overflow-y-auto px-3 py-5">
          {menuSections.map((section) => (
            <div key={section.section} className="mb-6">
              <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#991B1B] opacity-70">
                {section.section}
              </p>

              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isMenuActive(item.path);

                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 text-[12px] font-medium transition-all duration-200
                        ${
                          active
                            ? "bg-[#991B1B] text-white shadow-lg shadow-red-900/20"
                            : "text-[#4B5563] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                        }`}
                    >
                      {/* Active Indicator */}
                      {active && (
                        <div className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-[#FECACA]" />
                      )}

                      <Icon size={18} strokeWidth={active ? 2.3 : 1.8} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Panel */}
        <div className="border-t border-[#FEE2E2] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 ">
              <p className="truncate text-[13px] font-semibold text-[#1F2937]">
                {user.name}
              </p>
              <p className="truncate text-[10px] text-[#9CA3AF]">
                {user.position}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] py-3 text-[11px] font-semibold text-[#991B1B] transition-all hover:bg-[#FEE2E2]"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="min-h-screen lg:ml-72">
        {/* TOPBAR */}
        <header className="sticky top-0 z-20 border-b border-[#F3F4F6] bg-white/90 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            {/* Left Side */}
            <div className="flex items-center gap-3">
              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#F3F4F6] bg-white text-[#991B1B] shadow-sm transition-all hover:bg-[#FEF2F2] lg:hidden"
              >
                <Menu size={18} />
              </button>

              <div>
                <h2 className="truncate text-[22px] font-bold tracking-tight text-[#1F2937]">
                  {title}
                </h2>
                <p className="mt-0.5 text-[11px] font-medium text-[#9CA3AF]">
                  {roleLabel[role]}
                </p>
              </div>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-3">
              {/* Facility Badge */}
              <div className="hidden items-center gap-2 rounded-2xl border border-[#F3F4F6] bg-white px-3 py-2 shadow-sm sm:flex">
                <MapPin size={14} className="text-[#991B1B]" />
                <span className="max-w-[190px] truncate text-[11px] font-semibold text-[#4B5563]">
                  {user.facility}
                </span>
              </div>

              {/* Notification Bell */}
              <button className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-[#F3F4F6] bg-white text-[#6B7280] shadow-sm transition-all hover:bg-[#FEF2F2] hover:text-[#991B1B]">
                <Bell size={17} />

                {/* Red Ping Dot */}
                <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <section className="w-full overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {children}
        </section>
      </main>
    </div>
  );
}
