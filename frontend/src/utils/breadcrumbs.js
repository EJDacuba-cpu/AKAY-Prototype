import { matchPath } from "react-router";

// Parent trails for nested pages. The last crumb is always the page's own
// `title`, so this map only lists ancestors. Legacy /rhu/rhu-* aliases redirect
// to the canonical routes below, so they are intentionally absent.
const PARENT_TRAILS = [
  // Admin
  ["/admin/users/add", [{ label: "Users", path: "/admin/users" }]],
  ["/admin/doctors/add", [{ label: "Users", path: "/admin/users" }]],

  // Barangay Health Center
  ["/bhc/patients/add", [{ label: "Patients", path: "/bhc/patients" }]],
  ["/bhc/patients/:patientId", [{ label: "Patients", path: "/bhc/patients" }]],
  [
    "/bhc/health-records/add",
    [{ label: "Health Records", path: "/bhc/health-records" }],
  ],
  [
    "/bhc/health-records/:recordId",
    [{ label: "Health Records", path: "/bhc/health-records" }],
  ],
  ["/bhc/follow-ups/:taskId", [{ label: "Follow-ups", path: "/bhc/follow-ups" }]],
  ["/bhc/referrals/create", [{ label: "Referrals", path: "/bhc/referrals" }]],
  ["/bhc/referrals/:trackingId", [{ label: "Referrals", path: "/bhc/referrals" }]],
  ["/bhc/reports/:reportSlug", [{ label: "Reports", path: "/bhc/reports" }]],

  // Rural Health Unit
  ["/rhu/patients/add", [{ label: "Patients", path: "/rhu/patients" }]],
  ["/rhu/patients/:patientId", [{ label: "Patients", path: "/rhu/patients" }]],
  [
    "/rhu/health-records/add",
    [{ label: "Health Records", path: "/rhu/health-records" }],
  ],
  [
    "/rhu/health-records/:recordId",
    [{ label: "Health Records", path: "/rhu/health-records" }],
  ],
  [
    "/rhu/referrals/:trackingId",
    [{ label: "Incoming Referrals", path: "/rhu/incoming-referrals" }],
  ],
  [
    "/rhu/feedback/:trackingId",
    [{ label: "Incoming Referrals", path: "/rhu/incoming-referrals" }],
  ],
  [
    "/rhu/medicine-management/add",
    [{ label: "Medicine Management", path: "/rhu/medicine-management" }],
  ],
];

/**
 * Returns [{ label, path? }] for the top bar. Ancestors carry a `path` (link);
 * the final crumb is the current page and has none.
 */
export function getBreadcrumbs(pathname, title) {
  const current = { label: title };
  const match = PARENT_TRAILS.find(([pattern]) =>
    matchPath({ path: pattern, end: true }, pathname),
  );

  return match ? [...match[1], current] : [current];
}
