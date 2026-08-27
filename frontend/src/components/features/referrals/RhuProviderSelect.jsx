/**
 * Preferred RHU provider picker (REF-SLIP-05).
 *
 * Shared by both BHW referral-creating screens so the Decision A affordance
 * cannot drift between them - divergent per-screen copies of referral logic are
 * exactly what produced the earlier urgency-mapping defects.
 *
 * REF-SLIP-05b: the preference is advisory. DOC-15 reserves the final
 * assignment to the RHU, so nothing here binds the receiving facility.
 *
 * REF-SLIP-05c: unavailable providers stay SELECTABLE. Disabling them makes the
 * server's Continue Anyway flow unreachable and silently converts a non-binding
 * preference into a hard block.
 */
export default function RhuProviderSelect({
  providers = [],
  selectedProviderId = "",
  onChange,
  disabled = false,
  name = "preferredRhuDoctorId",
  label = "Preferred RHU Doctor (Optional)",
}) {
  const selected = providers.find(
    (provider) => String(provider.id) === String(selectedProviderId),
  );
  const selectedUnavailable = selected?.status === "Unavailable";

  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>

      <select
        name={name}
        value={selectedProviderId}
        onChange={onChange}
        disabled={disabled}
        className={`h-11 w-full rounded-xl border bg-white px-4 text-sm text-slate-800 outline-none transition-all focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          selectedUnavailable ? "border-amber-300" : "border-slate-200"
        }`}
      >
        <option value="">RHU to assign</option>
        {providers.map((provider) => {
          const unavailable = provider.status === "Unavailable";
          const statusLabel =
            unavailable && provider.note
              ? `Unavailable - ${provider.note}`
              : provider.status;

          return (
            <option key={provider.id} value={provider.id}>
              {provider.name} - {statusLabel}
            </option>
          );
        })}
      </select>

      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
        Advisory only. RHU may assign the final attending doctor upon receiving
        the patient.
      </p>
    </div>
  );
}
