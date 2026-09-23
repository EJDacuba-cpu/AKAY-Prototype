import { useState } from 'react';
import ModalShell, { ModalButton } from '../../common/modals/ModalShell';
import { emptyVisitPurpose, purposeErrors, serviceEligibility, VISIT_SERVICES } from '../../../utils/visitPurpose';

export default function PurposeOfVisitModal({ value, patient, visitDate, onProceed, onCancel }) {
  const [purpose, setPurpose] = useState(() => value || emptyVisitPurpose());
  const [override, setOverride] = useState(Boolean(value?.overrideReason));
  const error = purposeErrors(purpose, patient, visitDate);
  const entries = Object.entries(VISIT_SERVICES).map(([key, label]) => ({ key, label, ...serviceEligibility(key, patient, visitDate) }));
  const canOverride = entries.some(entry => entry.overridable);
  function toggle(key) {
    setPurpose(current => ({ ...current, services: current.services.includes(key) ? current.services.filter(service => service !== key) : [...current.services, key] }));
  }
  return <ModalShell title="Purpose of Visit" subtitle="Ano ang purpose ng visit ng patient ngayong araw?" size="xl" onClose={onCancel} dismissOnBackdrop={false}
    footer={<><ModalButton variant="secondary" onClick={onCancel}>Cancel</ModalButton><ModalButton variant="primary" disabled={Boolean(error)} onClick={() => onProceed(purpose)}>Proceed</ModalButton></>}>
    <p className="mb-4 text-sm text-slate-600">Pumili ng isa o higit pang serbisyong ibibigay ngayong araw.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.filter(entry => entry.eligible || entry.overridable || purpose.services.includes(entry.key)).map(entry => <label key={entry.key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
        <input type="checkbox" className="mt-1 accent-red-700" checked={purpose.services.includes(entry.key)} disabled={!entry.eligible && !(entry.overridable && override)} onChange={() => toggle(entry.key)} />
        <span><span className="block text-sm font-semibold">{entry.label}</span>{!entry.eligible && <span className="text-xs text-slate-500">{entry.reason}</span>}</span>
      </label>)}
    </div>
    {canOverride && <div className="mt-4 rounded-xl bg-amber-50 p-4">
      <label className="flex gap-2 text-sm font-semibold"><input type="checkbox" checked={override} onChange={event => {
        setOverride(event.target.checked);
        if (!event.target.checked) setPurpose(current => ({ ...current, overrideReason: '', services: current.services.filter(service => serviceEligibility(service, patient, visitDate).eligible) }));
      }} />Override age eligibility (BHC)</label>
      {override && <label className="mt-3 block text-sm">Reason for override<textarea maxLength={1000} value={purpose.overrideReason} onChange={event => setPurpose(current => ({ ...current, overrideReason: event.target.value }))} className="mt-1 w-full rounded-lg border border-amber-200 bg-white p-2" /></label>}
    </div>}
    {error && <p role="status" className="mt-3 text-sm text-slate-600">{error}</p>}
  </ModalShell>;
}
