/**
 * Body Mass Index, derived rather than stored.
 *
 * A record stores the weight and height that were measured; BMI is always
 * recomputed from them so it cannot drift out of step with the measurements it
 * came from.
 */

/**
 * @param {string|number} weightKg
 * @param {string|number} heightCm
 * @returns {number|null} null when either measurement is missing or unusable.
 */
export function calculateBmi(weightKg, heightCm) {
  const kg = Number.parseFloat(weightKg);
  const metres = Number.parseFloat(heightCm) / 100;

  if (!(kg > 0) || !(metres > 0)) return null;

  return kg / (metres * metres);
}

/** WHO adult cut-offs. Not valid for children - see getLatestBmiRecord. */
export function getBmiCategory(bmi) {
  if (bmi === null || bmi === undefined) return "";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

export function formatBmi(bmi) {
  return bmi === null || bmi === undefined ? "" : bmi.toFixed(1);
}

/**
 * The most recent record that carries BOTH measurements.
 *
 * Weight and height must come from the same visit - pairing a weight taken
 * today with a height taken a year ago would produce a number that describes
 * neither. Expects records sorted newest first.
 */
export function getLatestBmiRecord(records = []) {
  return (
    records.find(
      (record) => calculateBmi(record?.weight, record?.height) !== null,
    ) || null
  );
}
