import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { Check, Minus, Plus, X } from "lucide-react";

import ActionMenu from "../../common/tables/ActionMenu";
import ConfirmationModal from "../../common/modals/ConfirmationModal";
import { EmptyNote, ProfileSection } from "../patients/profile/ProfileSection";
import WithdrawReasonModal from "./WithdrawReasonModal";
import AddParticipantModal from "./AddParticipantModal";
import { formatShortDate } from "../../../utils/patientProfile";
import StartConsultationModal from "../patients/profile/StartConsultationModal";
import usePatientConsultation from "../../../hooks/usePatientConsultation";
import { startConsultationAction, startRoute } from "../../../utils/startConsultation";

const STATUS_STYLES = {
  Enrolled: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  Completed: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
  Withdrawn: "border-[#E5E7EB] bg-[#F8FAFC] text-[#475569]",
};

/**
 * A participant's Start / Resume Consultation, with the same behaviour as the
 * patient profile header (usePatientConsultation): an unfinished draft is
 * resumed; otherwise, when the patient has active monitored conditions, the
 * Start Consultation modal opens to optionally add them; else a new consultation.
 */
function ParticipantConsultationAction({ patientId, patientName }) {
  const consultation = usePatientConsultation(patientId);
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const action = startConsultationAction(consultation);
  const label = consultation.primaryLabel;
  const ariaLabel = `${label} for ${patientName || "this patient"}`;
  const className = "text-xs font-medium text-red-600 hover:underline";

  let control;
  if (consultation.isError) {
    control = (
      <button
        type="button"
        onClick={consultation.retry}
        title="Unable to check for an unfinished consultation."
        className="text-xs font-medium text-gray-600 hover:underline"
      >
        Retry check
      </button>
    );
  } else if (action === "disabled") {
    control = <span className="text-xs font-medium text-gray-400">{consultation.isPending ? "Checking..." : label}</span>;
  } else if (action === "modal") {
    control = (
      <button type="button" onClick={() => setModalOpen(true)} aria-label={ariaLabel} className={className}>
        {label}
      </button>
    );
  } else {
    control = (
      <Link to={consultation.startPath} aria-label={ariaLabel} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <>
      {control}
      {modalOpen &&
        consultation.needsStartModal &&
        createPortal(
          <StartConsultationModal
            overview={consultation.careOverview}
            onCancel={() => setModalOpen(false)}
            onStart={({ monitoringIds }) =>
              navigate(startRoute({ patientId, monitoringIds }))
            }
          />,
          document.body,
        )}
    </>
  );
}

function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-none border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        STATUS_STYLES[status] || STATUS_STYLES.Withdrawn
      }`}
    >
      {status}
    </span>
  );
}

const NEXT_MARK = { null: "present", present: "absent", absent: null };
const MARK_STYLES = {
  present: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
  absent: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  null: "border-[#E5E7EB] bg-white text-gray-300",
};
const MARK_ICON = { present: Check, absent: X, null: Minus };

/** Cycles Not yet recorded -> Present -> Absent -> Not yet recorded per click. */
function SessionAttendanceButton({ session, mark, onChange, disabled }) {
  const current = mark || null;
  const Icon = MARK_ICON[current];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(session.id, NEXT_MARK[String(current)])}
      title={`${session.label} · ${formatShortDate(session.date)} · ${current ? (current === "present" ? "Present" : "Absent") : "Not yet recorded"}`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-none border transition disabled:cursor-not-allowed disabled:opacity-50 ${MARK_STYLES[String(current)]}`}
    >
      <Icon size={12} aria-hidden="true" />
    </button>
  );
}

/**
 * A program's participant roster: enrollment status, per-session attendance
 * against the RHU-defined sessions, and quick access to start a consultation
 * for that patient. Clinical records are still only ever created through the
 * normal consultation workflow - this just links to it.
 */
