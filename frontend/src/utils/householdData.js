// Transport and identity helpers. No session, mock records, or browser storage.
const id = value => value == null ? '' : String(value);
export function normalizeHouseholdPatient(patient = {}) {
  return { ...patient, id: id(patient.id),
    firstName: patient.first_name ?? patient.firstName ?? '', middleName: patient.middle_name ?? patient.middleName ?? '',
    lastName: patient.last_name ?? patient.lastName ?? '', birthDate: patient.birthdate ?? patient.birthDate ?? '',
    householdId: id(patient.household_id ?? patient.householdId),
    familySerialNumber: patient.family_serial_number ?? patient.familySerialNumber ?? '',
    relationshipToHouseholdHead: patient.relationship_to_household_head ?? patient.relationshipToHouseholdHead ?? '',
    streetAddress: patient.street_address ?? patient.streetAddress ?? '', purokArea: patient.purok_area ?? patient.purokArea ?? '',
    motherPatientId: id(patient.mother_patient_id ?? patient.motherPatientId), fatherPatientId: id(patient.father_patient_id ?? patient.fatherPatientId),
  };
}
export function normalizeHousehold(item = {}) {
  return { ...item, id:id(item.id), serialNumber:item.serial_number ?? item.serialNumber ?? '',
    headPatientId:id(item.head_patient_id ?? item.headPatientId), archivedAt:item.archived_at ?? item.archivedAt ?? null,
    address:item.address || {}, members:(item.members || []).map(normalizeHouseholdPatient) };
}
export function householdRegistry(households = [], patient) {
  const unique = [...new Map(households.filter(Boolean).map(item => [item.id,item])).values()];
  return { households:unique, patients:[...new Map([...unique.flatMap(item => item.members || []), ...(patient ? [patient] : [])].map(item => [item.id,item])).values()], connections:[] };
}
export function householdPayload(connection, registry = {households:[]}) {
  if (!connection) return null;
  if (connection.kind === 'existing') return { kind:'existing',household_id:connection.householdId,relationship:connection.relationship,
    version:registry.households.find(item => item.id === connection.householdId)?.version };
  const household=connection.household;
  return {kind:'new',serial_mode:household.serialMode || 'auto',address:household.address,
    ...(household.serialMode === 'manual' ? {serial_number:household.serialNumber} : {})};
}
export function householdKeys(user = {}) {
  return ['bhc-households',id(user.id),id(user.backendRole || user.role),id(user.barangayHealthCenterId || user.facilityId),id(user.working_facility_key)];
}
const fields={first_name:'firstName',middle_name:'middleName',last_name:'lastName',birthdate:'birthDate',street_address:'streetAddress',purok_area:'purokArea',civil_status:'civilStatus',contact_number:'contactNumber',philhealth_number:'philHealthNumber',mother_name:'motherName',mother_birth_date:'motherBirthDate',father_birth_date:'fatherBirthDate',family_serial_number:'familySerialNumber',education_level:'educationLevel',education_completed:'educationCompleted'};
export function registrationErrors(error = {}) {
  const result={};
  for (const [key,value] of Object.entries(error.errors || {})) {
    const target=key === 'household.relationship' ? 'relationshipToHouseholdHead'
      : key.startsWith('household') || key.startsWith('head_replacement') || key.startsWith('relationships') || key === 'head_patient_id' ? 'familySerialNumber' : fields[key] || key;
    result[target]=Array.isArray(value) ? value[0] : String(value);
  }
  if (!Object.keys(result).length) result.familySerialNumber=error.message || 'Unable to save. Please try again.';
  return result;
}
