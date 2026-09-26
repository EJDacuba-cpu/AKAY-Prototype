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
  const select = <label className="block font-sans text-xs font-medium text-gray-600">Working at:
    <select aria-label="Working at facility" className="ml-2 max-w-48 rounded-none border border-gray-200 bg-white p-2 font-sans text-gray-900 transition-colors hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" value={user.working_facility_key || ""} disabled={busy || (editing && !required)} onChange={e => choose(e.target.value)}>
      <option value="">Select duty location</option>
      {choices.map(f => <option key={f.key} value={f.key}>{f.name}{f.is_home ? " (Home)" : ""}</option>)}
    </select>
    {editing && !required && <span className="block text-[10px] font-normal">Finish or leave the form before switching.</span>}
    {error && <span role="alert" className="block text-red-700">{error}</span>}
  </label>;
  return required ? <div role="dialog" aria-modal="true" aria-label="Select duty location" className="fixed inset-0 z-[300] grid place-items-center bg-gray-900/40 p-5"><div className="rounded-none border border-gray-200 bg-white p-6 font-sans shadow-xl"><h2 className="mb-2 font-sans text-lg font-semibold tracking-tight">Where are you working today?</h2><p className="mb-5 text-sm text-gray-500">Choose an authorized facility to continue.</p>{select}</div></div> : select;
}
