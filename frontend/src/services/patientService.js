import { getItem, setItem } from "./storageService";

const PATIENTS_KEY = "patients";
const PATIENT_DETAILS_KEY = "patient_details";
const HEALTH_RECORDS_KEY = "bhc_health_records";
const REFERRALS_KEY = "bhc_referrals";

function getStoredPatients() {
  return getItem(PATIENTS_KEY, []);
}

function setStoredPatients(data) {
  setItem(PATIENTS_KEY, data);
}

function getStoredDetails() {
  return getItem(PATIENT_DETAILS_KEY, []);
}

function setStoredDetails(data) {
  setItem(PATIENT_DETAILS_KEY, data);
}

function buildFullName(firstName = "", middleName = "", lastName = "") {
  return `${firstName} ${middleName ? `${middleName} ` : ""}${lastName}`.trim();
}

export async function getPatients() {
  return getStoredPatients();
}

export async function getPatientDetailsList() {
  return getStoredDetails();
}

export async function getPatientById(patientId) {
  const detailsList = getStoredDetails();
  return detailsList.find((p) => p.id === patientId) || null;
}

export async function savePatient(patientData) {
  const currentPatients = getStoredPatients();
  const currentDetails = getStoredDetails();

  const firstName = patientData.firstName || "";
  const middleName = patientData.middleName || "";
  const lastName = patientData.lastName || "";
  const age = patientData.age || "0";
  const sexInput = patientData.sex || "Male";
  const formattedSex = sexInput.charAt(0).toUpperCase();
  const selectedType =
    patientData.patientClassification ||
    patientData.patientCategory ||
    "General Consultation";

  const generatedId = `P-${Date.now()}`;
  const name = buildFullName(firstName, middleName, lastName) || "Unknown Patient";

  const newPatient = {
    id: generatedId,
    firstName,
    middleName,
    lastName,
    name,
    ageSex: `${age}/${formattedSex}`,
    age,
    sex: sexInput,
    contact: patientData.contactNumber || "09XXXXXXXXX",
    lastVisit: new Date().toISOString().split("T")[0],
    type: selectedType,
    category: selectedType,
  };

  const patientDetails = {
    id: generatedId,
    name,
    firstName,
    middleName,
    lastName,
    birthDate: patientData.birthDate || "",
    age,
    sex: sexInput,
    civilStatus: patientData.civilStatus || "",
    notes: patientData.notes || "",
    contactNumber: patientData.contactNumber || "09XXXXXXXXX",
    contact: patientData.contactNumber || "09XXXXXXXXX",
    address: patientData.streetAddress || patientData.address || "N/A",
    municipality: patientData.municipality || "Bulakan",
    barangay: patientData.barangay || "",
    patientClassification: selectedType,
    category: selectedType,

    guardianName: patientData.guardianName || "",
    guardianRelationship: patientData.guardianRelationship || "",
    guardianContact: patientData.guardianContact || "",
    birthWeight: patientData.birthWeight || "",
    feedingStatus: patientData.feedingStatus || "",

    lmp: patientData.lmp || "",
    pmp: patientData.pmp || "",
    cycleDuration: patientData.cycleDuration || "",
    gravida: patientData.gravida || "",
    para: patientData.para || "",
    term: patientData.term || "",
    preterm: patientData.preterm || "",
    abortion: patientData.abortion || "",
    living: patientData.living || "",
    tpal: patientData.tpal || "",

    dateRegistered: new Date().toISOString().split("T")[0],
    records: [],
    referrals: [],
  };

  setStoredPatients([...currentPatients, newPatient]);
  setStoredDetails([...currentDetails, patientDetails]);

  return { patient: newPatient, details: patientDetails };
}

export async function createPatient(patientData) {
  return savePatient(patientData);
}

export async function updatePatient(patientId, patientData) {
  const currentDetails = getStoredDetails();
  const currentPatients = getStoredPatients();

  const updatedDetails = currentDetails.map((p) => {
    if (p.id !== patientId) {
      return p;
    }

    const firstName = patientData.firstName ?? p.firstName;
    const middleName = patientData.middleName ?? p.middleName;
    const lastName = patientData.lastName ?? p.lastName;

    return {
      ...p,
      ...patientData,
      firstName,
      middleName,
      lastName,
      name: buildFullName(firstName, middleName, lastName),
      civilStatus: patientData.civilStatus ?? p.civilStatus,
      notes: patientData.notes ?? p.notes,
      barangay: patientData.barangay ?? p.barangay,
      municipality: patientData.municipality ?? p.municipality,
      contact: patientData.contactNumber || patientData.contact || p.contact,
      contactNumber: patientData.contactNumber || p.contactNumber,
      address: patientData.streetAddress || patientData.address || p.address,
      category:
        patientData.patientClassification || patientData.category || p.category,
      patientClassification:
        patientData.patientClassification || p.patientClassification,

      guardianName: patientData.guardianName ?? p.guardianName,
      guardianRelationship:
        patientData.guardianRelationship ?? p.guardianRelationship,
      guardianContact: patientData.guardianContact ?? p.guardianContact,
      birthWeight: patientData.birthWeight ?? p.birthWeight,
      feedingStatus: patientData.feedingStatus ?? p.feedingStatus,

      lmp: patientData.lmp ?? p.lmp,
      pmp: patientData.pmp ?? p.pmp,
      cycleDuration: patientData.cycleDuration ?? p.cycleDuration,
      gravida: patientData.gravida ?? p.gravida,
      para: patientData.para ?? p.para,
      term: patientData.term ?? p.term,
      preterm: patientData.preterm ?? p.preterm,
      abortion: patientData.abortion ?? p.abortion,
      living: patientData.living ?? p.living,
      tpal: patientData.tpal ?? p.tpal,
    };
  });

  const updatedPatients = currentPatients.map((p) => {
    if (p.id !== patientId) {
      return p;
    }

    const firstName = patientData.firstName ?? p.firstName;
    const middleName = patientData.middleName ?? p.middleName;
    const lastName = patientData.lastName ?? p.lastName;

    return {
      ...p,
      firstName,
      middleName,
      lastName,
      name: buildFullName(firstName, middleName, lastName),
      ageSex: `${patientData.age || p.age || "0"}/${(
        patientData.sex ||
        p.sex ||
        "M"
      )
        .charAt(0)
        .toUpperCase()}`,
      age: patientData.age || p.age,
      sex: patientData.sex || p.sex,
      contact: patientData.contactNumber || p.contact,
      type: patientData.patientClassification || p.type,
      category: patientData.patientClassification || p.category,
    };
  });

  setStoredDetails(updatedDetails);
  setStoredPatients(updatedPatients);

  return updatedDetails.find((p) => p.id === patientId) || null;
}

export async function deletePatient(patientId) {
  const currentPatients = getStoredPatients();
  const currentDetails = getStoredDetails();

  setStoredPatients(currentPatients.filter((p) => p.id !== patientId));
  setStoredDetails(currentDetails.filter((p) => p.id !== patientId));

  return { success: true, message: "Patient deleted" };
}

export async function getPatientRecords() {
  return [];
}

export async function getPatientHealthRecords(patientId) {
  const records = getItem(HEALTH_RECORDS_KEY, []);
  return records.filter((record) => record.patientId === patientId);
}

export async function getPatientReferrals(patientId) {
  const referrals = getItem(REFERRALS_KEY, []);
  return referrals.filter((referral) => referral.patientId === patientId);
}
