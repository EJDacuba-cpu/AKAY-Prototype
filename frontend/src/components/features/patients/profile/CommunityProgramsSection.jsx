import { useState } from "react";
import { Plus } from "lucide-react";

import ActionMenu from "../../../common/tables/ActionMenu";
import ConfirmationModal from "../../../common/modals/ConfirmationModal";
import WithdrawReasonModal from "../../programs/WithdrawReasonModal";
import { EmptyNote, ProfileSection } from "./ProfileSection";
import { formatShortDate } from "../../../../utils/patientProfile";

const STATUS_STYLES = {
  Enrolled: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  Completed: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
  Withdrawn: "border-neutral-200 bg-neutral-50 text-[#475569]",
};

function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        STATUS_STYLES[status] || STATUS_STYLES.Withdrawn
      }`}
    >
      {status}
    </span>
  );
}

/**
 * Community Programs: RHU-published programs a patient is explicitly
 * enrolled in - separate from the derived Care Tracking cards above it.
 * Mock data (services/communityProgramService.js) until Phase 2 builds the
 * enrollment backend.
 */
export default function CommunityProgramsSection({
  enrollments = [],
  isLoading = false,
  isError = false,
  onRetry,
  onEnroll,
  onComplete,
  onWithdraw,
}) {
  const [pendingComplete, setPendingComplete] = useState(null);
  const [pendingWithdraw, setPendingWithdraw] = useState(null);
  const [actionPending, setActionPending] = useState(false);

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
    <ProfileSection
      id="community-programs"
      title="Community Programs"
      meta={
        <span className="inline-flex items-center rounded-full border border-warning-100 bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">
          Preview data
        </span>
      }
      actions={
        <button
          type="button"
          onClick={onEnroll}
          className="inline-flex h-7 items-center gap-1 rounded-lg bg-ink-700 px-3 text-[13px] font-medium text-white shadow-xs transition hover:bg-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
        >
          <Plus size={12} aria-hidden="true" />
          Enroll
        </button>
      }
    >
      {isError ? (
        <div role="alert" className="py-3 text-sm text-alert-700">
          Could not load community programs. <button type="button" onClick={() => onRetry?.()} className="font-semibold underline">Retry</button>
        </div>
      ) : isLoading ? (
        <EmptyNote>Loading community programs...</EmptyNote>
      ) : enrollments.length === 0 ? (
        <EmptyNote>Not enrolled in any community programs.</EmptyNote>
      ) : (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {enrollments.map((enrollment) => (
            <li key={enrollment.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-neutral-900">{enrollment.programName}</span>
                  <StatusPill status={enrollment.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {[
                    enrollment.programCategory,
                    enrollment.runStart && enrollment.runEnd
                      ? `${formatShortDate(enrollment.runStart)} – ${formatShortDate(enrollment.runEnd)}`
                      : null,
                    enrollment.publishingRhu,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Enrolled {formatShortDate(enrollment.enrolledDate)}
                  {enrollment.status === "Withdrawn" && enrollment.withdrawReason
                    ? ` · Withdrawn: ${enrollment.withdrawReason}`
                    : ""}
                </p>
              </div>

              {enrollment.status === "Enrolled" && (
                <ActionMenu
                  title={enrollment.programName}
                  subtitle={enrollment.programCategory}
                  actions={[
                    { label: "Mark completed", onClick: () => setPendingComplete(enrollment) },
                    { label: "Withdraw", onClick: () => setPendingWithdraw(enrollment) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmationModal
        open={Boolean(pendingComplete)}
        title="Mark Program Completed?"
        description={`Confirm that ${pendingComplete?.programName || "this program"} is complete for this patient.`}
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
    </ProfileSection>
  );
}
