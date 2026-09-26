/** Stable string key for a directory patient: the route id, else the patient number. */
export function getPatientKey(patient) {
  const raw = patient?.id || patient?.patientId;
  return raw ? String(raw) : "";
}

/** Click on a card: same card clears the preview, another card switches it. */
export function toggleSelection(current, patientKey) {
  if (!patientKey) return current;
  return current === patientKey ? null : patientKey;
}

/** Keep the selection only while that patient is still in the visible list. */
export function reconcileSelection(selectedKey, patients) {
  if (!selectedKey) return null;
  return patients.some((patient) => getPatientKey(patient) === selectedKey)
    ? selectedKey
    : null;
}
