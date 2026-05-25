/**
 * Direct LocalStorage Patient Service
 * Optimized for AKAY Healthcare Referral System
 * Supports:
 * - General Patients
 * - Maternal Records
 * - Immunization Records
 * - LocalStorage Persistence
 */

// ===============================
// LOCAL STORAGE HELPERS
// ===============================

const getStoredPatients = () => {
  try {
    return JSON.parse(localStorage.getItem("patients") || "[]");
  } catch (e) {
    return [];
  }
};

const setStoredPatients = (data) => {
  localStorage.setItem("patients", JSON.stringify(data));
};

const getStoredDetails = () => {
  try {
    return JSON.parse(localStorage.getItem("patient_details") || "[]");
  } catch (e) {
    return [];
  }
};

const setStoredDetails = (data) => {
  localStorage.setItem("patient_details", JSON.stringify(data));
};

// ===============================
// GET ALL PATIENTS
// ===============================

export async function getPatients() {
  return getStoredPatients();
}

// ===============================
// GET PATIENT BY ID
// ===============================

export async function getPatientById(patientId) {
  const detailsList = getStoredDetails();

  return detailsList.find((p) => p.id === patientId) || null;
}

// ===============================
// CREATE PATIENT
// ===============================

export async function createPatient(patientData) {
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

  // ===============================
  // MAIN TABLE PATIENT
  // ===============================

  const newPatient = {
    id: generatedId,

    firstName,
    middleName,
    lastName,

    name:
      `${firstName} ${middleName ? middleName + " " : ""}${lastName}`.trim() ||
      "Unknown Patient",

    age: age,

    sex: sexInput,

    ageSex: `${age}/${formattedSex}`,

    contact: patientData.contactNumber || "09XXXXXXXXX",

    lastVisit: new Date().toISOString().split("T")[0],

    type: selectedType,

    category: selectedType,
  };

  // ===============================
  // FULL PATIENT DETAILS
  // ===============================

  const patientDetails = {
    id: generatedId,

    // BASIC INFO
    firstName,
    middleName,
    lastName,

    name: newPatient.name,

    birthDate: patientData.birthDate || "",

    age,

    sex: sexInput,

    civilStatus: patientData.civilStatus || "",

    // CONTACT
    contact: patientData.contactNumber || "09XXXXXXXXX",

    contactNumber: patientData.contactNumber || "09XXXXXXXXX",

    // ADDRESS
    address: patientData.streetAddress || patientData.address || "N/A",

    barangay: patientData.barangay || "",

    municipality: patientData.municipality || "Bulakan",

    // CLASSIFICATION
    patientClassification: selectedType,

    category: selectedType,

    // ===========================
    // IMMUNIZATION
    // ===========================

    guardianName: patientData.guardianName || "",

    guardianRelationship: patientData.guardianRelationship || "",

    guardianContact: patientData.guardianContact || "",

    birthWeight: patientData.birthWeight || "",

    feedingStatus: patientData.feedingStatus || "",

    // ===========================
    // MATERNAL
    // ===========================

    lmp: patientData.lmp || "",

    pmp: patientData.pmp || "",

    cycleDuration: patientData.cycleDuration || "",

    gravida: patientData.gravida || "",

    para: patientData.para || "",

    term: patientData.term || "",

    preterm: patientData.preterm || "",

    abortion: patientData.abortion || "",

    living: patientData.living || "",

    // NOTES
    notes: patientData.notes || "",

    // SYSTEM
    dateRegistered: new Date().toISOString().split("T")[0],

    records: [],

    referrals: [],
  };

  // SAVE
  setStoredPatients([...currentPatients, newPatient]);

  setStoredDetails([...currentDetails, patientDetails]);

  return {
    patient: newPatient,
    details: patientDetails,
  };
}

// ===============================
// UPDATE PATIENT
// ===============================

