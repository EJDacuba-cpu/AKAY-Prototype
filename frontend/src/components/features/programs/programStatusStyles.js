/**
 * Shared status-pill styling for Community Programs, matching the tone
 * palette already used for Care Tracking / health-record outcomes.
 */
export const PROGRAM_STATUS_STYLES = Object.freeze({
  Upcoming: "border-[#E5E7EB] bg-[#F8FAFC] text-[#475569]",
  Ongoing: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  "Awaiting Completion": "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]",
  Completed: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
  Cancelled: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
});

/** The BHC Programs page's four tabs - "Closed" groups Completed + Cancelled. */
export const PROGRAM_STATUS_TABS = Object.freeze([
  { key: "Upcoming", label: "Upcoming", statuses: ["Upcoming"] },
  { key: "Ongoing", label: "Ongoing", statuses: ["Ongoing"] },
  { key: "Awaiting Completion", label: "Awaiting Completion", statuses: ["Awaiting Completion"] },
  { key: "Closed", label: "Closed", statuses: ["Completed", "Cancelled"] },
]);

export function getProgramStatusStyle(status) {
  return PROGRAM_STATUS_STYLES[status] || PROGRAM_STATUS_STYLES.Upcoming;
}
