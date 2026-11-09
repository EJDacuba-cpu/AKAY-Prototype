// Match the rendered tables, including the breakpoints at which real rows become cards.
export const TABLE_SKELETON_PROFILES = {
  table: { columns: 5, minWidth: 760, mobileCards: true },
  accounts: { columns: [30, 24, 27, 13, 6], minWidth: 900, mobileCards: true },
  audit: { columns: 8, minWidth: 1050, mobileCards: false },
  referrals: { columns: 7, minWidth: 1000, mobileCards: false },
  queue: { columns: 6, minWidth: 860, mobileCards: false },
  "access-requests": { columns: 6, rowHeight: 44, headHeight: 36, minWidth: 880, mobileCards: true, desktopBreakpoint: "lg" },
  assignments: { columns: 6, minWidth: 980, mobileCards: true },
  medicine: { columns: [34, 21, 21, 18, 6], minWidth: 0, mobileCards: true },
  dispensing: { columns: 4, minWidth: 0, mobileCards: false, footer: false },
  "health-records": { columns: 6, minWidth: 760, mobileCards: true },
  "profile-referrals": { columns: 5, minWidth: 760, mobileCards: true },
  tcl: { columns: 16, minWidth: 1500, mobileCards: false },
  "family-directory": { columns: 5, minWidth: 720, mobileCards: false, rowHeight: 56 },
};
