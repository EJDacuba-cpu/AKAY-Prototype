/**
 * Formatting utilities for common data types
 */

/**
 * Format currency
 */
export function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Format phone number
 */
export function formatPhoneNumber(phone) {
  if (!phone) return "N/A";
  // Format: 09XX-XXX-XXXX
  return phone.replace(/(\d{2})(\d{2})(\d{3})(\d{4})/, "$1$2-$3-$4");
}

/**
 * Format name (capitalize first letter of each word)
 */
export function formatName(name) {
  if (!name) return "N/A";
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Truncate text to length
 */
export function truncate(text, length = 50) {
  if (!text) return "N/A";
  return text.length > length ? `${text.substring(0, length)}...` : text;
}

export default {
  formatCurrency,
  formatPhoneNumber,
  formatName,
  truncate,
};
