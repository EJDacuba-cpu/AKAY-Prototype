const text = (value) => String(value ?? "").trim();

export function savedPrescriptionRows(record) {
  if (!record?.id || !record.finalized_at) return [];
  const rows = (record.monitoringData || record.monitoring_data)?.prescriptions;
  return Array.isArray(rows) ? rows : [];
}

export function prescriptionPrintData(record) {
  const medicines = savedPrescriptionRows(record);
  if (!medicines.length) throw new Error("This finalized consultation has no saved prescriptions.");
  const doctor = record.prescription_prescriber;
  if (!text(doctor?.name) || !doctor?.id) throw new Error("The saved prescribing doctor could not be identified. Printing is unavailable.");
  if (!text(doctor.prcLicenseNumber)) throw new Error("The prescribing doctor's PRC License No. must be completed in their account profile before printing.");
  for (const row of medicines) {
    if (String(row.authorization?.physicianId) !== String(doctor.id)) {
      throw new Error("The saved prescription's prescriber could not be verified. Printing is unavailable.");
    }
    if (["medicineName", "strength", "dose", "route", "frequency", "duration", "authorizedQuantity", "authorizedUnit"]
      .some((key) => !text(row[key]) || /^(?:other(?:\s*\(specify\))?|__other__)$/i.test(text(row[key])))) {
      throw new Error("A saved prescription is incomplete. Review the health record before printing.");
    }
  }
  const patient = record.patient;
  const date = text(record.dateOfVisit || record.date_recorded).slice(0, 10);
  const birth = text(patient?.birthDate || patient?.birthdate).slice(0, 10);
  const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const address = [...new Set([
    patient?.streetAddress || patient?.street_address || patient?.address,
    patient?.purok || patient?.purokArea || patient?.purok_area,
    patient?.barangay, patient?.municipality || patient?.city, patient?.province,
  ].map(text).filter(Boolean))].join(", ");
  if (!text(patient?.name) || !text(patient?.sex) || !address || !validDate(date) || !validDate(birth) || birth > date) {
    throw new Error("Patient name, birth date, sex, address, or consultation date is missing or invalid. Complete the patient information before printing.");
  }
  const age = Number(date.slice(0, 4)) - Number(birth.slice(0, 4)) - (date.slice(5) < birth.slice(5) ? 1 : 0);
  return { recordId: record.id, patient: { name: patient.name, sex: patient.sex, age, address }, date, doctor, medicines };
}
