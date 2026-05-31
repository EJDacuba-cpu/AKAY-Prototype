/**
 * Calculates age based on date of birth.
 * @param {string} birthDate - ISO date string
 * @returns {number|string} Age in years or empty string
 */
export const calculateAge = (birthDate) => {
  if (!birthDate) return "";

  const today = new Date();
  const dob = new Date(birthDate);

  let age = today.getFullYear() - dob.getFullYear();
  const monthDifference = today.getMonth() - dob.getMonth();
  const dayDifference = today.getDate() - dob.getDate();

  if (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)) {
    age--;
  }

  return age;
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
