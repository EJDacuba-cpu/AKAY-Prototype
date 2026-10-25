// Display logic for the RHU Today's Queue. Pure: the table and the page stay thin.

import { newCheckInKey } from './walkInRegistration.js';

const ZONE = 'Asia/Manila';
const TIME = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' });
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_LABEL = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, month: 'short', day: 'numeric' });
const SEX_LETTER = { male: 'M', female: 'F', other: 'O' };

/** "Just arrived", "65 min", "2 h 5 min". */
export function formatWaiting(minutes) {
  const total = Math.floor(Number(minutes));
  if (!Number.isFinite(total) || total < 1) return 'Just arrived';
  if (total < 120) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function titleCase(value) {
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** "Waiting 65 min", or just "Just arrived" for the first minute. */
function waitingNote(minutes) {
  const text = formatWaiting(minutes);
  return text === 'Just arrived' ? text : `Waiting ${text}`;
}

/**
 * One check-in key per patient: a retry for the same patient keeps its key (so the server recognises it),
 * a different patient gets a fresh one (so a lost answer for A can never block B).
 */
export function walkInKeyFor(current, patientId, makeId) {
  return current && current.patientId === patientId ? current : { patientId, key: newCheckInKey(makeId) };
}

/** Waiting and in-consultation are the chips Phase 5 knows; anything else stays a neutral fallback. */
export function statusChip(status) {
  const raw = String(status ?? '').trim();
  if (raw === 'waiting') return { label: 'Waiting', tone: 'info' };
  if (raw === 'in_consultation') return { label: 'In Consultation', tone: 'info' };
  if (raw === 'closed') return { label: 'Closed', tone: 'neutral' };
  return { label: raw === '' ? 'Unknown' : titleCase(raw), tone: 'neutral' };
}

export const CLOSE_REASONS = [
  { value: 'left_before_consultation', label: 'Left before consultation' },
  { value: 'checked_in_by_mistake', label: 'Checked in by mistake' },
  { value: 'other', label: 'Other' },
];

/**
 * ⋯ menu items for one queue row (D8). Discard is Phase 6. Hidden duties are omitted, not disabled.
 * `onClick` is attached by the table; this only decides labels and which action they fire.
 */
export function queueRowActions(row, { canEncode = false, canClose = false } = {}) {
  const actions = [];
  if (row?.statusKey === 'waiting' && canEncode) {
    actions.push({ label: 'Start consultation', action: 'start' });
  }
  if (row?.statusKey === 'in_consultation' && canEncode) {
    actions.push({ label: 'Resume consultation', action: 'resume' });
  }
  if (row?.patientId) {
    actions.push({ label: 'Open patient record', to: `/rhu/patients/${row.patientId}` });
  }
  if (row?.statusKey === 'waiting' && canClose) {
    actions.push({ label: 'Close visit', action: 'close' });
  }
  return actions;
}

/** "61 · M", "F" or "" — the same wording in the queue and in the check-in results. */
export function formatAgeSex(patient) {
  const sex = SEX_LETTER[String(patient?.sex ?? '').toLowerCase()] ?? '';
  const age = patient?.age;
  const hasAge = age !== undefined && age !== null && age !== '';
  if (hasAge && sex) return `${age} · ${sex}`;
  if (hasAge) return String(age);
  return sex;
}

const MIN_SEARCH_LENGTH = 2;

/** A check-in search below two visible characters would list half the directory. */
export function isSearchable(query) {
  return String(query ?? '').trim().length >= MIN_SEARCH_LENGTH;
}

/** API visits (server order) to display rows. `now` fixes "today" for the carried-over marker. */
export function queueRows(visits, now = new Date()) {
  const today = DAY_KEY.format(now);
  return (visits ?? []).map((visit, index) => {
    const arrived = new Date(visit.checked_in_at);
    // An unreadable arrival time must not take the whole table down.
    const hasArrival = visit.checked_in_at != null && !Number.isNaN(arrived.getTime());
    const carriedOver = hasArrival && DAY_KEY.format(arrived) < today;
    const bhc = visit.referral?.sending_bhc;
    return {
      id: visit.id,
      number: index + 1,
      patientId: visit.patient?.id,
      name: visit.patient?.full_name ?? '',
      ageSex: formatAgeSex(visit.patient),
      source: visit.source,
      sourceLabel: visit.source === 'referral' ? 'Referred' : 'Walk-in',
      fromLabel: visit.source === 'referral' && bhc ? `From ${bhc}` : null,
      arrivedTime: hasArrival ? TIME.format(arrived) : '—',
      carriedOver,
      arrivalNote: carriedOver
        ? `From ${DAY_LABEL.format(arrived)} · still open`
        : waitingNote(visit.waiting_minutes),
      statusKey: visit.status ?? '',
      status: statusChip(visit.status),
    };
  });
}

/** Every search token must appear in the name; `source` is 'all', 'referral' or 'walk_in'. */
export function filterQueueRows(rows, { search = '', source = 'all' } = {}) {
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (source !== 'all' && row.source !== source) return false;
    const name = row.name.toLowerCase();
    return tokens.every((token) => name.includes(token));
  });
}
