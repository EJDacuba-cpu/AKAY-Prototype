import {
  Activity,
  Boxes,
  CalendarDays,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutGrid,
  QrCode,
  Users,
} from "lucide-react";

export const LOGO_SRC = "/akay-logo-only.svg";

export const reportNavItems = [
  { label: "Referral Reports", slug: "referrals" },
  { label: "Family Planning", slug: "family-planning" },
  { label: "EPI Target Client List", slug: "epi-target-client-list" },
  { label: "Morbidity / Notifiable Diseases", slug: "morbidity" },
  { label: "Follow-ups / Monitoring", slug: "follow-ups" },
  { label: "NCD Monitoring", slug: "ncd" },
  { label: "Maternal / Prenatal", slug: "maternal" },
];

export function createReportChildren(basePath) {
  return reportNavItems.map((item) => ({
    ...item,
    path: `${basePath}/${item.slug}`,
  }));
}

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
      items: [{ label: "Users", path: "/admin/users", icon: Users }],
    },
    {
      section: "Accountability",
      items: [
        {
          label: "Password Resets",
          path: "/admin/password-reset-requests",
          icon: KeyRound,
        },
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
        {
          label: "Reports",
          path: "/bhc/reports",
          icon: FileText,
        },
      ],
    },
  ],
  rhu: [
    {
      section: "Overview",
      items: [{ label: "Dashboard", path: "/rhu/dashboard", icon: LayoutGrid }],
    },
    {
      section: "Referrals",
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
          path: "/rhu/doctor-availability",
          icon: CalendarDays,
        },
      ],
    },
    {
      section: "Operations",
      items: [
        {
          label: "Medicine Availability",
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
