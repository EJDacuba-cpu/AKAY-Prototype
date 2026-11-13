import {
  Activity,
  Boxes,
  CalendarDays,
  ClipboardList,
  FileText,
  House,
  LayoutGrid,
  Users,
} from "lucide-react";
import { REPORT_SIDEBAR_ITEMS } from "../../../utils/reportNavigation.js";

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
      items: [
        {
          label: "Accounts",
          path: "/admin/account-management",
          icon: Users,
          defaultPath: "/admin/users",
          children: [
            { label: "Account Directory", path: "/admin/users" },
            { label: "Reset Requests", path: "/admin/password-reset-requests" },
            { label: "Invites", path: "/admin/account-invites" },
          ],
        },
        { label: "Facilities", path: "/admin/facilities", icon: Boxes },
        { label: "Staff Assignments", path: "/admin/staff-assignments", icon: CalendarDays },
      ],
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
        {
          label: "Patients",
          path: "/bhc/patients",
          icon: Users,
          defaultPath: "/bhc/patients",
          children: [
            { label: "All Patients", path: "/bhc/patients?view=patients" },
            {
              label: "Monitoring Requests",
              path: "/bhc/patients?view=monitoring-requests",
            },
          ],
        },
        { label: "Households", path: "/bhc/families", icon: House },
        {
          label: "Follow-ups",
          path: "/bhc/follow-ups",
          icon: CalendarDays,
        },
        {
          label: "Referrals",
          path: "/bhc/referrals",
          icon: ClipboardList,
          defaultPath: "/bhc/referrals",
          children: [
            { label: "Sent Referrals", path: "/bhc/referrals?view=sent" },
            {
              label: "Waiting to Submit",
              path: "/bhc/referrals?view=waiting",
            },
          ],
        },
      ],
    },
    {
      section: "Coordination",
      items: [
        {
          label: "Medicine and Supply",
          path: "/bhc/medicine-availability",
          icon: Boxes,
        },
        {
          label: "Reports",
          path: "/bhc/reports",
          icon: FileText,
          defaultPath: "/bhc/reports?type=overview",
          children: REPORT_SIDEBAR_ITEMS.map((item) => ({
            label: item.label,
            path: `/bhc/reports?type=${item.slug}`,
          })),
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
      section: "Patient Intake",
      items: [
        {
          label: "Patient Intake",
          path: "/rhu/patient-intake",
          icon: ClipboardList,
          defaultPath: "/rhu/incoming-referrals",
          children: [
            { label: "Incoming Referrals", path: "/rhu/incoming-referrals" },
            { label: "Visit Check-in", path: "/rhu/walk-in-check-in" },
          ],
        },
      ],
    },
    {
      section: "Clinical Records",
      items: [
        {
          label: "Patients",
          path: "/rhu/patients",
          icon: Users,
          defaultPath: "/rhu/patients",
          children: [
            { label: "Today's Queue", path: "/rhu/patients?view=queue" },
            { label: "All Patients", path: "/rhu/patients?view=all" },
          ],
        },
        {
          label: "Follow-ups",
          path: "/rhu/follow-ups",
          icon: CalendarDays,
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
          label: "Medicine and Supply",
          path: "/rhu/medicine-and-supply",
          icon: Boxes,
          defaultPath: "/rhu/medicine-management",
          children: [
            { label: "Inventory", path: "/rhu/medicine-management", hideWhenDenied: true },
            { label: "To Dispense", path: "/rhu/to-dispense", hideWhenDenied: true },
          ],
        },
        {
          label: "Reports",
          path: "/rhu/reports",
          icon: Activity,
          defaultPath: "/rhu/reports?type=overview",
          children: REPORT_SIDEBAR_ITEMS.map((item) => ({
            label: item.label,
            path: `/rhu/reports?type=${item.slug}`,
          })),
        },
      ],
    },
  ],
};

export const roleLabel = {
  admin: "Admin",
  bhc: "BHC Staff",
  rhu: "RHU Staff",
};
