import { PatientRegistrationPage } from "../bhc/AddPatient";

export default function RHUAddPatient() {
  return (
    <PatientRegistrationPage
      role="rhu"
      basePath="/rhu"
      systemDescription="Register a new patient profile into the Rural Health Unit system."
    />
  );
}
