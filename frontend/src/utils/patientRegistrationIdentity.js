export const SUFFIX_OPTIONS = [
  { value: '', label: 'None' },
  ...['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'].map(value => ({ value, label: value })),
  { value: '__other__', label: 'Other (Specify)' },
];

// Loading a record/draft must never truncate or erase an unfamiliar legacy value.
export function localContact(value) {
  const text = String(value ?? '');
  return /^\+?639[0-9]{9}$/.test(text) ? `0${text.replace(/^\+?63/, '')}` : text;
}

export function contactInput(value) {
  return localContact(value).replace(/[^0-9]/g, '').slice(0, 11);
}

export function contactError(value, other = false) {
  return value != null && value !== '' && !/^[0-9]{11}$/.test(String(value))
    ? `${other ? 'Other contact' : 'Contact'} number must contain exactly 11 digits.` : '';
}

export function suffixFields(value = '', customSuffix = '') {
  const suffix = String(value ?? '');
  return SUFFIX_OPTIONS.some(option => option.value === suffix)
    ? { suffix, customSuffix: suffix === '__other__' ? String(customSuffix ?? '') : '' }
    : { suffix: '__other__', customSuffix: suffix };
}

export function savedSuffix(form = {}) {
  return String(form.suffix === '__other__' ? form.customSuffix || '' : form.suffix || '').trim();
}

export function restoreRegistrationIdentity(form = {}) {
  return { ...form, ...suffixFields(form.suffix, form.customSuffix),
    contactNumber: localContact(form.contactNumber),
    guardianContactNumber: localContact(form.guardianContactNumber) };
}

export function registrationFieldChange(form, name, value) {
  if (['contactNumber', 'guardianContactNumber'].includes(name)) return { ...form, [name]: contactInput(value) };
  if (name === 'suffix') return { ...form, suffix: value, customSuffix: '' };
  return { ...form, [name]: value };
}
