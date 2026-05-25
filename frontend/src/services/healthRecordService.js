/**
 * Enhanced Health Records Service with LocalStorage CRUD operations
 * Dynamic linking with Patients data
 */

const MOCK_DELAY = 400;
const delay = () => new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

// LocalStorage Keys
const RECORDS_KEY = "bhc_health_records";
const PATIENTS_KEY = "patients"; // Siguraduhing ito ang ginagamit mo sa Patients module (or "bhc_patients")

/**
 * Helper: Kunin ang mga pasyente para ma-link ang pangalan sa records
 */
const getPatientsList = () => {
  const localPatients =
    localStorage.getItem(PATIENTS_KEY) ||
    localStorage.getItem("bhc_patients") ||
    "[]";
  return JSON.parse(localPatients);
};

/**
 * 1. Get all health records
 */
export async function getHealthRecords() {
  await delay();

  const localRecords = localStorage.getItem(RECORDS_KEY) || "[]";
  const records = JSON.parse(localRecords);
  const patientsList = getPatientsList();

  // I-join ang data: Hanapin ang totoong pasyente base sa patientId
  return records.map((record) => {
    const matchingPatient = patientsList.find((p) => p.id === record.patientId);
    return {
      ...record,
      patient: matchingPatient ? matchingPatient.name : "Unknown Patient",
      ageSex: matchingPatient ? matchingPatient.ageSex : "—",
      contact: matchingPatient ? matchingPatient.contact : "—",
    };
  });
}

/**
 * 2. Get health record by ID
 */
export async function getHealthRecordById(recordId) {
  await delay();

  const localRecords = localStorage.getItem(RECORDS_KEY) || "[]";
  const records = JSON.parse(localRecords);
  const patientsList = getPatientsList();

  const record = records.find((r) => r.id === recordId);

  if (!record) return null;

  const matchingPatient = patientsList.find((p) => p.id === record.patientId);

  return {
    ...record,
    patient: matchingPatient ? matchingPatient.name : "Unknown Patient",
    ageSex: matchingPatient ? matchingPatient.ageSex : "—",
    contact: matchingPatient ? matchingPatient.contact : "—",
  };
}

/**
 * 3. Create health record
 */
export async function createHealthRecord(recordData) {
  await delay();
  console.log("SAVING RECORD", recordData);
  const localRecords = localStorage.getItem(RECORDS_KEY) || "[]";
  const records = JSON.parse(localRecords);

  const newRecord = {
    id: `HR-${Date.now()}`,
    ...recordData,
    dateCreated: new Date().toISOString().split("T")[0],
  };

  // SAVE HEALTH RECORD
  records.unshift(newRecord);
  console.log("FINAL RECORDS", records);

  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));

  // =========================
  // AUTO LINK TO PATIENT DETAILS
  // =========================

  const patientDetails = JSON.parse(
    localStorage.getItem("patient_details") || "[]",
  );

  const updatedPatients = patientDetails.map((patient) => {
    if (patient.id === recordData.patientId) {
      return {
        ...patient,

        // auto append records
        records: [...(patient.records || []), newRecord],

        // latest visit tracking
        lastVisit: recordData.dateOfVisit,

        // latest diagnosis
        latestDiagnosis: recordData.diagnosis || "",

        // maternal automation
        expectedDeliveryDate: recordData.expectedDeliveryDate || "",

        aog: recordData.aog || "",
      };
    }

    return patient;
  });

  localStorage.setItem("patient_details", JSON.stringify(updatedPatients));

  return {
    success: true,
    data: newRecord,
  };
}

/**
 * 4. Update health record
 */
export async function updateHealthRecord(recordId, recordData) {
  await delay();

  const localRecords = localStorage.getItem(RECORDS_KEY) || "[]";
  const records = JSON.parse(localRecords);

  const index = records.findIndex((r) => r.id === recordId);
  if (index === -1) throw new Error("Record not found");

  // I-merge ang lumang data sa bagong data
  const updatedRecord = { ...records[index], ...recordData };
  records[index] = updatedRecord;

  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));

  return updatedRecord;
}

/**
 * 5. Delete health record
 */
export async function deleteHealthRecord(recordId) {
  await delay();

  const localRecords = localStorage.getItem(RECORDS_KEY) || "[]";
  let records = JSON.parse(localRecords);

  // Tanggalin ang record na may matching ID
  records = records.filter((r) => r.id !== recordId);

  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));

  return { success: true, message: "Record deleted" };
}

// Export as a single object para tugma sa second code snippet mo
export default {
  getHealthRecords,
  getHealthRecordById,
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
};
