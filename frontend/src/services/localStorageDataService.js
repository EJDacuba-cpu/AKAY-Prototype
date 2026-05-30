import { getItem, setItem } from "./storageService";

// Shared localStorage keys (as requested)
export const KEYS = {
  patients: "akay_bhc_patients",
  healthRecords: "akay_bhc_health_records",
  referrals: "akay_referrals",
  feedbackRecords: "feedbackRecords",
  notifications: "notifications",
};

// Legacy keys already used elsewhere in the app
const LEGACY_KEYS = {
  patients: "patients",
  patients_bhc: "bhc_patients",
  patient_details: "patient_details",
  healthRecords: "healthRecords",
  bhc_health_records: "bhc_health_records",
  referrals: "referrals",
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

function uniqByKey(items = [], keySelector = (item) => item?.id) {
  const keyed = new Map();
  const unkeyed = [];

  for (const item of ensureArray(items)) {
    const key = keySelector(item);
    if (!key) {
      unkeyed.push(item);
      continue;
    }
    keyed.set(key, { ...(keyed.get(key) || {}), ...item });
  }

  return [...keyed.values(), ...unkeyed];
}

function mergeStoredArrays(primaryKey, legacyKeys, keySelector) {
  const primary = ensureArray(getItem(primaryKey, []));
  const legacy = legacyKeys.flatMap((key) => ensureArray(getItem(key, [])));
  const merged = uniqByKey([...legacy, ...primary], keySelector);

  if (legacy.length > 0 && merged.length >= primary.length) {
    setItem(primaryKey, merged);
  }

  return merged;
}

function migrateOnce() {
  // Prevent repeated migrations across renders.
  const flagKey = "_akay_migrated_localstorage_shared_keys_v1";
  const already = getItem(flagKey, false);
  if (already) return;

  // 1) Patients: if shared BHC patients are empty, try legacy sources
  const sharedPatients = getItem(KEYS.patients, null);
  const hasSharedPatients =
    Array.isArray(sharedPatients) && sharedPatients.length > 0;

  if (!hasSharedPatients) {
    const legacyPatients = [
      ...ensureArray(getItem(LEGACY_KEYS.patients, [])),
      ...ensureArray(getItem(LEGACY_KEYS.patients_bhc, [])),
    ];
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

  // 2) Health records: if BHC records are empty, copy legacy BHC records
  const sharedHealthRecords = getItem(KEYS.healthRecords, null);
  const hasSharedHealthRecords =
    Array.isArray(sharedHealthRecords) && sharedHealthRecords.length > 0;

  if (!hasSharedHealthRecords) {
    const legacy = [
      ...ensureArray(getItem(LEGACY_KEYS.healthRecords, [])),
      ...ensureArray(getItem(LEGACY_KEYS.bhc_health_records, [])),
    ];
    if (legacy.length > 0) setItem(KEYS.healthRecords, legacy);
  }

  // 3) Referrals: if shared `akay_referrals` is empty, copy legacy referrals
  const sharedReferrals = getItem(KEYS.referrals, null);
  const hasSharedReferrals =
    Array.isArray(sharedReferrals) && sharedReferrals.length > 0;

  if (!hasSharedReferrals) {
    const legacy = [
      ...ensureArray(getItem(LEGACY_KEYS.referrals, [])),
      ...ensureArray(getItem(LEGACY_KEYS.bhc_referrals, [])),
    ];
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
  return mergeStoredArrays(
    KEYS.patients,
    [LEGACY_KEYS.patients, LEGACY_KEYS.patients_bhc, LEGACY_KEYS.patient_details],
    (patient) => patient?.id || patient?.patientId || patient?._id,
  );
}

export function getAllHealthRecords() {
  runMigrationIfNeeded();
  return mergeStoredArrays(
    KEYS.healthRecords,
    [LEGACY_KEYS.healthRecords, LEGACY_KEYS.bhc_health_records],
    (record) => record?.id || record?._id,
  );
}

export function getAllReferrals() {
  runMigrationIfNeeded();
  return mergeStoredArrays(
    KEYS.referrals,
    [LEGACY_KEYS.referrals, LEGACY_KEYS.bhc_referrals],
    (referral) => referral?.trackingId || referral?.id,
  );
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
  setItem(
    KEYS.referrals,
    uniqByKey(
      ensureArray(referrals),
      (referral) => referral?.trackingId || referral?.id,
    ),
  );
}

export function setAllFeedbackRecords(records) {
  setItem(KEYS.feedbackRecords, ensureArray(records));
}

export function setAllNotifications(records) {
  setItem(KEYS.notifications, ensureArray(records));
}
