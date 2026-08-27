/**
 * Referral attention level - single source of truth (URG-01..URG-06).
 *
 * There are exactly two legal values: Routine and Priority. The retired
 * four-value scheme (Low / Normal / Urgent / Emergency) is replaced outright,
 * not mapped forward - no legacy field, no compatibility alias.
 *
 * Matching is EXACT, never substring. The retired mappers used
 * String(v).includes("urgent"), which matched both "Urgent" and "Non-Urgent"
 * and silently stored routine referrals as urgent. With two legal values there
 * is nothing to fuzzy-match, and an unrecognised value degrades to Routine
 * rather than being misread as Priority.
 *
 * Copy describes workflow handling only. URG-04 forbids presenting Priority as
 * an emergency, clinical, or triage classification, and SFT-01 forbids
 * automated clinical decision-making, so no description may make a clinical
 * claim about the patient.
 */

export const ATTENTION_ROUTINE = "Routine";
export const ATTENTION_PRIORITY = "Priority";

export const ATTENTION_LEVELS = [ATTENTION_ROUTINE, ATTENTION_PRIORITY];

export const DEFAULT_ATTENTION = ATTENTION_ROUTINE;

/**
 * Exact-match normaliser. Anything unrecognised - empty, stale, or a retired
 * value read off an old record - degrades to Routine.
 */
export function normalizeAttention(value) {
  return ATTENTION_LEVELS.includes(value) ? value : DEFAULT_ATTENTION;
}

export function isPriority(value) {
  return normalizeAttention(value) === ATTENTION_PRIORITY;
}

/**
 * Reads the attention level off a referral-shaped object regardless of which
 * casing the source used (API snake_case vs. normalised camelCase).
 */
export function getReferralAttention(referral = {}) {
  return normalizeAttention(
    referral.urgency_level ?? referral.urgencyLevel ?? referral.attention,
  );
}

/**
 * Options for radio groups and selects. Descriptions state what the receiving
 * RHU does with the referral, never anything about the patient's condition.
 */
export const ATTENTION_OPTIONS = [
  {
    value: ATTENTION_ROUTINE,
    title: ATTENTION_ROUTINE,
    description: "Normal referral processing.",
  },
  {
    value: ATTENTION_PRIORITY,
    title: ATTENTION_PRIORITY,
    description: "Request earlier attention from the receiving RHU.",
  },
];

/**
 * Filter dropdowns. The sentinel keeps the tables' existing visible wording -
 * only the selectable values change under URG-01..URG-06, not the field label.
 */
export const ATTENTION_FILTER_ALL = "All Urgency";

export const ATTENTION_FILTER_OPTIONS = [
  ATTENTION_FILTER_ALL,
  ...ATTENTION_LEVELS,
];

/**
 * Badge palette. Priority is AMBER, not red: red is reserved across AKAY for
 * clinical, destructive and error states, and URG-C-01 records the RHU as a
 * self-described non-emergent facility, so red would misrepresent Priority as
 * an emergency classification.
 *
 * Hex values match the existing StatusBadge palette so attention badges sit
 * consistently beside status badges.
 */
export const ATTENTION_BADGE_STYLES = {
  [ATTENTION_ROUTINE]: {
    bg: "#F1F5F9",
    text: "#475569",
    border: "#CBD5E1",
    dot: "#94A3B8",
  },
  [ATTENTION_PRIORITY]: {
    bg: "#FFFBEB",
    text: "#B45309",
    border: "#FDE68A",
    dot: "#F59E0B",
  },
};

export function getAttentionBadgeStyle(value) {
  return ATTENTION_BADGE_STYLES[normalizeAttention(value)];
}

/** Tailwind class variant, for the tables that style badges with classes. */
export const ATTENTION_BADGE_CLASSES = {
  [ATTENTION_ROUTINE]: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
  [ATTENTION_PRIORITY]: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
};

export function getAttentionBadgeClass(value) {
  return ATTENTION_BADGE_CLASSES[normalizeAttention(value)];
}

export default {
  ATTENTION_ROUTINE,
  ATTENTION_PRIORITY,
  ATTENTION_LEVELS,
  DEFAULT_ATTENTION,
  ATTENTION_OPTIONS,
  ATTENTION_FILTER_ALL,
  ATTENTION_FILTER_OPTIONS,
  normalizeAttention,
  isPriority,
  getReferralAttention,
  getAttentionBadgeStyle,
  getAttentionBadgeClass,
};
