function toFetchOptions(query) {
  const options = { ...query };
  delete options.enabled;
  return options;
}

/**
 * Loads a patient profile's data into the query cache before the profile opens.
 *
 * The patient query is required: if it fails the rejection propagates so the
 * caller can stay on the directory. Secondary queries (records, referrals,
 * follow-ups, ...) are awaited too but never block opening, because the
 * profile has its own error and retry state for each of them.
 *
 * Queries with `enabled: false` (for example clinical history the role cannot
 * view) are skipped.
 */
export async function prefetchPatientProfile(queryClient, { patient, secondary = [] }) {
  const [patientData] = await Promise.all([
    queryClient.fetchQuery(toFetchOptions(patient)),
    ...secondary
      .filter((query) => query.enabled !== false)
      .map((query) => queryClient.fetchQuery(toFetchOptions(query)).catch(() => null)),
  ]);

  return patientData;
}
