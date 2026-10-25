// Display logic for the RHU Today's Queue. Pure: the table and the page stay thin.

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

/** Waiting is the one status Phase 4 knows; later phases add theirs and fall back to a neutral chip until then. */
export function statusChip(status) {
  const raw = String(status ?? '').trim();
  if (raw === 'waiting') return { label: 'Waiting', tone: 'info' };
  return { label: raw === '' ? 'Unknown' : titleCase(raw), tone: 'neutral' };
}

function ageSex(patient) {
  const sex = SEX_LETTER[String(patient?.sex ?? '').toLowerCase()] ?? '';
  const age = patient?.age;
  const hasAge = age !== undefined && age !== null && age !== '';
  if (hasAge && sex) return `${age} · ${sex}`;
  if (hasAge) return String(age);
  return sex;
}

/** API visits (server order) to display rows. `now` fixes "today" for the carried-over marker. */
export function queueRows(visits, now = new Date()) {
  const today = DAY_KEY.format(now);
  return (visits ?? []).map((visit, index) => {
    const arrived = new Date(visit.checked_in_at);
    const carriedOver = DAY_KEY.format(arrived) < today;
    const bhc = visit.referral?.sending_bhc;
    return {
      id: visit.id,
      number: index + 1,
      patientId: visit.patient?.id,
      name: visit.patient?.full_name ?? '',
      ageSex: ageSex(visit.patient),
      source: visit.source,
      sourceLabel: visit.source === 'referral' ? 'Referred' : 'Walk-in',
      fromLabel: visit.source === 'referral' && bhc ? `From ${bhc}` : null,
      arrivedTime: TIME.format(arrived),
      carriedOver,
      arrivalNote: carriedOver
        ? `From ${DAY_LABEL.format(arrived)} · still open`
        : `Waiting ${formatWaiting(visit.waiting_minutes)}`,
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
