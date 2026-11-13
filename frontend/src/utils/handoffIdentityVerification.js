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

/** Normalize name parts for exact demographic potential-match (not fuzzy). */
export function normalizedFullName(patient) {
  if (!patient) return "";
  if (patient.full_name || patient.fullName) {
    return String(patient.full_name || patient.fullName).trim().toLowerCase().replace(/\s+/g, " ");
  }
  return [patient.first_name || patient.firstName, patient.middle_name || patient.middleName, patient.last_name || patient.lastName, patient.suffix]
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

export function normalizedBirthdate(patient) {
  const raw = patient?.birthdate || patient?.birthDate || "";
  const value = String(raw).trim();
  return value || null;
}

export function normalizedSex(patient) {
  return String(patient?.sex || "").trim().toLowerCase();
}

/**
 * Name + birthdate + sex exact match after normalization = Potential Match only.
 * Never treats matching IDs or phones as conclusive proof by itself.
 */
export function isPotentialDemographicMatch(source, candidate) {
  if (!source || !candidate) return false;
  const name = normalizedFullName(source);
  const otherName = normalizedFullName(candidate);
  const dob = normalizedBirthdate(source);
  const otherDob = normalizedBirthdate(candidate);
  const sex = normalizedSex(source);
  const otherSex = normalizedSex(candidate);
  return Boolean(
    name
    && otherName
    && name === otherName
    && dob
    && otherDob
    && dob === otherDob
    && sex
    && otherSex
    && sex === otherSex,
  );
}

export function hasDemographicConflict(source, candidate) {
  if (!source || !candidate) return true;
  if (isSameSharedPatient(source, candidate)) return false;
  return !isPotentialDemographicMatch(source, candidate);
}

/**
 * Cross-record link requires a potential demographic match plus deliberate staff confirmation.
 * Multiple directory hits still require an explicit selected candidate.
 */
export function canVerifyCrossRecordLink({
  source,
  candidate,
  identityConfirmed = false,
  needsReview = false,
  matchCount = 0,
} = {}) {
  if (needsReview || !source || !candidate || !identityConfirmed) return false;
  if (isSameSharedPatient(source, candidate)) return false;
  if (Number(matchCount) > 1 && !candidate?.id) return false;
  return isPotentialDemographicMatch(source, candidate);
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
