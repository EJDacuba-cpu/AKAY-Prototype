/** Stable string key for a directory patient: the route id, else the patient number. */
export function getPatientKey(patient) {
  const raw = patient?.id || patient?.patientId;
  return raw ? String(raw) : "";
}

/**
 * Click on a card with the collapsible details panel: any card selects it and
 * opens the panel, except the selected card while the panel is open, which
 * clears the selection and collapses the panel.
 */
export function selectCard(state, patientKey) {
  if (!patientKey) return state;
  if (state.open && state.selectedId === patientKey) {
    return { selectedId: null, open: false };
  }
  return { selectedId: patientKey, open: true };
}

/** Keep the selection only while that patient is still in the visible list. */
export function reconcileSelection(selectedKey, patients) {
  if (!selectedKey) return null;
  return patients.some((patient) => getPatientKey(patient) === selectedKey)
    ? selectedKey
    : null;
}
