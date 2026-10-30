/**
 * Client-side check for the optional Fasting Blood Sugar (FBS) measurement.
 *
 * Range only (0-1000 mg/dL, matching the server). The value is recorded as
 * typed: nothing is derived from it - no flag, alert, suggestion or status.
 *
 * @returns {string} an error message, or "" when blank or valid
 */
export function validateFbs(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (text === "") return "";
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 1000) {
    return "Enter a valid FBS between 0 and 1000 mg/dL.";
  }
  return "";
}
