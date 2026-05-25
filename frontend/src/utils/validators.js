/**
 * Validation utilities
 */

export const validators = {
  /**
   * Email validation
   */
  email: (value) => {
    if (!value) return "Email is required";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return "Invalid email format";
    return "";
  },

  /**
   * Phone validation
   */
  phone: (value) => {
    if (!value) return "Phone number is required";
    const phoneRegex = /^[0-9\s+()-]+$/;
    if (!phoneRegex.test(value)) return "Invalid phone number";
    return "";
  },

  /**
   * Required field
   */
  required: (value) => {
    if (!value || (typeof value === "string" && !value.trim())) {
      return "This field is required";
    }
    return "";
  },

  /**
   * Min length validation
   */
  minLength: (min) => (value) => {
    if (!value) return "";
    if (value.length < min) return `Minimum ${min} characters required`;
    return "";
  },

  /**
   * Max length validation
   */
  maxLength: (max) => (value) => {
    if (!value) return "";
    if (value.length > max) return `Maximum ${max} characters allowed`;
    return "";
  },

  /**
   * Age validation
   */
  age: (value) => {
    if (!value) return "Age is required";
    const age = parseInt(value);
    if (isNaN(age) || age < 0 || age > 150) return "Invalid age";
    return "";
  },

  /**
   * Date validation
   */
  date: (value) => {
    if (!value) return "Date is required";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "Invalid date";
    return "";
  },
};

