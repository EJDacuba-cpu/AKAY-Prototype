import { formatPatientName } from './formatters.js';

export function parentLinkPayload(role, parentId, previousId) {
  if (!['mother', 'father'].includes(role)) throw new Error('Invalid parent role.');
  const field = `${role}_patient_id`;
  return {
    [field]: parentId ? Number(parentId) : null,
    parent_link_base: { [field]: previousId ? Number(previousId) : null },
  };
}

export function parentInformation(patient = {}, role) {
  const record = patient[`${role}Patient`] || patient[`${role}_patient`] || patient[role] || null;
  const id = patient[`${role}PatientId`] || patient[`${role}_patient_id`] || record?.id || '';
  const reportedName = patient[`${role}Name`] ?? patient[`${role}_name`] ?? '';
  const reportedBirthDate = patient[`${role}BirthDate`] ?? patient[`${role}_birth_date`] ?? '';
  return {
    id: id ? String(id) : '', record, linked: Boolean(id), reportedName, reportedBirthDate,
    name: id ? (record ? formatPatientName(record, '') : 'Linked patient unavailable') : reportedName,
    birthDate: id ? (record?.birthdate || record?.birthDate || '') : reportedBirthDate,
  };
}

/** DOB and registration category never discard reported parent information. */
export function reportedParentValues(form = {}) {
  return Object.fromEntries(['motherName', 'motherBirthDate', 'fatherName', 'fatherBirthDate']
    .map((field) => [field, form[field] || null]));
}
