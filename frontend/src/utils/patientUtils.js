/**
 * Calculates age based on date of birth.
 * @param {string} birthDate - ISO date string
 * @returns {number|string} Age in years or empty string
 */
export const calculateAge = (birthDate) => {
  if (!birthDate) return "";

  const today = new Date();
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime()) || dob > today) return "";

  let age = today.getFullYear() - dob.getFullYear();
  const monthDifference = today.getMonth() - dob.getMonth();
  const dayDifference = today.getDate() - dob.getDate();

  if (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)) {
    age--;
  }

  return age;
};

/**
 * Calculates full months elapsed from date of birth.
 * @param {string} birthDate - ISO date string
 * @returns {number|string} Age in months or empty string
 */
export const calculateAgeInMonths = (birthDate) => {
  if (!birthDate) return "";

  const today = new Date();
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime()) || dob > today) return "";

  let months =
    (today.getFullYear() - dob.getFullYear()) * 12 +
    (today.getMonth() - dob.getMonth());

  if (today.getDate() < dob.getDate()) {
    months -= 1;
  }

  return Math.max(months, 0);
};

/**
 * Formats patient age for display, including month-based ages for children under 2.
 * @param {string} birthDate - ISO date string
 * @returns {string} Human-readable age
 */
export const formatAgeDisplay = (birthDate) => {
  const ageYears = calculateAge(birthDate);
  const ageMonths = calculateAgeInMonths(birthDate);

  if (ageYears === "" || ageMonths === "") return "";

  if (ageMonths < 12) {
    return `${ageMonths} month${ageMonths === 1 ? "" : "s"} old`;
  }

  if (ageMonths < 24) {
    const years = Math.floor(ageMonths / 12);
    const months = ageMonths % 12;
    const yearText = `${years} year${years === 1 ? "" : "s"}`;
    const monthText =
      months > 0 ? `, ${months} month${months === 1 ? "" : "s"}` : "";

    return `${yearText}${monthText} old`;
  }

  return `${ageYears} year${ageYears === 1 ? "" : "s"} old`;
};

/**
 * Checks if a birthdate belongs to a minor patient.
 * @param {string} birthDate - ISO date string
 * @returns {boolean}
 */
export const isMinorPatient = (birthDate) => {
  const age = calculateAge(birthDate);
  return age !== "" && age < 18;
};

/**
 * Normalizes a raw input to standard Philippine format (+63).
 * @param {string} value - Input string
 * @returns {string} Formatted phone number
 */
export const normalizePhilippineContact = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  let localNumber = digits;

  if (localNumber.startsWith("63")) localNumber = localNumber.slice(2);
  if (localNumber.startsWith("0")) localNumber = localNumber.slice(1);

  localNumber = localNumber.slice(0, 10);
  return localNumber ? `+63${localNumber}` : "";
};

/**
 * Extracts the local 10-digit number for display/input.
 * @param {string} value - Input string
 * @returns {string} Local 10-digit string
 */
export const getPhilippineLocalNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  let localNumber = digits;

  if (localNumber.startsWith("63")) localNumber = localNumber.slice(2);
  if (localNumber.startsWith("0")) localNumber = localNumber.slice(1);

  return localNumber.slice(0, 10);
};

/**
 * Formats the full name from form parts.
 */
export const formatFullName = (firstName, middleName, lastName) => {
  return `${firstName} ${middleName ? middleName + " " : ""}${lastName}`.trim();
};

/**
 * Constructs the TPAL string from maternal data.
 */
export const formatTpal = (term, preterm, abortion, living) => {
  return `${term || 0}-${preterm || 0}-${abortion || 0}-${living || 0}`;
};
