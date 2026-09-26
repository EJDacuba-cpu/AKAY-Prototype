import { TEENAGE_PREGNANCY_MESSAGE } from '../../../utils/visitPurpose';

export default function PregnancyConfirmation({ value, onChange }) {
  return <fieldset>
    <legend className="mb-3 text-sm font-semibold">Pregnancy Confirmed by BHW?</legend>
    <div className="flex gap-6">{['Yes', 'No'].map(answer => <label key={answer} className="flex items-center gap-2">
      <input type="radio" name="pregnancyConfirmed" className="accent-[#DC2626]" checked={value === answer} onChange={() => onChange(answer)} />{answer}
    </label>)}</div>
    {value === 'Yes' && <p role="alert" className="mt-4 rounded-none border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 p-4 text-sm text-amber-900">{TEENAGE_PREGNANCY_MESSAGE}</p>}
  </fieldset>;
}
