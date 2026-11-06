// Walk-in Check-in: what to show when the selected patient has Pending BHC referrals.
// Pure view model. Does not change referral status or pick one referral out of many.

const TITLE = 'Pending BHC Referral';
const VERIFY = 'Arrival must be verified via Incoming Referrals.';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rowsFrom(pending) {
  const referrals = Array.isArray(pending?.referrals) ? pending.referrals : [];
  return referrals.map((row) => ({
    trackingId: text(row?.tracking_id),
    sendingBhc: text(row?.sending_bhc),
  }));
}

function declaredCount(pending) {
  const count = Number(pending?.count);
  if (!Number.isFinite(count) || count < 0) return 0;
  return count;
}

function uniqueNames(rows) {
  const seen = new Set();
  const names = [];
  for (const row of rows) {
    if (!row.sendingBhc || seen.has(row.sendingBhc)) continue;
    seen.add(row.sendingBhc);
    names.push(row.sendingBhc);
  }
  return names;
}

function listNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function noticeBody(rows) {
  const names = uniqueNames(rows);
  if (rows.length <= 1) {
    const who = names[0]
      ? `This patient was referred by ${names[0]}`
      : 'This patient has a pending BHC referral';
    const tracking = rows[0]?.trackingId;
    const id = tracking ? ` (${tracking})` : '';
    return `${who}${id}. ${VERIFY}`;
  }
  if (names.length === 0) {
    return `This patient has pending BHC referrals. ${VERIFY}`;
  }
  return `This patient has pending referrals from ${listNames(names)}. ${VERIFY}`;
}

function referralHref(trackingId) {
  return `/rhu/referrals/${encodeURIComponent(trackingId)}`;
}

const OPEN_CONFIRM = Object.freeze({
  blocked: false,
  title: '',
  body: '',
  statusLabel: 'Ready to check in',
  links: [],
});

/**
 * CTA for pending referrals on the walk-in desk.
 * `count > 0` blocks Confirm Check-in. Every referral with a tracking id gets its own detail link.
 * @param {{ count?: number, referrals?: Array<{ tracking_id?: string, sending_bhc?: string|null }> } | null | undefined} pending
 */
export function walkInReferralCta(pending) {
  const rows = rowsFrom(pending);
  const blocked = declaredCount(pending) > 0 || rows.length > 0;
  if (!blocked) return OPEN_CONFIRM;

  const links = rows
    .filter((row) => row.trackingId)
    .map((row) => ({
      trackingId: row.trackingId,
      sendingBhc: row.sendingBhc || 'Referring BHC',
      href: referralHref(row.trackingId),
      label: 'View Incoming Referral',
    }));

  return {
    blocked: true,
    title: TITLE,
    body: rows.length === 0
      ? `This patient has a pending BHC referral. ${VERIFY}`
      : noticeBody(rows),
    statusLabel: TITLE,
    links,
  };
}
