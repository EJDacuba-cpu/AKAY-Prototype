// Walk-in registration: a new RHU patient who joins today's queue when saved.
// Pure helpers; the registration form decides when to call them.

/** True when the registration page was opened from the walk-in check-in flow. */
export function isCheckInFlow(search) {
  return new URLSearchParams(search || '').get('check_in') === '1';
}

/** One key per registration page, so a re-sent save is recognised by the server. */
export function newCheckInKey(makeId = () => crypto.randomUUID()) {
  return makeId();
}

/** Adds the check-in command to a registration payload without mutating it. */
export function withCheckIn(payload, { key, confirmDuplicate = false }) {
  return {
    ...payload,
    check_in: { key },
    ...(confirmDuplicate ? { confirm_possible_duplicate: true } : {}),
  };
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

/** Where to go after a patient is saved: back to the list for a walk-in, else the new profile. */
export function postSaveDestination({ checkIn, patientsPath, patientId }) {
  return checkIn ? patientsPath : `${patientsPath}/${patientId}`;
}
