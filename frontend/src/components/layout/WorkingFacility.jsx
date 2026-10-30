import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { getStoredAuthUser, selectWorkingFacility } from "../../services/apiClient";

export default function WorkingFacility() {
  const user = getStoredAuthUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = user?.authorized_facilities || [];
  if (user?.role === "admin" || !choices.length) return null;
  // Switching is deliberately unavailable anywhere an active form can be edited.
  const editing = /consultation|add|edit|create|register|new|profile/.test(location.pathname);
  const required = !user.working_facility_key && choices.length > 1;
  async function choose(key) {
    if (!key) return;
    setBusy(true);
    try {
      const selected = await selectWorkingFacility(key);
      navigate(selected.navigation.home, { replace: true });
      window.dispatchEvent(new Event("akay:facility-changed"));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const select = <label className="block font-sans text-xs font-medium text-neutral-500"><span className="sr-only sm:not-sr-only">Working at</span>
    <select aria-label="Working at facility" className="h-9 max-w-24 truncate rounded-lg [field-sizing:content] sm:ml-2 sm:max-w-80 border border-neutral-200 bg-white pl-2.5 pr-8 font-sans text-[13px] font-medium text-neutral-900 shadow-xs transition-colors hover:border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 disabled:cursor-not-allowed disabled:opacity-50" value={user.working_facility_key || ""} disabled={busy || (editing && !required)} onChange={e => choose(e.target.value)}>
      <option value="">Select duty location</option>
      {choices.map(f => <option key={f.key} value={f.key}>{f.name}{f.is_home ? " (Home)" : ""}</option>)}
    </select>
    {editing && !required && <span className="block text-[10px] font-normal text-neutral-500">Finish or leave the form before switching.</span>}
    {error && <span role="alert" className="block text-alert-700">{error}</span>}
  </label>;
  return required ? <div role="dialog" aria-modal="true" aria-label="Select duty location" className="fixed inset-0 z-[300] grid place-items-center bg-neutral-900/40 p-5"><div className="rounded-2xl border border-neutral-200 bg-white p-6 font-sans shadow-xl"><h2 className="mb-2 font-sans text-lg font-semibold text-neutral-900">Where are you working today?</h2><p className="mb-5 text-sm text-neutral-500">Choose an authorized facility to continue.</p>{select}</div></div> : select;
}
