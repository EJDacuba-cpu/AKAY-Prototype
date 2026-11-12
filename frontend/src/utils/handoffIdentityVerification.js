/**
 * Guided RHU→BHC monitoring handoff identity verification helpers.
 * Never invents FSN/household and never implies creating a duplicate patient row.
 */

export function identitySourceLabel(source) {
  if (source === "bhc_referral_return") return "BHC Referral Return";
  if (source === "rhu_walk_in") return "RHU Walk-in";
  return "Unknown";
}

export function verificationStatusLabel(status) {
  if (status === "verified") return "Verified";
  if (status === "needs_review") return "Requires Review";
  if (status === "awaiting_verification") return "Awaiting Verification";
  return "Unknown";
}

export function compareIdentityFields(source, candidate) {
  if (!source || !candidate) return [];
  const rows = [
    ["Patient ID", source.id, candidate.id],
    ["Name", fullName(source), fullName(candidate)],
    ["Birthdate", source.birthdate || source.birthDate || "—", candidate.birthdate || candidate.birthDate || "—"],
    ["Sex", source.sex || "—", candidate.sex || "—"],
    ["Contact", source.contact_number || source.contactNumber || "—", candidate.contact_number || candidate.contactNumber || "—"],
  ];
  return rows.map(([label, left, right]) => ({
    label,
    source: String(left ?? "—"),
    candidate: String(right ?? "—"),
    match: String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase(),
  }));
}

export function isSameSharedPatient(source, candidate) {
  const sourceId = Number(source?.id);
  const candidateId = Number(candidate?.id);
  return Number.isInteger(sourceId) && sourceId > 0 && sourceId === candidateId;
}

/** Register-at-BHC only after a successful empty directory search (not on idle/error). */
export function canRegisterSourceAtBhc({ searchState, matches = [], selectedMatch = null, needsReview = false } = {}) {
  return searchState === "success"
    && Array.isArray(matches)
    && matches.length === 0
    && !selectedMatch
    && !needsReview;
}

export function fullName(patient) {
  if (!patient) return "";
  if (patient.full_name) return String(patient.full_name).trim();
  return [patient.first_name || patient.firstName, patient.middle_name || patient.middleName, patient.last_name || patient.lastName, patient.suffix]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}
