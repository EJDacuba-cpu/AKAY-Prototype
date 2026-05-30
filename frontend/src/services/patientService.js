import { getItem, setItem } from "./storageService";
import { getReferralsByPatient } from "./referrals";

const LEGACY_PATIENTS_KEY = "patients";
const LEGACY_PATIENT_DETAILS_KEY = "patient_details";
const LEGACY_RHU_PATIENTS_KEY = "rhu_patients";
const BHC_PATIENTS_KEY = "akay_bhc_patients";
const RHU_PATIENTS_KEY = "akay_rhu_patients";
const HEALTH_RECORDS_KEY = "akay_bhc_health_records";

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildFullName(firstName = "", middleName = "", lastName = "") {
  return `${firstName} ${middleName ? `${middleName} ` : ""}${lastName}`.trim();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeContact(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatAgeSex(age, sex) {
  const sexInput = sex || "Male";
  return `${age || "0"}/${sexInput.charAt(0).toUpperCase()}`;
}

function getStoragePatients(key) {
  return ensureArray(getItem(key, []));
}

function saveStoragePatients(key, patients) {
  const normalized = ensureArray(patients);
  setItem(key, normalized);
  return normalized;
}

function uniqueById(items) {
  const map = new Map();
  ensureArray(items).forEach((item) => {
    if (!item?.id && !item?.patientId) return;
    const id = item.id || item.patientId;
    if (!map.has(id)) map.set(id, { ...item, id, patientId: id });
  });
  return [...map.values()];
}

function inferSourceRole(patient, fallbackRole) {
  const role = String(patient?.sourceRole || "").toUpperCase();
  if (role === "RHU" || role === "BHC") return role;

  const registrationSource = String(patient?.registrationSource || "");
  if (registrationSource.startsWith("RHU")) return "RHU";
  if (registrationSource.startsWith("BHC")) return "BHC";

  return fallbackRole;
}

function normalizePatient(rawPatient = {}, role = "BHC") {
  const sourceRole = inferSourceRole(rawPatient, role);
  const firstName = rawPatient.firstName || "";
  const middleName = rawPatient.middleName || "";
  const lastName = rawPatient.lastName || "";
  const name =
    rawPatient.name ||
    rawPatient.patientName ||
    buildFullName(firstName, middleName, lastName) ||
    "Unknown Patient";
  const id =
    rawPatient.id ||
    rawPatient.patientId ||
    `${sourceRole === "RHU" ? "RHU-P" : "P"}-${Date.now()}`;
  const selectedType =
    rawPatient.patientClassification ||
    rawPatient.patientCategory ||
    rawPatient.category ||
    rawPatient.type ||
    "General Consultation";
  const contactNumber =
    rawPatient.contactNumber || rawPatient.contact || rawPatient.phone || "";
  const address =
    rawPatient.streetAddress || rawPatient.address || rawPatient.patientAddress || "";

  return {
    ...rawPatient,
    id,
    patientId: rawPatient.patientId || id,
    firstName,
    middleName,
    lastName,
    name,
    birthDate: rawPatient.birthDate || rawPatient.dateOfBirth || "",
    age: rawPatient.age || parseAge(rawPatient.ageSex) || "",
    sex: rawPatient.sex || parseSex(rawPatient.ageSex) || "",
    civilStatus: rawPatient.civilStatus || "",
    contactNumber,
    contact: contactNumber,
    streetAddress: rawPatient.streetAddress || address,
    address,
    barangay: rawPatient.barangay || rawPatient.sourceBarangay || "",
    municipality: rawPatient.municipality || "Bulakan",
    patientClassification: selectedType,
    category: selectedType,
    type: selectedType,
    philHealthNumber:
      rawPatient.philHealthNumber ||
      rawPatient.philhealthNumber ||
      rawPatient.philHealth ||
      "",
    philHealthCategory:
      rawPatient.philHealthCategory || rawPatient.philhealthCategory || "",
    sourceRole,
    sourceFacility:
      rawPatient.sourceFacility ||
      (sourceRole === "RHU"
        ? "Rural Health Unit of Bulakan"
        : rawPatient.bhc || rawPatient.referringFacility || "Barangay Health Center"),
    sourceBarangay: rawPatient.sourceBarangay || rawPatient.barangay || "",
    linkedTrackingIds: ensureArray(
      rawPatient.linkedTrackingIds ||
        (rawPatient.linkedTrackingId ? [rawPatient.linkedTrackingId] : []),
    ),
    registrationSource:
      rawPatient.registrationSource ||
      (sourceRole === "RHU" ? "RHU_REGISTRATION" : "BHC_REGISTRATION"),
    ageSex: rawPatient.ageSex || formatAgeSex(rawPatient.age, rawPatient.sex),
    lastVisit:
      rawPatient.lastVisit ||
      rawPatient.dateRegistered ||
      rawPatient.createdAt ||
      new Date().toISOString().split("T")[0],
    dateRegistered:
      rawPatient.dateRegistered || new Date().toISOString().split("T")[0],
    records: ensureArray(rawPatient.records),
    referrals: ensureArray(rawPatient.referrals),
  };
}

function parseAge(ageSex) {
  const parsed = parseInt(String(ageSex || "").split("/").at(0), 10);
  return Number.isNaN(parsed) ? "" : parsed;
}

function parseSex(ageSex) {
  const raw = String(ageSex || "").split("/").at(1) || "";
  if (raw.toLowerCase().startsWith("m")) return "Male";
  if (raw.toLowerCase().startsWith("f")) return "Female";
  return "";
}

function createPatientPayload(patientData = {}, role = "BHC") {
  const sourceRole = role.toUpperCase();
  const shouldPreserveProvidedId =
    patientData.registrationSource === "RHU_REFERRAL_RECEIVED";
  const providedId =
    patientData.patientId || (shouldPreserveProvidedId ? patientData.id : "");
  const generatedId =
    providedId ||
    `${sourceRole === "RHU" ? "RHU-P" : "P"}-${Date.now()}`;
  const selectedType =
    patientData.patientClassification ||
    patientData.patientCategory ||
    patientData.category ||
    "General Consultation";
  const name =
    patientData.name ||
    buildFullName(
      patientData.firstName,
      patientData.middleName,
      patientData.lastName,
    ) ||
    "Unknown Patient";
  const age = patientData.age || parseAge(patientData.ageSex);
  const sex = patientData.sex || parseSex(patientData.ageSex) || "Male";
  const contactNumber = patientData.contactNumber || patientData.contact || "";

  return normalizePatient(
    {
      ...patientData,
      id: generatedId,
      patientId: patientData.patientId || generatedId,
      name,
      age,
      sex,
      contactNumber,
      category: selectedType,
      patientClassification: selectedType,
      registrationSource:
        patientData.registrationSource ||
        (sourceRole === "RHU" ? "RHU_REGISTRATION" : "BHC_REGISTRATION"),
      sourceRole,
      sourceFacility:
        patientData.sourceFacility ||
        (sourceRole === "RHU"
          ? "Rural Health Unit of Bulakan"
          : patientData.bhc ||
            patientData.sourceBarangay ||
            patientData.barangay ||
            "Barangay Health Center"),
      sourceBarangay: patientData.sourceBarangay || patientData.barangay || "",
      dateRegistered: new Date().toISOString().split("T")[0],
    },
    sourceRole,
  );
}

function migratePatientsIfNeeded() {
  const migrationFlag = "_akay_patient_role_storage_migrated_v1";
  if (getItem(migrationFlag, false)) return;

  const existingBhc = getStoragePatients(BHC_PATIENTS_KEY);
  const existingRhu = getStoragePatients(RHU_PATIENTS_KEY);

  if (existingBhc.length === 0) {
    const legacy = uniqueById([
      ...getStoragePatients(LEGACY_PATIENTS_KEY),
      ...getStoragePatients(LEGACY_PATIENT_DETAILS_KEY),
    ]).map((patient) => normalizePatient(patient, "BHC"));

    if (legacy.length > 0) saveStoragePatients(BHC_PATIENTS_KEY, legacy);
  }

  if (existingRhu.length === 0) {
    const legacyRhu = getStoragePatients(LEGACY_RHU_PATIENTS_KEY).map(
      (patient) => normalizePatient(patient, "RHU"),
    );

    if (legacyRhu.length > 0) saveStoragePatients(RHU_PATIENTS_KEY, legacyRhu);
  }

  setItem(migrationFlag, true);
}

function getPatientsForKey(key, role) {
  migratePatientsIfNeeded();
  return getStoragePatients(key).map((patient) => normalizePatient(patient, role));
}

function savePatientsForKey(key, patients, role) {
  return saveStoragePatients(
    key,
    ensureArray(patients).map((patient) => normalizePatient(patient, role)),
  );
}

export async function getBhcPatients() {
  return getPatientsForKey(BHC_PATIENTS_KEY, "BHC");
}

export async function saveBhcPatients(patients) {
  return savePatientsForKey(BHC_PATIENTS_KEY, patients, "BHC");
}

export async function createBhcPatient(data) {
  const patients = await getBhcPatients();
  const newPatient = createPatientPayload(data, "BHC");
  const next = uniqueById([newPatient, ...patients]);
  await saveBhcPatients(next);
  syncLegacyBhcPatients(next);
  return { patient: newPatient, details: newPatient };
}

export async function updateBhcPatient(id, data) {
  const patients = await getBhcPatients();
  const updated = patients.map((patient) =>
    patient.id === id ? normalizePatient({ ...patient, ...data }, "BHC") : patient,
  );
  await saveBhcPatients(updated);
  syncLegacyBhcPatients(updated);
  return updated.find((patient) => patient.id === id) || null;
}

export async function getBhcPatientById(id) {
  const patients = await getBhcPatients();
  return patients.find((patient) => patient.id === id) || null;
}

export async function getRhuPatients() {
  return getPatientsForKey(RHU_PATIENTS_KEY, "RHU");
}

export async function saveRhuPatients(patients) {
  return savePatientsForKey(RHU_PATIENTS_KEY, patients, "RHU");
}

export async function createRhuPatient(data) {
  const patients = await getRhuPatients();
  const newPatient = createPatientPayload(data, "RHU");
  const next = uniqueById([newPatient, ...patients]);
  await saveRhuPatients(next);
  setItem(LEGACY_RHU_PATIENTS_KEY, next);
  return { patient: newPatient, details: newPatient };
}

export async function updateRhuPatient(id, data) {
  const patients = await getRhuPatients();
  const updated = patients.map((patient) =>
    patient.id === id ? normalizePatient({ ...patient, ...data }, "RHU") : patient,
  );
  await saveRhuPatients(updated);
  setItem(LEGACY_RHU_PATIENTS_KEY, updated);
  return updated.find((patient) => patient.id === id) || null;
}

export async function getRhuPatientById(id) {
  const patients = await getRhuPatients();
  return patients.find((patient) => patient.id === id) || null;
}

export async function getPatientsByRole(role) {
  return String(role).toLowerCase() === "rhu"
    ? getRhuPatients()
    : getBhcPatients();
}

export async function getPatientDetailsListByRole(role) {
  return getPatientsByRole(role);
}

export async function getPatientByIdForRole(id, role) {
  return String(role).toLowerCase() === "rhu"
    ? getRhuPatientById(id)
    : getBhcPatientById(id);
}

export async function linkReferralPatientToRhu(referral) {
  const patients = await getRhuPatients();
  const referralPatientId = referral?.patientId || referral?.patient?.id || "";
  const referralName = normalizeText(getReferralPatientName(referral));
  const referralContact = normalizeContact(getReferralContact(referral));

  const existing = patients.find((patient) => {
    if (referralPatientId && patient.id === referralPatientId) return true;

    const sameName = normalizeText(patient.name) === referralName;
    const patientContact = normalizeContact(
      patient.contactNumber || patient.contact,
    );
    return sameName && (!referralContact || patientContact === referralContact);
  });

  if (existing) {
    const linkedTrackingIds = [
      ...new Set([
        ...ensureArray(existing.linkedTrackingIds),
        referral.trackingId,
      ].filter(Boolean)),
    ];

    const updated = await updateRhuPatient(existing.id, {
      ...existing,
      linkedTrackingIds,
      registrationSource:
        existing.registrationSource || "RHU_REFERRAL_RECEIVED",
    });

    return updated?.id || existing.id;
  }

  const nameParts = splitPatientName(getReferralPatientName(referral));
  const created = await createRhuPatient({
    ...nameParts,
    id: referralPatientId || undefined,
    patientId: referralPatientId || undefined,
    birthDate: referral.birthDate || referral.dateOfBirth || "",
    age: referral.age || parseAge(referral.ageSex),
    sex: referral.sex || parseSex(referral.ageSex),
    civilStatus: referral.civilStatus || "",
    contactNumber: getReferralContact(referral),
    streetAddress:
      referral.street || referral.address || referral.patientAddress || "",
    barangay: referral.barangay || referral.patientBarangay || "",
    municipality: referral.municipality || "Bulakan",
    patientClassification:
      referral.patientClassification ||
      referral.category ||
      referral.referralCategory ||
      "General Consultation",
    philHealthNumber:
      referral.philHealthNumber ||
      referral.philhealthNumber ||
      referral.philHealth ||
      "",
    philHealthCategory:
      referral.philHealthCategory || referral.philhealthCategory || "",
    linkedTrackingIds: [referral.trackingId].filter(Boolean),
    registrationSource: "RHU_REFERRAL_RECEIVED",
    sourceRole: "RHU",
    sourceFacility: "Rural Health Unit of Bulakan",
    sourceBarangay: referral.barangay || referral.patientBarangay || "",
  });

  return created?.patient?.id || created?.details?.id || null;
}

function syncLegacyBhcPatients(patients) {
  setItem(LEGACY_PATIENTS_KEY, patients);
  setItem(LEGACY_PATIENT_DETAILS_KEY, patients);
}

function getReferralPatientName(referral) {
  if (!referral) return "";
  if (typeof referral.patient === "string") return referral.patient;
  return (
    referral.patientName ||
    referral.patient?.name ||
    buildFullName(
      referral.firstName || referral.patient?.firstName,
      referral.middleName || referral.patient?.middleName,
      referral.lastName || referral.patient?.lastName,
    )
  );
}

function getReferralContact(referral) {
  return (
    referral?.contactNumber ||
    referral?.contact ||
    referral?.patientContact ||
    referral?.patient?.contactNumber ||
    referral?.patient?.contact ||
    ""
  );
}

function splitPatientName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Unknown", middleName: "", lastName: "Patient" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: "", lastName: "" };
  }
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts[parts.length - 1],
  };
}

