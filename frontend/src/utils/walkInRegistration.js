// Walk-in registration: a new RHU patient who joins today's queue when saved.
// Pure helpers; the registration form decides when to call them.

/** True when the registration page was opened from the walk-in check-in flow. */
export function isCheckInFlow(search) {
  return new URLSearchParams(search || '').get('check_in') === '1';
}

// randomUUID exists only in secure contexts (https or localhost); a clinic LAN may serve plain http.
function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** One key per registration, so a re-sent save is recognised by the server. */
export function newCheckInKey(makeId = randomId) {
  return makeId();
}

/** The walk-in state for one registration; "Register Another" must start a new one. */
export function newWalkIn(makeId) {
  return { key: newCheckInKey(makeId) };
}

/** Adds the check-in command to a registration payload without mutating it. */
export function withCheckIn(payload, { key, confirmDuplicate = false }) {
  return {
    ...payload,
    check_in: { key },
    ...(confirmDuplicate ? { confirm_possible_duplicate: true } : {}),
  };
}

/** RHU registration may confirm a duplicate without creating a queue visit. */
export function withDuplicateConfirm(payload, confirmDuplicate = false) {
  return confirmDuplicate ? { ...payload, confirm_possible_duplicate: true } : payload;
}

/** The "possible duplicate patient" answer as a prompt view model, or null for any other error. */
export function duplicatePrompt(error) {
  if (error?.status !== 409 || error?.code !== 'POSSIBLE_DUPLICATE_PATIENT') return null;
  const matches = error.payload?.matches;
  if (!Array.isArray(matches)) return null;
  return {
    matches: matches.map((match) => ({
      id: match.id,
      fullName: match.full_name,
      birthdate: match.birthdate ?? null,
      activeVisitId: match.active_visit_id ?? null,
    })),
  };
}

/** Where to go after a patient is saved: RHU returns to the queue without checking the patient in. */
export function postSaveDestination({ checkIn, role, patientsPath, patientId }) {
  return checkIn || role === "rhu" ? patientsPath : `${patientsPath}/${patientId}`;
}
