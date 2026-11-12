/**
 * Single active patient-profile open lock for BHC and RHU directories.
 * Module-level so every Open Profile / View Full Profile control shares one gate.
 */

let openingPatientId = null;
let generation = 0;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

export function getProfileOpenPatientId() {
  return openingPatientId;
}

export function subscribeProfileOpen(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @returns {number|null} generation token when acquired, or null when another open is active */
export function tryBeginProfileOpen(patientId) {
  const id = patientId == null ? "" : String(patientId).trim();
  if (!id) return null;
  if (openingPatientId != null) return null;
  openingPatientId = id;
  generation += 1;
  emit();
  return generation;
}

/** Release only if this caller still owns the current open. */
export function endProfileOpen(token) {
  if (token == null || token !== generation) return false;
  if (openingPatientId == null) return false;
  openingPatientId = null;
  emit();
  return true;
}

/** Unconditional release (route change, unmount cleanup). */
export function clearProfileOpen() {
  if (openingPatientId == null) return false;
  openingPatientId = null;
  generation += 1;
  emit();
  return true;
}

/** Test helper — resets gate between cases. */
export function resetProfileOpenGate() {
  openingPatientId = null;
  generation = 0;
  emit();
}
