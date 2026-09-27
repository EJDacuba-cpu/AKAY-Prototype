export const VISIT_SERVICES = {
  General: 'General Consultation',
  Prenatal: 'Maternal – Prenatal',
  Postpartum: 'Maternal – Postpartum',
  EPI: 'EPI / Immunization',
  'Family Planning': 'Family Planning',
  TB: 'TB DOTS / TB Monitoring',
};

export const TEENAGE_PREGNANCY_MESSAGE = 'Teenage pregnancy: please confirm the patient’s pregnancy status and review the applicable care protocol.';

export function emptyVisitPurpose() {
  return { version: 1, services: [], overrideReason: '', pregnancyConfirmed: '' };
}

// Calendar dates, not elapsed milliseconds: birthdays and leap years must agree
// with the server. Exactly the first birthday belongs to the infant bracket.
export function visitAge(birthdate, visitDate) {
  const parse = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const [y, m, d] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? [y, m, d] : null;
  };
  const birth = parse(birthdate), visit = parse(visitDate);
  if (!birth || !visit) return null;
  const stamp = ([y, m, d]) => y * 10000 + m * 100 + d;
  if (stamp(visit) < stamp(birth)) return null;
  const years = visit[0] - birth[0] - (visit[1] < birth[1] || (visit[1] === birth[1] && visit[2] < birth[2]) ? 1 : 0);
  const anniversary = new Date(Date.UTC(birth[0] + 1, birth[1] - 1, birth[2]));
  const infant = Date.UTC(...[visit[0], visit[1] - 1, visit[2]]) <= anniversary.getTime();
  return { years, infant };
}

export function serviceEligibility(service, patient = {}, date) {
  if (!Object.hasOwn(VISIT_SERVICES, service)) return { eligible: false, reason: 'Unknown purpose of visit.' };
  patient ||= {};
  if (service === 'General') return { eligible: true };
  const age = visitAge(patient.birthdate || patient.birthDate || patient.date_of_birth, date);
  const female = /^f/i.test(String(patient.sex || patient.gender || ''));
  if (!age) return { eligible: false, reason: 'A valid birthdate is required.' };
  if (['Prenatal', 'Postpartum'].includes(service) && !female) return { eligible: false, reason: 'Maternal services require a patient recorded as female.' };
  if (age.infant) return { eligible: service === 'EPI', reason: 'Only General Consultation and EPI are available at 0–12 months.' };
  if (age.years < 11) return { eligible: false, overridable: true, reason: 'BHC eligibility override required for ages 1–10.' };
  if (service === 'EPI') return { eligible: false, reason: 'EPI is outside the configured age window.' };
  if (age.years < 18) return { eligible: ['Prenatal', 'Postpartum'].includes(service), reason: 'This service is outside the configured age window.' };
  return { eligible: true };
}

export function purposePrograms(services = []) {
  return [...new Set(services.filter(key => key !== 'General').map(key => ['Prenatal', 'Postpartum'].includes(key) ? 'Maternal' : key))];
}

export function purposeErrors(purpose, patient, date) {
  if (!purpose?.services?.length) return 'Select at least one purpose of visit.';
  for (const service of purpose.services) {
    const rule = serviceEligibility(service, patient, date);
    if (!rule.eligible && !(rule.overridable && purpose.overrideReason?.trim())) return rule.reason;
  }
  return '';
}

export function teenagePrenatal(purpose, patient, date) {
  const age = visitAge(patient?.birthdate || patient?.birthDate || patient?.date_of_birth, date);
  return Boolean(purpose?.services?.includes('Prenatal') && age && age.years >= 11 && age.years <= 17);
}

/**
 * A purpose restored from a saved draft may name a service that no longer
 * exists (Hypertension / Diabetes were removed). Keep the known ones; if that
 * leaves nothing, fall back to a general consultation, as the server-side
 * migration does, so the visit can still be saved or changed.
 */
export function knownVisitPurpose(purpose) {
  if (!purpose) return null;
  const services = Array.isArray(purpose.services) ? purpose.services : [];
  const known = services.filter(service => Object.hasOwn(VISIT_SERVICES, service));
  return { ...purpose, services: known.length || !services.length ? known : ['General'] };
}