export async function updatePatient(patientId, patientData) {
  const currentDetails = getStoredDetails();

  const currentPatients = getStoredPatients();

  // ===============================
  // UPDATE DETAILS
  // ===============================

  const updatedDetails = currentDetails.map((p) =>
    p.id === patientId
      ? {
          ...p,
          ...patientData,

          // BASIC
          firstName: patientData.firstName ?? p.firstName,

          middleName: patientData.middleName ?? p.middleName,

          lastName: patientData.lastName ?? p.lastName,

          name: `${patientData.firstName ?? p.firstName} ${
            (patientData.middleName ?? p.middleName)
              ? `${patientData.middleName ?? p.middleName} `
              : ""
          }${patientData.lastName ?? p.lastName}`.trim(),

          birthDate: patientData.birthDate ?? p.birthDate,

          age: patientData.age ?? p.age,

          sex: patientData.sex ?? p.sex,

          civilStatus: patientData.civilStatus ?? p.civilStatus,

          // CONTACT
          contact:
            patientData.contactNumber ?? patientData.contact ?? p.contact,

          contactNumber: patientData.contactNumber ?? p.contactNumber,

          // ADDRESS
          address:
            patientData.streetAddress ?? patientData.address ?? p.address,

          barangay: patientData.barangay ?? p.barangay,

          municipality: patientData.municipality ?? p.municipality,

          // CLASSIFICATION
          category: patientData.patientClassification ?? p.category,

          patientClassification:
            patientData.patientClassification ?? p.patientClassification,

          // IMMUNIZATION
          guardianName: patientData.guardianName ?? p.guardianName,

          guardianRelationship:
            patientData.guardianRelationship ?? p.guardianRelationship,

          guardianContact: patientData.guardianContact ?? p.guardianContact,

          birthWeight: patientData.birthWeight ?? p.birthWeight,

          feedingStatus: patientData.feedingStatus ?? p.feedingStatus,

          // MATERNAL
          lmp: patientData.lmp ?? p.lmp,

          pmp: patientData.pmp ?? p.pmp,

          cycleDuration: patientData.cycleDuration ?? p.cycleDuration,

          gravida: patientData.gravida ?? p.gravida,

          para: patientData.para ?? p.para,

          term: patientData.term ?? p.term,

          preterm: patientData.preterm ?? p.preterm,

          abortion: patientData.abortion ?? p.abortion,

          living: patientData.living ?? p.living,

          // NOTES
          notes: patientData.notes ?? p.notes,
        }
      : p,
  );

  // ===============================
  // UPDATE MAIN TABLE
  // ===============================

  const updatedPatients = currentPatients.map((p) =>
    p.id === patientId
      ? {
          ...p,

          firstName: patientData.firstName ?? p.firstName,

          middleName: patientData.middleName ?? p.middleName,

          lastName: patientData.lastName ?? p.lastName,

          name: `${patientData.firstName ?? p.firstName} ${
            (patientData.middleName ?? p.middleName)
              ? `${patientData.middleName ?? p.middleName} `
              : ""
          }${patientData.lastName ?? p.lastName}`.trim(),

          age: patientData.age ?? p.age,

          sex: patientData.sex ?? p.sex,

          ageSex: `${patientData.age ?? p.age ?? "0"}/${(
            patientData.sex ??
            p.sex ??
            "M"
          )
            .charAt(0)
            .toUpperCase()}`,

          contact: patientData.contactNumber ?? p.contact,

          type: patientData.patientClassification ?? p.type,

          category: patientData.patientClassification ?? p.category,
        }
      : p,
  );

  // SAVE
  setStoredDetails(updatedDetails);

  setStoredPatients(updatedPatients);

  return updatedDetails.find((p) => p.id === patientId);
}

// ===============================
// DELETE PATIENT
// ===============================

export async function deletePatient(patientId) {
  const currentPatients = getStoredPatients();

  const currentDetails = getStoredDetails();

  setStoredPatients(currentPatients.filter((p) => p.id !== patientId));

  setStoredDetails(currentDetails.filter((p) => p.id !== patientId));

  return {
    success: true,
    message: "Patient deleted",
  };
}

// ===============================
// HEALTH RECORDS
// ===============================

export async function getPatientRecords(patientId) {
  return [];
}

export async function getPatientHealthRecords(patientId) {
  return [];
}

// ===============================
// REFERRALS
// ===============================

export async function getPatientReferrals(patientId) {
  return [];
}
