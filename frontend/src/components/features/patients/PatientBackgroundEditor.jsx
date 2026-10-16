import { linkedRelatives } from "../../../utils/historyStep";
import FamilySection from "./history/FamilySection";
import ObstetricSection from "./history/ObstetricSection";
import PastMedicalSection from "./history/PastMedicalSection";
import PersonalSocialSection from "./history/PersonalSocialSection";

/**
 * The form of one Patient Background section while it is being edited on the
 * BHC profile. Reuses the consultation's section forms with the BHC options:
 * no per-visit Similar Illness, no Education & Occupation block. RHU-confirmed
 * conditions stay read-only inside Past Medical History. Controlled: `value`
 * is the section slice as typed, `onChange` receives the next slice.
 *
 * `conditions` is usePatientConditionGroups(...) ({ groups, isLoading, isError }).
 */
export default function PatientBackgroundEditor({ section, value, onChange, patient, conditions, today = new Date() }) {
  if (section === "medical") {
    // While RHU conditions load or after a failed fetch, the notice takes the
    // place of the groups: never an empty "No conditions confirmed by RHU".
    const rhuStatus = conditions?.isLoading ? (
      <p role="status" className="text-[13px] text-neutral-500">Loading RHU-confirmed conditions...</p>
    ) : conditions?.isError ? (
      <p role="alert" className="text-[13px] text-alert-700">
        RHU-confirmed conditions could not be loaded right now. They are not changed by this save.
      </p>
    ) : undefined;
    return (
      <PastMedicalSection
        value={value}
        onChange={onChange}
        conditionGroups={conditions?.groups}
        rhuConditionsSlot={rhuStatus}
      />
    );
  }
  if (section === "family") {
    return (
      <FamilySection
        value={value}
        onChange={onChange}
        relatives={linkedRelatives(patient)}
        showSimilarIllness={false}
      />
    );
  }
  if (section === "social") {
    return (
      <PersonalSocialSection
        value={value}
        onChange={onChange}
        patient={patient}
        householdEnvironment={patient?.householdEnvironment}
        today={today}
        showEducationAndOccupation={false}
      />
    );
  }
  if (section === "obstetric") {
    return <ObstetricSection value={value} onChange={onChange} patient={patient} today={today} />;
  }
  return null;
}