export async function getPatients() {
  return getBhcPatients();
}

export async function getPatientDetailsList() {
  return getBhcPatients();
}

export async function getPatientById(patientId) {
  return getBhcPatientById(patientId);
}

export async function savePatient(patientData) {
  return createPatient(patientData);
}

export async function createPatient(patientData) {
  const role = inferSourceRole(patientData, "BHC");
  return role === "RHU"
    ? createRhuPatient(patientData)
    : createBhcPatient(patientData);
}

export async function updatePatient(patientId, patientData) {
  const role = inferSourceRole(patientData, "BHC");
  const existingInRhu = await getRhuPatientById(patientId);
  if (role === "RHU" || existingInRhu) {
    return updateRhuPatient(patientId, patientData);
  }
  return updateBhcPatient(patientId, patientData);
}

export async function deletePatient(patientId) {
  const bhcPatients = await getBhcPatients();
  const rhuPatients = await getRhuPatients();

  await saveBhcPatients(bhcPatients.filter((patient) => patient.id !== patientId));
  await saveRhuPatients(rhuPatients.filter((patient) => patient.id !== patientId));
  syncLegacyBhcPatients(await getBhcPatients());
  setItem(LEGACY_RHU_PATIENTS_KEY, await getRhuPatients());

  return { success: true, message: "Patient deleted" };
}

export async function getPatientRecords() {
  return [];
}

export async function getPatientHealthRecords(patientId) {
  const records = getItem(HEALTH_RECORDS_KEY, []);
  return ensureArray(records).filter((record) => record.patientId === patientId);
}

export async function getPatientReferrals(patientId) {
  const patient =
    (await getBhcPatientById(patientId)) || { id: patientId, patientId };
  return getReferralsByPatient(patient);
}
