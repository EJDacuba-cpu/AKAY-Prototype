import { linkTypeForLabel } from "./relationshipLabels.js";
import { formatPatientName } from './formatters.js';

// The offer shown during registration. Staff must tick it; nothing is recorded automatically.
export function relationshipLinkOffer(label, headName) {
  const type = linkTypeForLabel(label);
  return type ? { type, text: `Record as ${type} of ${headName || "the household head"}` } : null;
}

/** UI guidance only; the existing transaction validates the saved graph again. */
export function registrationLinkEligibility(label, patient = {}, head, parentRole = '', canManageParents = false) {
  const headName = formatPatientName(head, 'the household head');
  let offer = relationshipLinkOffer(label, headName);
  if (['Son', 'Daughter'].includes(label)) {
    offer = { type: ['mother', 'father'].includes(parentRole) ? parentRole : null,
      text: `Confirm ${headName} as this patient's ${parentRole || 'Mother or Father'}.`, needsParentRole: true };
  } else if (['Mother', 'Father'].includes(label)) {
    offer = { type: label.toLowerCase(), text: `Confirm this patient as the ${label} of ${headName}.`, reverse: true };
  }
  if (!offer) return { offer: null, reason: label ? 'This label does not create a supported family connection.' : 'Select the household relationship first.' };
  if (!head?.id) return { offer, reason: 'Select a household with an assigned head first.' };
  if (patient.status === 'inactive' || head.status === 'inactive') return { offer, reason: 'An inactive patient cannot receive a new connection.' };
  if (offer.needsParentRole && !offer.type) return { offer, reason: 'Confirm whether the household head is the Mother or Father.' };
  if (['mother', 'father'].includes(offer.type)) {
    const parent = offer.reverse ? patient : head;
    if (parent.sex !== (offer.type === 'mother' ? 'Female' : 'Male')) return { offer, reason: 'The selected parent role must match the parent’s registered sex.' };
    if (offer.reverse && !canManageParents) return { offer, reason: 'Updating the household head’s parent link requires family management permission. Household Label Only is available.' };
    const child = offer.reverse ? head : patient;
    if (child[`${offer.type}PatientId`] || child[`${offer.type}_patient_id`]) return { offer, reason: 'A parent is already linked. Keep the label only and review corrections in Families.' };
  }
  return { offer, reason: '' };
}

/** Label-only must remove an earlier staged confirmation, including a changed relationship. */
export function registrationConnection(connection, type) {
  if (!connection) return null;
  const next = { ...connection };
  delete next.relationshipLink;
  return { ...next, ...(type ? { relationshipLink: { type } } : {}) };
}
