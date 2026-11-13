/** Block reasons and stale checks for Add Existing Member (no patient creation). */

export function addMemberBlockReason(patient, destinationHousehold) {
  if (!patient?.id) return "Select a registered patient.";
  if (!destinationHousehold?.id) return "Household is unavailable.";
  const destinationId = String(destinationHousehold.id);
  const currentId = patient.householdId ? String(patient.householdId) : "";
  if (currentId && currentId === destinationId) {
    return "This patient is already a member of this household.";
  }
  const sourceMembers = Number(patient.household?.members_count ?? patient.household?.membersCount ?? 0);
  const isHead = Boolean(
    currentId
    && String(patient.household?.head_patient_id ?? patient.household?.headPatientId ?? "") === String(patient.id),
  );
  if (isHead && sourceMembers > 1) {
    return "Assign a new head in Edit Family first.";
  }
  return "";
}

export function membershipSnapshot(patient) {
  return {
    id: String(patient?.id || ""),
    householdId: patient?.householdId ? String(patient.householdId) : "",
    familySerialNumber: patient?.familySerialNumber || patient?.family_serial_number || "",
  };
}

/** True when the live patient still matches the reviewed source membership. */
export function sourceMembershipUnchanged(reviewed, live) {
  const expected = membershipSnapshot(reviewed);
  const actual = membershipSnapshot(live);
  return expected.id === actual.id && expected.householdId === actual.householdId;
}

export function destinationVersionUnchanged(reviewedHousehold, liveHousehold) {
  return String(reviewedHousehold?.id) === String(liveHousehold?.id)
    && Number(reviewedHousehold?.version) === Number(liveHousehold?.version);
}

export function currentHouseholdLabel(patient) {
  const serial = patient?.familySerialNumber || patient?.family_serial_number || patient?.household?.serial_number || patient?.household?.serialNumber;
  if (serial) return serial;
  if (patient?.householdId) return `Household #${patient.householdId}`;
  return "No household assigned";
}
