import { getItem, setItem } from "./storageService";
import {
  getBhcPatients,
  getPatientDetailsListByRole,
  saveBhcPatients,
} from "./patientService";

const MOCK_DELAY = 400;
export const BHC_RECORDS_KEY = "akay_bhc_health_records";
export const RHU_RECORDS_KEY = "akay_rhu_health_records";

const LEGACY_RECORD_KEYS = {
  bhc: ["bhc_health_records", "healthRecords"],
  rhu: ["rhu_health_records"],
};

const delay = () => new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRole(role = "bhc") {
  return String(role).toLowerCase() === "rhu" ? "rhu" : "bhc";
}

function getStorageKey(role = "bhc") {
  return normalizeRole(role) === "rhu" ? RHU_RECORDS_KEY : BHC_RECORDS_KEY;
}

function getRecordKey(record = {}) {
  return record.id || record._id || "";
}

function dedupeRecords(records = []) {
  const map = new Map();

  for (const record of ensureArray(records)) {
    const key = getRecordKey(record);
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...record });
  }

  return [...map.values()];
}

function getStoredRecords(role = "bhc") {
  const normalizedRole = normalizeRole(role);
  const storageKey = getStorageKey(normalizedRole);
  const primary = ensureArray(getItem(storageKey, []));
  const legacy = LEGACY_RECORD_KEYS[normalizedRole].flatMap((key) =>
    ensureArray(getItem(key, [])),
  );
  const records = dedupeRecords([...legacy, ...primary]);

  if (legacy.length > 0 && records.length >= primary.length) {
    setItem(storageKey, records);
  }

  return records;
}

function saveStoredRecords(records, role = "bhc") {
  setItem(getStorageKey(role), dedupeRecords(records));
}

function createRecordId(role = "bhc") {
  const prefix = normalizeRole(role) === "rhu" ? "RHU-HR" : "HR";
  return `${prefix}-${Date.now()}`;
}

function getPatientName(patient = {}) {
  return (
    patient.name ||
    patient.patientName ||
    [patient.firstName, patient.middleName, patient.lastName]
      .filter(Boolean)
      .join(" ")
  );
}

async function getPatientsForRole(role = "bhc") {
  if (normalizeRole(role) === "bhc") {
    return getBhcPatients();
  }
  return getPatientDetailsListByRole("rhu");
}

function attachPatient(record, patientsList = []) {
  const matchingPatient = patientsList.find((patient) => {
    const patientIds = [patient.id, patient.patientId, patient._id].filter(
      Boolean,
    );
    return patientIds.includes(record.patientId);
  });

  return {
    ...record,
    patient: matchingPatient
      ? getPatientName(matchingPatient)
      : record.patientName || "Unknown Patient",
    ageSex: matchingPatient
      ? matchingPatient.ageSex ||
        `${matchingPatient.age || ""} / ${matchingPatient.sex || ""}`
      : record.ageSex || "-",
    contact: matchingPatient
      ? matchingPatient.contact ||
        matchingPatient.contactNumber ||
        matchingPatient.phone ||
        "-"
      : record.contact || "-",
  };
}

async function updateBhcPatientLatestRecord(recordData, newRecord) {
  const patientDetails = await getBhcPatients();

  const updatedPatients = patientDetails.map((patient) => {
    if (patient.id !== recordData.patientId) {
      return patient;
    }

    const existingRecords = ensureArray(patient.records).filter(
      (record) => getRecordKey(record) !== getRecordKey(newRecord),
    );

    return {
      ...patient,
      records: [...existingRecords, newRecord],
      lastVisit: recordData.dateOfVisit,
      latestDiagnosis: recordData.diagnosis || "",
      expectedDeliveryDate: recordData.expectedDeliveryDate || "",
      aog: recordData.aog || "",
    };
  });

  await saveBhcPatients(updatedPatients);
}

export async function getBhcHealthRecords() {
  await delay();
  return getStoredRecords("bhc");
}

export async function getRhuHealthRecords() {
  await delay();
  return getStoredRecords("rhu");
}

export async function saveBhcHealthRecords(records) {
  await delay();
  saveStoredRecords(records, "bhc");
  return getStoredRecords("bhc");
}

export async function saveRhuHealthRecords(records) {
  await delay();
  saveStoredRecords(records, "rhu");
  return getStoredRecords("rhu");
}

