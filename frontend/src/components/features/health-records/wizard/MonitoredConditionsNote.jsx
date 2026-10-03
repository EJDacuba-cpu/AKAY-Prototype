/**
 * Read-only note above the Diagnosis field for a consultation that addresses
 * existing monitoring (ticked in the Start Consultation modal): it names it
 * so they are not re-entered as new diagnoses. No controls, no suggestions;
 * it renders nothing when none was ticked.
 */
export default function MonitoredConditionsNote({ conditions = [] }) {
  const names = conditions.map((condition) => condition.conditionName).filter(Boolean);
  if (names.length === 0) return null;
  return (
    <p className="mb-3 border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#374151]">
      <span className="font-semibold">Existing monitoring addressed in this visit:</span> {names.join(", ")}. Their care plan is set
      in Care Plan &amp; Next Steps. Add a diagnosis here only for a new concern.
    </p>
  );
}
