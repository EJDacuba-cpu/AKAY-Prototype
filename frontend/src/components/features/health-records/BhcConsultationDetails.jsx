import HealthRecordClinicalDetails from './HealthRecordClinicalDetails';
import { PROGRAM_CLASSIFICATIONS, getConsultationPrograms } from '../../../utils/consultationPrograms';
import { VISIT_SERVICES, TEENAGE_PREGNANCY_MESSAGE } from '../../../utils/visitPurpose';

function Details({ rows }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{String(value ?? '').trim() || 'Not recorded'}</dd></div>)}</dl>;
}

export default function BhcConsultationDetails({ record, ...props }) {
  const purpose = record?.monitoringData?.visitPurpose || record?.monitoring_data?.visitPurpose;
  if (!purpose) return <HealthRecordClinicalDetails record={record} {...props} />;
  const programs = getConsultationPrograms(record);
  const categories = [...new Set(programs.map(key => PROGRAM_CLASSIFICATIONS[key]))];
  const maternal = record.maternalData || record.maternal_data || {};
  const postpartumOnly = purpose.services.includes('Postpartum') && !purpose.services.includes('Prenatal');
  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 font-semibold">Purpose of Visit</h2>
      <p className="text-sm">{purpose.services.map(key => VISIT_SERVICES[key] || key).join(' + ')}</p>
      {purpose.overrideReason && <p className="mt-3 text-sm">BHC age eligibility override: {purpose.overrideReason}</p>}
      {purpose.pregnancyConfirmed && <p className="mt-3 text-sm">Pregnancy Confirmed by BHW? {purpose.pregnancyConfirmed}</p>}
      {purpose.pregnancyConfirmed === 'Yes' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{TEENAGE_PREGNANCY_MESSAGE}</p>}
    </section>
    {purpose.services.includes('General') && categories.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 font-semibold">General Consultation</h2>
      <Details rows={[
        ['Chief Complaint', record.chiefComplaint || record.chief_complaint],
        ['History of Present Illness', record.summaryOfPresentIllness || record.history_of_present_illness],
        ['Physical Exam', record.physicalExam || record.physical_exam],
        ['Assessment / Diagnosis', record.diagnosis],
      ]} />
    </section>}
    {categories.length === 0 && <HealthRecordClinicalDetails record={record} {...props} />}
    {categories.map(category => {
      const selected = programs.filter(key => PROGRAM_CLASSIFICATIONS[key] === category);
      const programRecord = { ...record, category, recordType: category, classification: category, patientClassification: category, selectedPrograms: selected };
      if (category !== 'Maternal' || !postpartumOnly) return <HealthRecordClinicalDetails key={category} record={programRecord} {...props} />;
      return <section key={category} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Postpartum Record</h2>
        <Details rows={[
          ['Blood Pressure', [record.systolicBp, record.diastolicBp].filter(Boolean).join(' / ')],
          ['Temperature', record.temperature || record.temp], ['Pulse', record.pulse], ['SpO₂', record.spo2], ['Weight', record.weight], ['Height', record.height],
        ]} />
        <Details rows={[
          ['Gravida', maternal.gravida], ['Para', maternal.para], ['Term', maternal.term], ['Preterm', maternal.preterm], ['Abortion', maternal.abortion], ['Living', maternal.living],
          ['Previous FP Method Used', maternal.previousFpMethodUsed], ['Other FP Method', maternal.previousFpMethodOther],
          ['Treatment / Action Taken', maternal.treatment || record.medication || record.treatment_notes],
        ]} />
        <h3 className="text-sm font-semibold">Laboratory Results</h3>
        <Details rows={Object.entries(maternal.laboratoryResults || {}).map(([key, value]) => [key, [value, maternal.laboratoryResultDates?.[key]].filter(Boolean).join(' · ')])} />
        <h3 className="text-sm font-semibold">Medicines Dispensed</h3>
        <Details rows={(record.dispensedMedicines || record.dispensed_medicines || []).map((medicine, index) => [medicine.medicineName || medicine.medicine_name_snapshot || `Medicine ${index + 1}`, `${medicine.quantity} ${medicine.unit || ''} ${medicine.remarks || ''}`])} />
      </section>;
    })}
  </div>;
}
