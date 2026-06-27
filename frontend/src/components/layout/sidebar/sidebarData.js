import {
  Activity,
  Boxes,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutGrid,
  QrCode,
  Users,
} from "lucide-react";

export const LOGO_SRC = "/akay-logo-only.png";

export const menuByRole = {
  admin: [
    {
      section: "Overview",
      items: [
        { label: "Dashboard", path: "/admin/dashboard", icon: LayoutGrid },
      ],
    },
    {
      section: "Management",
      items: [{ label: "Account Directory", path: "/admin/users", icon: Users }],
    },
    {
      section: "Accountability",
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
        {
          label: "Follow-ups",
          path: "/bhc/follow-ups",
          icon: CalendarDays,
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
          label: "Doctor Availability",
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

export const roleLabel = {
  admin: "Admin / MHO",
  bhc: "BHC Worker",
  rhu: "RHU Staff",
};