export async function getHealthRecords(role = "bhc") {
  await delay();

  const normalizedRole = normalizeRole(role);
  const records = getStoredRecords(normalizedRole);
  const patientsList = await getPatientsForRole(normalizedRole);

  return records.map((record) => attachPatient(record, patientsList));
}

export async function getHealthRecordById(recordId, role = "bhc") {
  await delay();

  const normalizedRole = normalizeRole(role);
  const records = getStoredRecords(normalizedRole);
  const patientsList = await getPatientsForRole(normalizedRole);

  const record = records.find(
    (item) => item.id === recordId || item._id === recordId,
  );
  if (!record) {
    return null;
  }

  return attachPatient(record, patientsList);
}

export async function getHealthRecordsByPatient(patient, role = "bhc") {
  await delay();

  const patientInput =
    typeof patient === "string" ? { id: patient, patientId: patient } : patient;
  const patientIds = [
    patientInput?.id,
    patientInput?.patientId,
    patientInput?._id,
  ].filter(Boolean);

  return getStoredRecords(role).filter((record) =>
    patientIds.includes(record.patientId),
  );
}

export async function createHealthRecord(recordData, role = "bhc") {
  await delay();

  const normalizedRole = normalizeRole(role);
  const records = getStoredRecords(normalizedRole);
  const now = new Date().toISOString();

  const newRecord = {
    id: recordData.id || createRecordId(normalizedRole),
    ...recordData,
    createdByRole: recordData.createdByRole || normalizedRole,
    createdAt: recordData.createdAt || now,
    updatedAt: now,
    dateCreated: recordData.dateCreated || now.split("T")[0],
  };

  const nextRecords = [
    newRecord,
    ...records.filter((record) => getRecordKey(record) !== getRecordKey(newRecord)),
  ];
  saveStoredRecords(nextRecords, normalizedRole);

  if (normalizedRole === "bhc") {
    await updateBhcPatientLatestRecord(recordData, newRecord);
  }

  return {
    success: true,
    data: newRecord,
  };
}

export async function createBhcHealthRecord(recordData) {
  return createHealthRecord(recordData, "bhc");
}

export async function createRhuHealthRecord(recordData) {
  return createHealthRecord(recordData, "rhu");
}

export async function createFollowUpHealthRecord(recordData, role = "bhc") {
  return createHealthRecord(
    {
      ...recordData,
      id: recordData.id || createRecordId(role),
      previousRecordId: recordData.previousRecordId || recordData.recordId || "",
      recordType: "Follow-up",
      isFollowUp: true,
    },
    role,
  );
}

export async function updateHealthRecordById(recordId, recordData, role = "bhc") {
  await delay();

  const normalizedRole = normalizeRole(role);
  const records = getStoredRecords(normalizedRole);
  const index = records.findIndex(
    (record) => record.id === recordId || record._id === recordId,
  );

  if (index === -1) {
    throw new Error("Record not found");
  }

  const updatedRecord = {
    ...records[index],
    ...recordData,
    id: records[index].id || recordId,
    updatedAt: new Date().toISOString(),
  };
  records[index] = updatedRecord;
  saveStoredRecords(records, normalizedRole);

  if (normalizedRole === "bhc") {
    await updateBhcPatientLatestRecord(updatedRecord, updatedRecord);
  }

  return updatedRecord;
}

export async function updateHealthRecord(recordId, recordData, role = "bhc") {
  return updateHealthRecordById(recordId, recordData, role);
}

export async function deleteHealthRecord(recordId, role = "bhc") {
  await delay();

  const records = getStoredRecords(role).filter(
    (record) => record.id !== recordId && record._id !== recordId,
  );
  saveStoredRecords(records, role);

  return { success: true, message: "Record deleted" };
}

export default {
  getHealthRecords,
  getHealthRecordById,
  getHealthRecordsByPatient,
  getBhcHealthRecords,
  getRhuHealthRecords,
  saveBhcHealthRecords,
  saveRhuHealthRecords,
  createHealthRecord,
  createBhcHealthRecord,
  createRhuHealthRecord,
  createFollowUpHealthRecord,
  updateHealthRecord,
  updateHealthRecordById,
  deleteHealthRecord,
};
