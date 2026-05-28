import { getItem, setItem } from "./storageService";

// Shared localStorage keys (as requested)
export const KEYS = {
  patients: "patients",
  healthRecords: "healthRecords",
  referrals: "referrals",
  feedbackRecords: "feedbackRecords",
  notifications: "notifications",
};

// Legacy keys already used elsewhere in the app
const LEGACY_KEYS = {
  patients_bhc: "bhc_patients",
  patient_details: "patient_details",
  bhc_health_records: "bhc_health_records",
  bhc_referrals: "bhc_referrals",
  // Some flows may store notifications elsewhere; keep room for it.
  mock_notifications: "mock_notifications",
};

function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function uniqById(items = []) {
  const map = new Map();
  for (const it of items) {
    const id = it?.id;
    if (id == null) continue;
    if (!map.has(id)) map.set(id, it);
  }
  return [...map.values()];
}

function migrateOnce() {
  // Prevent repeated migrations across renders.
  const flagKey = "_akay_migrated_localstorage_shared_keys_v1";
  const already = getItem(flagKey, false);
  if (already) return;

  // 1) Patients: if shared `patients` is empty, try legacy sources
  const sharedPatients = getItem(KEYS.patients, null);
  const hasSharedPatients =
    Array.isArray(sharedPatients) && sharedPatients.length > 0;

  if (!hasSharedPatients) {
    const legacyPatients = ensureArray(getItem(LEGACY_KEYS.patients_bhc, []));
    const patientDetails = ensureArray(
      getItem(LEGACY_KEYS.patient_details, []),
    );

    // Normalize shape between the two legacy variants.
    const normalized = [
      ...legacyPatients.map((p) => ({
        ...p,
        id: p.id,
      })),
      ...patientDetails.map((p) => ({
        ...p,
        // patient_details uses same id in patientService.savePatient()
        id: p.id,
      })),
    ];

    const deduped = uniqById(normalized);
    if (deduped.length > 0) setItem(KEYS.patients, deduped);
  }

  // 2) Health records: if shared `healthRecords` is empty, copy legacy `bhc_health_records`
  const sharedHealthRecords = getItem(KEYS.healthRecords, null);
  const hasSharedHealthRecords =
    Array.isArray(sharedHealthRecords) && sharedHealthRecords.length > 0;

  if (!hasSharedHealthRecords) {
    const legacy = ensureArray(getItem(LEGACY_KEYS.bhc_health_records, []));
    if (legacy.length > 0) setItem(KEYS.healthRecords, legacy);
  }

  // 3) Referrals: if shared `referrals` is empty, copy legacy `bhc_referrals`
  const sharedReferrals = getItem(KEYS.referrals, null);
  const hasSharedReferrals =
    Array.isArray(sharedReferrals) && sharedReferrals.length > 0;

  if (!hasSharedReferrals) {
    const legacy = ensureArray(getItem(LEGACY_KEYS.bhc_referrals, []));
    if (legacy.length > 0) setItem(KEYS.referrals, legacy);
  }

  // Feedback records/notifications are not guaranteed to exist yet; do not seed.

  setItem(flagKey, true);
}

export function runMigrationIfNeeded() {
  try {
    migrateOnce();
  } catch {
    // Ignore migration errors (localStorage blocked, malformed JSON, etc.)
  }
}

// ---------- Readers ----------

export function getAllPatients() {
  runMigrationIfNeeded();
  return ensureArray(getItem(KEYS.patients, []));
}

export function getAllHealthRecords() {
  runMigrationIfNeeded();
  return ensureArray(getItem(KEYS.healthRecords, []));
}

export function getAllReferrals() {
  runMigrationIfNeeded();
  return ensureArray(getItem(KEYS.referrals, []));
}

export function getAllFeedbackRecords() {
  runMigrationIfNeeded();
  return ensureArray(getItem(KEYS.feedbackRecords, []));
}

export function getAllNotifications() {
  runMigrationIfNeeded();
  return ensureArray(getItem(KEYS.notifications, []));
}

// ---------- Writers ----------

export function setAllPatients(patients) {
  setItem(KEYS.patients, ensureArray(patients));
}

export function setAllHealthRecords(records) {
  setItem(KEYS.healthRecords, ensureArray(records));
}

export function setAllReferrals(referrals) {
  setItem(KEYS.referrals, ensureArray(referrals));
}

export function setAllFeedbackRecords(records) {
  setItem(KEYS.feedbackRecords, ensureArray(records));
}

export function setAllNotifications(records) {
  setItem(KEYS.notifications, ensureArray(records));
}
