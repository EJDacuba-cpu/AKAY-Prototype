// Visit Check-in Visit Review: one status + one primary action from queue,
// referral, and follow-up eligibility. Pure view model; no API writes.

import { walkInReferralCta } from './walkInReferralCta.js';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatDueDate(value) {
  const raw = text(value);
  if (!raw) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return raw;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(match[2]) - 1];
  if (!month) return raw;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

function followUpRows(followUps) {
  const rows = Array.isArray(followUps?.follow_ups) ? followUps.follow_ups : [];
  return rows.map((row) => ({
    id: row?.id ?? null,
    dueDate: text(row?.due_date),
    state: text(row?.state),
    isOverdue: Boolean(row?.is_overdue),
  }));
}

function followUpSummary(rows) {
  if (rows.length === 0) return { label: '', detail: '' };
  const overdue = rows.filter((row) => row.isOverdue);
  const pending = rows.filter((row) => !row.isOverdue);
  const label = overdue.length > 0 && pending.length === 0
    ? 'Overdue Follow-up'
    : overdue.length > 0
      ? 'Pending Follow-up'
      : 'Pending Follow-up';

  if (rows.length === 1) {
    const due = formatDueDate(rows[0].dueDate);
    const detail = rows[0].isOverdue
      ? (due ? `Overdue · due ${due}` : 'Overdue')
      : (due ? `Due ${due}` : 'Pending');
    return { label: rows[0].isOverdue ? 'Overdue Follow-up' : 'Pending Follow-up', detail };
  }

  const parts = [];
  if (overdue.length > 0) {
    parts.push(`${overdue.length} overdue`);
  }
  if (pending.length > 0) {
    parts.push(`${pending.length} pending`);
  }
  const dues = rows
    .map((row) => formatDueDate(row.dueDate))
    .filter(Boolean);
  const duePart = dues.length > 0 ? ` · ${dues.join(', ')}` : '';
  return {
    label: overdue.length === rows.length ? 'Overdue Follow-up' : label,
    detail: `${parts.join(', ')}${duePart}`,
  };
}

function referralDetail(cta) {
  const names = [];
  const seen = new Set();
  for (const link of cta.links || []) {
    const name = text(link.sendingBhc);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length > 2) {
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }
  return '';
}

/**
 * @param {{
 *   alreadyInQueue?: boolean,
 *   loading?: boolean,
 *   error?: string,
 *   pendingReferrals?: { count?: number, referrals?: Array<object> } | null,
 *   pendingFollowUps?: { count?: number, follow_ups?: Array<object> } | null,
 * }} input
 */
export function visitCheckInReview(input = {}) {
  const alreadyInQueue = Boolean(input.alreadyInQueue);
  if (alreadyInQueue) {
    return {
      kind: 'already_in_queue',
      statusLabel: "Already in Today's Queue",
      statusDetail: '',
      followUpDetail: '',
      canConfirm: false,
      referralLinks: [],
      error: '',
      loading: false,
    };
  }

  if (input.loading) {
    return {
      kind: 'loading',
      statusLabel: 'Checking visit records...',
      statusDetail: '',
      followUpDetail: '',
      canConfirm: false,
      referralLinks: [],
      error: '',
      loading: true,
    };
  }

  const error = text(input.error);
  if (error) {
    return {
      kind: 'error',
      statusLabel: 'Visit records check failed',
      statusDetail: '',
      followUpDetail: '',
      canConfirm: false,
      referralLinks: [],
      error,
      loading: false,
    };
  }

  const referralCta = walkInReferralCta(input.pendingReferrals);
  const followUps = followUpRows(input.pendingFollowUps);
  const followUp = followUpSummary(followUps);

  if (referralCta.blocked) {
    return {
      kind: 'pending_referral',
      statusLabel: 'Pending BHC Referral',
      statusDetail: referralDetail(referralCta),
      followUpDetail: followUp.detail
        ? `${followUp.label}${followUp.detail ? ` · ${followUp.detail}` : ''}`
        : '',
      canConfirm: false,
      referralLinks: referralCta.links,
      error: '',
      loading: false,
    };
  }

  if (followUps.length > 0) {
    return {
      kind: followUps.every((row) => row.isOverdue) ? 'overdue_follow_up' : 'pending_follow_up',
      statusLabel: followUp.label,
      statusDetail: followUp.detail,
      followUpDetail: '',
      canConfirm: true,
      referralLinks: [],
      error: '',
      loading: false,
    };
  }

  return {
    kind: 'ready',
    statusLabel: 'Ready for Check-in',
    statusDetail: '',
    followUpDetail: '',
    canConfirm: true,
    referralLinks: [],
    error: '',
    loading: false,
  };
}
