import { PatientRegistrationPage } from "../bhc/AddPatient";
import { createRhuPatient } from "../../services/patientService";

export default function RHUAddPatient() {
  return (
    <PatientRegistrationPage
      role="rhu"
      basePath="/rhu"
      createPatient={createRhuPatient}
      queryRole="rhu"
      systemDescription="Register a new patient profile into the Rural Health Unit system."
    />
  );
}
