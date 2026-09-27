import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";

import ModalShell, { ModalButton } from "../../common/modals/ModalShell";
import ButtonSpinner from "../../common/loading/ButtonSpinner";
import FormTextarea from "../../common/forms/FormTextarea";
import { DatePickerField } from "../../common/forms/DatePickerField";
import { getPatientDetailsListByRole } from "../../../services/patientService";
import { queryKeys } from "../../../utils/queryKeys";
import { getTodayIsoDate } from "../../../utils/patientProfile";

function getPatientDisplayName(patient = {}) {
  return patient.fullName || patient.name || [patient.firstName, patient.lastName].filter(Boolean).join(" ");
}

/**
 * Enrolls an existing patient into this program from the BHC Programs page
 * (as opposed to EnrollProgramModal, which enrolls the current patient into
 * one of several programs from their own profile). Search is a client-side
 * filter over this BHC's patient list, matching the mother-search pattern
 * already used on the patient profile.
 */
export default function AddParticipantModal({
  open,
  enrolledPatientIds = [],
  onEnroll,
  onClose,
  submitting = false,
}) {
  const today = getTodayIsoDate();
  const [search, setSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [enrolledDate, setEnrolledDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const { data: patients = [], isLoading: patientsLoading } = useQuery({
    queryKey: queryKeys.patients("bhc"),
    queryFn: () => getPatientDetailsListByRole("bhc"),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedPatientId("");
    setEnrolledDate(today);
    setNotes("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    return patients
      .filter((patient) => !enrolledPatientIds.includes(String(patient.id)))
      .filter((patient) => {
        if (!term) return true;
        return [getPatientDisplayName(patient), patient.patientId || patient.id, patient.barangay]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .slice(0, 20);
  }, [patients, search, enrolledPatientIds]);

  const selectedPatient = patients.find((patient) => String(patient.id) === selectedPatientId) || null;

  async function handleSubmit() {
    if (!selectedPatient) {
      setError("Search for and select a patient to enroll.");
      return;
    }
    if (!enrolledDate || enrolledDate > today) {
      setError("Enrolled date cannot be in the future.");
      return;
    }
    try {
      setError("");
      await onEnroll({
        patientId: String(selectedPatient.id),
        patientName: getPatientDisplayName(selectedPatient),
        enrolledDate,
        notes,
      });
    } catch (err) {
      setError(err?.message || "Unable to enroll this patient right now.");
    }
  }

  return (
    <ModalShell
      open={open}
      title="Add Participant"
      subtitle="Enroll an existing patient into this program."
      icon={<UserPlus size={14} strokeWidth={2.2} />}
      size="md"
      onClose={submitting ? undefined : onClose}
      closeDisabled={submitting}
      dismissOnBackdrop={!submitting}
      dismissOnEscape={!submitting}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={submitting}>
            Cancel
          </ModalButton>
          <ModalButton variant="primary" primary onClick={handleSubmit} disabled={submitting || !selectedPatient}>
            {submitting && <ButtonSpinner />}
            {submitting ? "Enrolling..." : "Enroll"}
          </ModalButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Patient
          </label>
          <input
            type="text"
            value={selectedPatient ? getPatientDisplayName(selectedPatient) : search}
            onChange={(event) => {
              setSelectedPatientId("");
              setSearch(event.target.value);
            }}
            placeholder="Search by name, patient ID, or barangay"
            className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 hover:border-[#D1D5DB] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
          />
          {!selectedPatient && search.trim() && (
            <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
              {patientsLoading ? (
                <p className="px-3 py-2 text-xs text-slate-500">Loading patients...</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500">No matching patients found.</p>
              ) : (
                results.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      setSelectedPatientId(String(patient.id));
                      setSearch("");
                    }}
                    className="flex w-full flex-col items-start gap-0 px-3 py-2 text-left text-xs hover:bg-[#FEF2F2]"
                  >
                    <span className="font-medium text-gray-900">{getPatientDisplayName(patient)}</span>
                    <span className="text-gray-400">{[patient.patientId || patient.id, patient.barangay].filter(Boolean).join(" · ")}</span>
                  </button>
                ))
              )}
            </div>
          )}
          {selectedPatient && (
            <button
              type="button"
              onClick={() => setSelectedPatientId("")}
              className="mt-1 text-[11px] font-medium text-red-600 hover:underline"
            >
              Change patient
            </button>
          )}
        </div>

        <DatePickerField label="Enrolled Date" value={enrolledDate} onChange={setEnrolledDate} required />

        <FormTextarea
          label="Notes (optional)"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Any context worth recording about this enrollment."
        />

        {error && <p className="text-[12px] font-medium text-red-600">{error}</p>}
      </div>
    </ModalShell>
  );
}
