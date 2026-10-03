import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import { RefreshingIndicator } from "../../../common";
import { ConsultationButton, ConsultationNotice, useConsultationActions } from "./ConsultationActions";
import { formatPatientAddress } from "../PatientIdentityCard";
import { formatPatientName } from "../../../../utils/formatters";
import { getPatientAge } from "../../../../utils/patientProfile";

/**
 * Full-width identity header for the patient profile: name, Patient ID, age,
 * sex and address on the left; the Start / Resume Consultation action on the
 * right. It sits directly on the page surface (no card) above the tab strip
 * on every tab, and carries no status badge: follow-ups have their own card.
 */
export default function PatientProfileHeader({ patient, patientId, backPath, updating = false }) {
  const { consultation, onStart, startModal } = useConsultationActions(patient, patientId);
  const age = getPatientAge(patient);
  const ageText = age !== "" ? `${age} yrs` : "";
  const address = patient.barangay || formatPatientAddress(patient);
  const ageSex = [ageText, patient.sex].filter(Boolean).join(" / ");

  return (
    <header className="shrink-0">
      <div className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            to={backPath}
            aria-label="Back"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-none text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="break-words text-base font-bold leading-tight text-gray-900 font-sans!">
              {formatPatientName(patient, "Unnamed Patient")}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-600">
              <span className="font-mono">Patient ID {patient.patientId || patientId}</span>
              {ageSex && <span className="tabular-nums">{ageSex}</span>}
              {address && <span className="break-words">{address}</span>}
            </div>
          </div>
        </div>

        <div className="w-full shrink-0 sm:w-auto sm:min-w-[200px]">
          {updating && <RefreshingIndicator label="Updating patient details..." />}
          <ConsultationButton consultation={consultation} onStart={onStart} />
        </div>
      </div>

      <ConsultationNotice consultation={consultation} />
      {startModal}
    </header>
  );
}
