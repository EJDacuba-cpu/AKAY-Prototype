import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";
import ButtonSpinner from "../../../common/loading/ButtonSpinner";
import FormSelect from "../../../common/forms/FormSelect";
import FormTextarea from "../../../common/forms/FormTextarea";
import { DatePickerField } from "../../../common/forms/DatePickerField";
import { getTodayIsoDate } from "../../../../utils/patientProfile";

/**
 * Enrolls a patient into one of the programs published to this BHC. Mock
 * data for now (see services/communityProgramService.js) - only programs the
 * patient isn't already actively enrolled in are offered.
 */
export default function EnrollProgramModal({
  open,
  programs = [],
  programsLoading = false,
  enrolledProgramIds = [],
  onEnroll,
  onClose,
  submitting = false,
}) {
  const today = getTodayIsoDate();
  const availablePrograms = programs.filter((program) => !enrolledProgramIds.includes(program.id));
  const [programId, setProgramId] = useState("");
  const [enrolledDate, setEnrolledDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setEnrolledDate(today);
    setNotes("");
    setError("");
    // Only reset these when the modal opens, not on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keeps the selected program valid as the (possibly still-loading) catalog
  // arrives, without clobbering a choice the user already made.
  useEffect(() => {
    if (!open) return;
    if (programId && availablePrograms.some((program) => program.id === programId)) return;
    setProgramId(availablePrograms[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, availablePrograms.map((program) => program.id).join(",")]);

  async function handleSubmit() {
    if (!programId) {
      setError("Select a program to enroll this patient in.");
      return;
    }
    if (!enrolledDate || enrolledDate > today) {
      setError("Enrolled date cannot be in the future.");
      return;
    }
    try {
      setError("");
      await onEnroll({ programId, enrolledDate, notes });
    } catch (err) {
      setError(err?.message || "Unable to enroll the patient right now.");
    }
  }

  return (
    <ModalShell
      open={open}
      title="Enroll in Community Program"
      subtitle="Programs published to this BHC by the RHU."
      icon={<ClipboardList size={14} strokeWidth={2.2} />}
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
          <ModalButton
            variant="primary"
            primary
            onClick={handleSubmit}
            disabled={submitting || programsLoading || !availablePrograms.length}
          >
            {submitting && <ButtonSpinner />}
            {submitting ? "Enrolling..." : "Enroll"}
          </ModalButton>
        </>
      }
    >
      {programsLoading ? (
        <p className="text-[13px] text-slate-500">Loading published programs...</p>
      ) : availablePrograms.length === 0 ? (
        <p className="text-[13px] text-slate-500">
          This patient is already enrolled in every program currently published to this BHC.
        </p>
      ) : (
        <div className="space-y-4">
          <FormSelect
            label="Program"
            name="programId"
            value={programId}
            onChange={(event) => setProgramId(event.target.value)}
            required
          >
            {availablePrograms.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name} ({program.category})
              </option>
            ))}
          </FormSelect>

          <DatePickerField
            label="Enrolled Date"
            value={enrolledDate}
            onChange={setEnrolledDate}
            required
          />

          <FormTextarea
            label="Notes (optional)"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Any context worth recording about this enrollment."
          />

          {error && <p className="text-[12px] font-medium text-red-600">{error}</p>}
        </div>
      )}
    </ModalShell>
  );
}