export default function ParticipantsTab({
  program,
  participants = [],
  isLoading = false,
  onAddParticipant,
  onComplete,
  onWithdraw,
  onMarkAttendance,
  markingAttendance = false,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(null);
  const [pendingWithdraw, setPendingWithdraw] = useState(null);
  const [actionPending, setActionPending] = useState(false);

  const sessions = program.sessions || [];
  const enrolledPatientIds = participants
    .filter((participant) => participant.status === "Enrolled")
    .map((participant) => String(participant.patientId));

  async function handleAddParticipant(payload) {
    try {
      setAddSubmitting(true);
      await onAddParticipant(payload);
      setAddOpen(false);
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleComplete() {
    if (!pendingComplete) return;
    try {
      setActionPending(true);
      await onComplete(pendingComplete.id);
      setPendingComplete(null);
    } finally {
      setActionPending(false);
    }
  }

  async function handleWithdraw(reason) {
    if (!pendingWithdraw) return;
    try {
      setActionPending(true);
      await onWithdraw(pendingWithdraw.id, reason);
      setPendingWithdraw(null);
    } finally {
      setActionPending(false);
    }
  }

  return (
    <>
      <ProfileSection
        id="program-participants"
        title="Participants"
        meta={`${participants.length} enrolled to date`}
        actions={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-none bg-red-600 px-2.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
          >
            <Plus size={12} aria-hidden="true" />
            Add Participant
          </button>
        }
      >
        {isLoading ? (
          <EmptyNote>Loading participants...</EmptyNote>
        ) : participants.length === 0 ? (
          <EmptyNote>No patients enrolled in this program yet.</EmptyNote>
        ) : (
          <ul className="divide-y divide-gray-100 border-y border-gray-100">
            {participants.map((participant) => (
              <li key={participant.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-gray-900">{participant.patientName}</span>
                    <StatusPill status={participant.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Enrolled {formatShortDate(participant.enrolledDate)}
                    {participant.status === "Withdrawn" && participant.withdrawReason
                      ? ` · Withdrawn: ${participant.withdrawReason}`
                      : ""}
                  </p>
                </div>

                {sessions.length > 0 && (
                  <div className="flex items-center gap-1" aria-label={`Attendance for ${participant.patientName}`}>
                    {sessions.map((session) => (
                      <SessionAttendanceButton
                        key={session.id}
                        session={session}
                        mark={participant.attendance?.[session.id]}
                        disabled={markingAttendance || participant.status === "Withdrawn"}
                        onChange={(sessionId, nextMark) => onMarkAttendance(participant.id, sessionId, nextMark)}
                      />
                    ))}
                  </div>
                )}

                <div className="flex shrink-0 items-center gap-2">
                  <ParticipantConsultationAction
                    patientId={participant.patientId}
                    patientName={participant.patientName}
                  />
                  {participant.status === "Enrolled" && (
                    <ActionMenu
                      title={participant.patientName}
                      subtitle={program.name}
                      actions={[
                        { label: "Mark completed", onClick: () => setPendingComplete(participant) },
                        { label: "Withdraw", onClick: () => setPendingWithdraw(participant) },
                      ]}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ProfileSection>

      <ConfirmationModal
        open={Boolean(pendingComplete)}
        title="Mark Participation Completed?"
        description={`Confirm that ${pendingComplete?.patientName || "this patient"}'s participation in ${program.name} is complete.`}
        confirmText="Mark Completed"
        onConfirm={handleComplete}
        onCancel={() => setPendingComplete(null)}
        loading={actionPending}
      />

      <WithdrawReasonModal
        open={Boolean(pendingWithdraw)}
        submitting={actionPending}
        onConfirm={handleWithdraw}
        onCancel={() => setPendingWithdraw(null)}
      />

      <AddParticipantModal
        open={addOpen}
        enrolledPatientIds={enrolledPatientIds}
        submitting={addSubmitting}
        onEnroll={handleAddParticipant}
        onClose={() => setAddOpen(false)}
      />
    </>
  );
}
