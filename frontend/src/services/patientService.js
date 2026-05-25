/**
 * Direct LocalStorage Patient Service
 * Ligtas sa ReferenceError at walang umaasang mock data fields
 */

// Helper functions para sa LocalStorage handling
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

/**
 * Get all patients
 */
export async function getPatients() {
  return getStoredPatients();
}

/**
 * Get patient by ID
 */
export async function getPatientById(patientId) {
  const detailsList = getStoredDetails();
  return detailsList.find((p) => p.id === patientId) || null;
}

/**
 * Create new patient
 */
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

  const newPatient = {
    id: generatedId,
    firstName: firstName,
    middleName: middleName,
    lastName: lastName,
    name:
      `${firstName} ${middleName ? middleName + " " : ""}${lastName}`.trim() ||
      "Unknown Patient",
    ageSex: `${age}/${formattedSex}`,
    age: age,
    sex: sexInput,
    contact: patientData.contactNumber || "09XXXXXXXXX",
    lastVisit: new Date().toISOString().split("T")[0],
    type: selectedType,
    category: selectedType,
  };

  const patientDetails = {
    id: generatedId,
    name: newPatient.name,
    firstName: firstName,
    middleName: middleName,
    lastName: lastName,
    birthDate: patientData.birthDate || "",
    age: age,
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

    // IMMUNIZATION
    guardianName: patientData.guardianName || "",
    guardianRelationship: patientData.guardianRelationship || "",
    guardianContact: patientData.guardianContact || "",
    birthWeight: patientData.birthWeight || "",
    feedingStatus: patientData.feedingStatus || "",

    // MATERNAL
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

/**
 * Update patient
 */
export async function updatePatient(patientId, patientData) {
  const currentDetails = getStoredDetails();
  const currentPatients = getStoredPatients();

  // 1. Detailed Patient Record
  const updatedDetails = currentDetails.map((p) =>
    p.id === patientId
      ? {
          ...p,
          ...patientData,
          firstName:
            patientData.firstName !== undefined
              ? patientData.firstName
              : p.firstName,
          middleName:
            patientData.middleName !== undefined
              ? patientData.middleName
              : p.middleName,
          lastName:
            patientData.lastName !== undefined
              ? patientData.lastName
              : p.lastName,
          name: `${patientData.firstName !== undefined ? patientData.firstName : p.firstName} ${
            (
              patientData.middleName !== undefined
                ? patientData.middleName
                : p.middleName
            )
              ? (patientData.middleName !== undefined
                  ? patientData.middleName
                  : p.middleName) + " "
              : ""
          }${patientData.lastName !== undefined ? patientData.lastName : p.lastName}`.trim(),

          civilStatus:
            patientData.civilStatus !== undefined
              ? patientData.civilStatus
              : p.civilStatus,
          notes: patientData.notes !== undefined ? patientData.notes : p.notes,
          barangay:
            patientData.barangay !== undefined
              ? patientData.barangay
              : p.barangay,
          municipality:
            patientData.municipality !== undefined
              ? patientData.municipality
              : p.municipality,

          contact:
            patientData.contactNumber || patientData.contact || p.contact,
          contactNumber: patientData.contactNumber || p.contactNumber,
          address:
            patientData.streetAddress || patientData.address || p.address,
          category:
            patientData.patientClassification ||
            patientData.category ||
            p.category,
          patientClassification:
            patientData.patientClassification || p.patientClassification,

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

          tpal: patientData.tpal ?? p.tpal,
        }
      : p,
  );

  // 2. Main Patient list (Para sa Table module dashboard)
  const updatedPatients = currentPatients.map((p) =>
    p.id === patientId
      ? {
          ...p,
          firstName:
            patientData.firstName !== undefined
              ? patientData.firstName
              : p.firstName,
          middleName:
            patientData.middleName !== undefined
              ? patientData.middleName
              : p.middleName,
          lastName:
            patientData.lastName !== undefined
              ? patientData.lastName
              : p.lastName,
          name: `${patientData.firstName !== undefined ? patientData.firstName : p.firstName} ${
            (
              patientData.middleName !== undefined
                ? patientData.middleName
                : p.middleName
            )
              ? (patientData.middleName !== undefined
                  ? patientData.middleName
                  : p.middleName) + " "
              : ""
          }${patientData.lastName !== undefined ? patientData.lastName : p.lastName}`.trim(),
          ageSex: `${patientData.age || p.age || "0"}/${(patientData.sex || p.sex || "M").charAt(0).toUpperCase()}`,
          age: patientData.age || p.age,
          sex: patientData.sex || p.sex,
          contact: patientData.contactNumber || p.contact,
          type: patientData.patientClassification || p.type,
          category: patientData.patientClassification || p.category,
        }
      : p,
  );

  setStoredDetails(updatedDetails);
  setStoredPatients(updatedPatients);

  return updatedDetails.find((p) => p.id === patientId);
}

/**
 * Delete patient
 */
export async function deletePatient(patientId) {
  const currentPatients = getStoredPatients();
  const currentDetails = getStoredDetails();

  setStoredPatients(currentPatients.filter((p) => p.id !== patientId));
  setStoredDetails(currentDetails.filter((p) => p.id !== patientId));

  return { success: true, message: "Patient deleted" };
}

export async function getPatientRecords(patientId) {
  return [];
}

export async function getPatientHealthRecords(patientId) {
  try {
    const localRecords = localStorage.getItem("bhc_health_records") || "[]";

    const parsedRecords = JSON.parse(localRecords);

    return parsedRecords.filter((record) => record.patientId === patientId);
  } catch (error) {
    console.error("Failed to get patient records:", error);
    return [];
  }
}

export async function getPatientReferrals(patientId) {
  try {
    const localReferrals = localStorage.getItem("bhc_referrals") || "[]";

    const parsedReferrals = JSON.parse(localReferrals);

    return parsedReferrals.filter(
      (referral) => referral.patientId === patientId,
    );
  } catch (error) {
    console.error("Failed to get referrals:", error);
    return [];
  }
}
