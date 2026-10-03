/**
 * Read-only context above the Diagnosis field in Assessment: the existing
 * monitoring this visit follows (chosen in Start Consultation). It is shown
 * only so it is not re-entered as a diagnosis - the diagnosis input below is
 * for a new or additional working diagnosis, and what happens to the followed
 * condition is decided in Care Plan & Next Steps. No controls, no
 * suggestions; it renders nothing when none was chosen.
 */
export default function MonitoredConditionsNote({ conditions = [] }) {
  const names = conditions.map((condition) => condition.conditionName).filter(Boolean);
  if (names.length === 0) return null;
  return (
    <section aria-labelledby="assessment-existing-monitoring" className="mb-3 border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2">
      <h3 id="assessment-existing-monitoring" className="text-[11px] font-semibold uppercase tracking-wide text-[#374151]">
        Existing monitoring addressed in this visit
      </h3>
      <p className="mt-1 text-sm font-semibold text-[#111827]">{names.join(", ")}</p>
      <p className="mt-0.5 text-xs text-[#6B7280]">
        Read-only. Its plan for this visit is set in Care Plan &amp; Next Steps. Add a diagnosis below only for a new concern.
      </p>
    </section>
  );
}
