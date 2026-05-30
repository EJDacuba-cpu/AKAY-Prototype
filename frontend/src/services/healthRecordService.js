import { getItem, setItem } from "./storageService";
import { getBhcPatients, saveBhcPatients } from "./patientService";

const MOCK_DELAY = 400;
const RECORDS_KEY = "bhc_health_records";
const RHU_RECORDS_KEY = "rhu_health_records";

const delay = () => new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

function getStoredRecords(storageKey = RECORDS_KEY) {
  const records = getItem(storageKey, []);
  return Array.isArray(records) ? records : [];
}

function saveStoredRecords(records, storageKey = RECORDS_KEY) {
  setItem(storageKey, records);
}

export async function getHealthRecords() {
  await delay();

  const records = getStoredRecords(RECORDS_KEY);
  const patientsList = await getBhcPatients();

  return records.map((record) => {
    const matchingPatient = patientsList.find((p) => p.id === record.patientId);

    return {
      ...record,
      patient: matchingPatient ? matchingPatient.name : "Unknown Patient",
      ageSex: matchingPatient ? matchingPatient.ageSex : "-",
      contact: matchingPatient ? matchingPatient.contact : "-",
    };
  });
}

export async function getHealthRecordById(recordId) {
  await delay();

  const records = getStoredRecords(RECORDS_KEY);
  const patientsList = await getBhcPatients();

  const record = records.find((r) => r.id === recordId);
  if (!record) {
    return null;
  }

  const matchingPatient = patientsList.find((p) => p.id === record.patientId);

  return {
    ...record,
    patient: matchingPatient ? matchingPatient.name : "Unknown Patient",
    ageSex: matchingPatient ? matchingPatient.ageSex : "-",
    contact: matchingPatient ? matchingPatient.contact : "-",
  };
}

export async function createHealthRecord(recordData) {
  await delay();

  const records = getStoredRecords(RECORDS_KEY);

  const newRecord = {
    id: `HR-${Date.now()}`,
    ...recordData,
    dateCreated: new Date().toISOString().split("T")[0],
  };

  records.unshift(newRecord);
  saveStoredRecords(records, RECORDS_KEY);

  const patientDetails = await getBhcPatients();

  const updatedPatients = patientDetails.map((patient) => {
    if (patient.id !== recordData.patientId) {
      return patient;
    }

    return {
      ...patient,
      records: [...(patient.records || []), newRecord],
      lastVisit: recordData.dateOfVisit,
      latestDiagnosis: recordData.diagnosis || "",
      expectedDeliveryDate: recordData.expectedDeliveryDate || "",
      aog: recordData.aog || "",
    };
  });

  await saveBhcPatients(updatedPatients);

  return {
    success: true,
    data: newRecord,
  };
}

export async function updateHealthRecord(recordId, recordData) {
  await delay();

  const records = getStoredRecords(RECORDS_KEY);
  const index = records.findIndex((r) => r.id === recordId);

  if (index === -1) {
    throw new Error("Record not found");
  }

  const updatedRecord = { ...records[index], ...recordData };
  records[index] = updatedRecord;
  saveStoredRecords(records, RECORDS_KEY);

  return updatedRecord;
}

export async function deleteHealthRecord(recordId) {
  await delay();

  const records = getStoredRecords(RECORDS_KEY).filter((r) => r.id !== recordId);
  saveStoredRecords(records, RECORDS_KEY);

  return { success: true, message: "Record deleted" };
}

export async function getRhuHealthRecords() {
  return getStoredRecords(RHU_RECORDS_KEY);
}

export default {
  getHealthRecords,
  getHealthRecordById,
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
};
