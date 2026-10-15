import { Link } from "react-router";
import { ArrowLeft, MapPin } from "lucide-react";

import { RefreshingIndicator } from "../../../common";
import { ConsultationButton, ConsultationNotice, useConsultationActions } from "./ConsultationActions";
import { formatPatientAddress } from "../PatientIdentityCard";
import { formatPatientName } from "../../../../utils/formatters";
import { getPatientAge } from "../../../../utils/patientProfile";
import { getCurrentUser } from "../../../../utils/auth";

function initialsOf(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .filter((part, index, parts) => index === 0 || index === parts.length - 1)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * Identity card at the top of the patient profile: initials, name, Patient ID,
 * age / sex and barangay; the care path (when the viewer may see clinical
 * history) in the middle; the Start / Resume Consultation action on the right.
 * It sits above the tab strip on every tab and carries no status badge:
 * follow-ups have their own card.
 */
export default function PatientProfileHeader({ patient, patientId, backPath, updating = false, carePath = null }) {
  const { consultation, onStart, startModal } = useConsultationActions(patient, patientId);
  const canEncode = (getCurrentUser()?.permissions || []).includes("consultations.encode");
  const name = formatPatientName(patient, "Unnamed Patient");
  const age = getPatientAge(patient);
  const ageSex = [age !== "" ? `${age} yrs` : "", patient.sex].filter(Boolean).join(" · ");
  const address = patient.barangay || formatPatientAddress(patient);

  return (
    <header className="shrink-0">
      <div className="rounded-xl border border-neutral-200/80 bg-white px-3 py-3 shadow-card sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex min-w-0 items-center gap-3 lg:w-[34%] lg:shrink-0">
            <Link
              to={backPath}
              aria-label="Back"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
            <span
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink-50 text-sm font-semibold text-ink-700 ring-1 ring-inset ring-ink-100"
            >
              {initialsOf(name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-6 text-neutral-900 font-sans!" title={name}>
                {name}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-neutral-500">
                <span className="font-mono font-medium text-neutral-600">ID {patient.patientId || patientId}</span>
                {ageSex && (
                  <>
                    <span className="text-neutral-300" aria-hidden="true">·</span>
                    <span className="tabular-nums">{ageSex}</span>
                  </>
                )}
                {address && (
                  <>
                    <span className="text-neutral-300" aria-hidden="true">·</span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin size={13} className="shrink-0 text-neutral-400" aria-hidden="true" />
                      <span className="truncate">{address}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {carePath && (
            <div className="min-w-0 flex-1 border-t border-neutral-100 pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              {carePath}
            </div>
          )}

          <div className="w-full shrink-0 lg:ml-auto lg:w-auto lg:min-w-[190px]">
            {updating && <RefreshingIndicator label="Updating patient details..." />}
            {canEncode && <ConsultationButton consultation={consultation} onStart={onStart} />}
          </div>
        </div>

        {canEncode && <ConsultationNotice consultation={consultation} />}
      </div>
      {canEncode && startModal}
    </header>
  );
}
