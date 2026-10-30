import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  UserCheck,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  ConnectionErrorState,
  ModalButton,
  ModalShell,
  RefreshingIndicator,
  SoftLoadingArea,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import {
  getReferralArrivalWorkspace,
  isReferralWorkflowConflict,
  refreshReferralWorkflowData,
  rescheduleReferral,
  updateReferralStatus,
} from "../../services/referrals";
import { formatDate, formatDisplayValue } from "../../utils/formatters";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { queryKeys } from "../../utils/queryKeys";
import {
  arrivalIdentity,
  arrivalReferralMeta,
  canReceiveReferral,
  missingIdentityLabel,
  officialReferralStatus,
  receiveConfirmCopy,
  RECEIVED_QUEUE_MESSAGE,
} from "../../utils/referralArrivalWorkspace";

const STATUS_PILL = {
  Pending: "border-info-100 bg-info-50 text-info-700",
  Received: "border-info-100 bg-info-50 text-info-700",
  Completed: "border-success-100 bg-success-50 text-success-700",
  "No-Show": "border-warning-100 bg-warning-50 text-warning-700",
};

export default function RHUReferralDetails() {
  const { trackingId } = useParams();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [lateArrivalOpen, setLateArrivalOpen] = useState(false);
  const [lateArrivalNote, setLateArrivalNote] = useState("");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");

  const {
    data: referral,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.referralDetails("rhu", trackingId),
    queryFn: () => getReferralArrivalWorkspace(trackingId),
    enabled: Boolean(trackingId),
    retry: false,
  });

  const loading = isLoading && !referral;
  const detailsUpdating = isFetching && !loading && Boolean(referral);
  const unauthorized = error?.status === 403;
  const notFound = error?.status === 404 || (!loading && !error && !referral);
  const loadError = error && !unauthorized && !notFound;
  const identity = arrivalIdentity(referral || {});
  const meta = arrivalReferralMeta(referral || {});
  const status = officialReferralStatus(referral?.status);
  const canReceive = canReceiveReferral(status);
  const lateArrival = status === "No-Show";
  const confirmCopy = receiveConfirmCopy(identity, lateArrival);

  async function receivePatient(extra = {}) {
    if (!referral?.id || busy) return false;
    setBusy(true);
    setMessage("");

    try {
      const updated = await updateReferralStatus(referral.id, "Received", extra);
      setReceiveOpen(false);
      setLateArrivalOpen(false);
      setLateArrivalNote("");
      setMessage(RECEIVED_QUEUE_MESSAGE);
      await refreshReferralWorkflowData(queryClient, trackingId);
      return Boolean(updated);
    } catch (caught) {
      if (isReferralWorkflowConflict(caught)) {
        setReceiveOpen(false);
        setLateArrivalOpen(false);
        setConflict(caught.payload || {});
        await refreshReferralWorkflowData(queryClient, trackingId);
        return false;
      }
      setMessage(caught.message || "Unable to receive this patient.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmLateArrival() {
    const note = lateArrivalNote.trim();
    if (!note) return;
    await receivePatient({ lateArrival: true, remarks: note });
  }

  async function confirmReschedule() {
    if (!referral?.id || busy || !rescheduleDate) return;

    setBusy(true);
    setRescheduleError("");

    try {
      await rescheduleReferral(referral.id, {
        rescheduledTo: rescheduleDate,
        reason: rescheduleReason.trim(),
      });
      setRescheduleOpen(false);
      setRescheduleDate("");
      setRescheduleReason("");
      setMessage(
        "New visit date recorded. The referral remains No-Show until the patient arrives.",
      );
      await refreshReferralWorkflowData(queryClient, trackingId);
    } catch (caught) {
      if (isReferralWorkflowConflict(caught)) {
        setRescheduleOpen(false);
        setConflict(caught.payload || {});
        await refreshReferralWorkflowData(queryClient, trackingId);
        return;
      }
      setRescheduleError(
        caught?.errors?.rescheduled_to?.[0] ||
          caught?.message ||
          "Unable to record the new visit date.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadLatestStatus() {
    setConflict(null);
    await refreshReferralWorkflowData(queryClient, trackingId);
  }

  function startReceive() {
    if (lateArrival) {
      setLateArrivalOpen(true);
      return;
    }
    setReceiveOpen(true);
  }

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Patient Arrival">
        <SoftLoadingArea
          skeleton="details"
          isLoading
          message="Loading patient arrival..."
          minHeight="min-h-[420px]"
        >
          <div className="min-h-[420px]" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (loadError) {
    return (
      <DashboardLayout role="rhu" title="Patient Arrival">
        <ConnectionErrorState
          fullPage
          variant={errorStateVariant(error)}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      </DashboardLayout>
    );
  }

  if (unauthorized || notFound || !referral) {
    return (
      <ArrivalUnavailableState
        title={unauthorized ? "Referral Access Restricted" : "Referral Not Found"}
        message={
          unauthorized
            ? "You do not have permission to view this arrival."
            : "No incoming referral record matches this tracking ID."
        }
      />
    );
  }

  return (
    <DashboardLayout role="rhu" title="Patient Arrival">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          to="/rhu/incoming-referrals"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-neutral-600 hover:text-ink-800"
        >
          <ArrowLeft size={15} />
          Back to Incoming Referrals
        </Link>

        <section className="rounded-[var(--radius-card)] border border-neutral-200 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
          <header className="flex flex-col gap-4 border-b border-neutral-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-ink-800">
                  {identity.fullName}
                </h1>
                <StatusPill status={status} />
                {detailsUpdating && (
                  <RefreshingIndicator label="Updating arrival..." />
                )}
              </div>
              <p className="mt-1 text-[13px] text-neutral-600">
                {[
                  identity.birthDateLabel && `Born ${identity.birthDateLabel}`,
                  identity.age && `${identity.age} years`,
                  identity.sex,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Birth date, age, and sex not recorded"}
              </p>
            </div>

            {canReceive && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  disabled={busy}
                  onClick={startReceive}
                >
                  <UserCheck size={14} />
                  Receive Patient
                </Button>
                {lateArrival && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setRescheduleError("");
                      setRescheduleDate("");
                      setRescheduleReason("");
                      setRescheduleOpen(true);
                    }}
                  >
                    <CalendarClock size={14} />
                    Reschedule Visit
                  </Button>
                )}
              </div>
            )}
          </header>

          {(message || status === "Received") && (
            <p
              role="status"
              className={`mt-4 rounded-[var(--radius-input)] border px-3 py-2.5 text-[13px] font-medium ${
                status === "Received" || message === RECEIVED_QUEUE_MESSAGE
                  ? "border-success-100 bg-success-50 text-success-700"
                  : "border-alert-100 bg-alert-50 text-alert-700"
              }`}
            >
              {message || RECEIVED_QUEUE_MESSAGE}
            </p>
          )}

          <div className="mt-5 grid gap-8 sm:grid-cols-2">
            <FieldGroup title="Patient registration">
              <Field label="Full name" value={identity.fullName} />
              <Field label="Date of birth" value={identity.birthDateLabel} />
              <Field label="Age" value={identity.age ? `${identity.age} years` : ""} />
              <Field label="Sex" value={identity.sex} />
              <Field label="Address" value={identity.address} />
              <Field label="Contact number" value={identity.contact} />
            </FieldGroup>

            <FieldGroup title="Referral">
              <Field label="Tracking ID" value={meta.trackingId} mono />
              <Field label="Referring BHC" value={meta.referringBhc} />
              <Field label="Receiving RHU" value={meta.receivingRhu} />
              <Field
                label="Referral date"
                value={meta.referredAt ? formatDate(meta.referredAt) : ""}
              />
              <Field
                label="Referral time"
                value={formatReferralTime(meta.referredAt)}
              />
              <Field label="Status" value={status} />
            </FieldGroup>
          </div>
        </section>
      </div>

      <ConfirmationModal
        open={receiveOpen}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmText={confirmCopy.confirmText}
        cancelText="Cancel"
        tone="plain"
        loading={busy}
        loadingText="Receiving..."
        onConfirm={() => receivePatient()}
        onCancel={() => !busy && setReceiveOpen(false)}
      />
      <LateArrivalModal
        open={lateArrivalOpen}
        patientName={identity.fullName}
        note={lateArrivalNote}
        onNoteChange={setLateArrivalNote}
        onCancel={() => !busy && setLateArrivalOpen(false)}
        onConfirm={confirmLateArrival}
        loading={busy}
      />
      <RescheduleModal
        open={rescheduleOpen}
        date={rescheduleDate}
        reason={rescheduleReason}
        error={rescheduleError}
        onDateChange={setRescheduleDate}
        onReasonChange={setRescheduleReason}
        onCancel={() => !busy && setRescheduleOpen(false)}
        onConfirm={confirmReschedule}
        loading={busy}
      />
      <ConfirmationModal
        open={Boolean(conflict)}
        title="Referral Status Changed"
        description="This referral was updated by another user or can no longer perform this action. The latest status will now be loaded."
        confirmText="Refresh"
        cancelText="View Latest Status"
        onConfirm={loadLatestStatus}
        onCancel={loadLatestStatus}
      />
    </DashboardLayout>
  );
}

function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        STATUS_PILL[status] || STATUS_PILL.Pending
      }`}
    >
      {status}
    </span>
  );
}

function FieldGroup({ title, children }) {
  return (
    <div>
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <dl className="space-y-3">{children}</dl>
    </div>
  );
}

function Field({ label, value, mono = false }) {
  const display = missingIdentityLabel(value);
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 truncate text-[13px] text-ink-800 ${mono ? "font-mono" : "font-medium"}`}
        title={display}
      >
        {display}
      </dd>
    </div>
  );
}

function formatReferralTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function RescheduleModal({
  open,
  date,
  reason,
  error,
  onDateChange,
  onReasonChange,
  onCancel,
  onConfirm,
  loading,
}) {
  return (
    <ModalShell
      open={open}
      title="Reschedule Visit"
      subtitle="Record a new intended visit date."
      icon={<CalendarClock size={14} />}
      size="md"
      onClose={onCancel}
      closeDisabled={loading}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={loading}>
            Cancel
          </ModalButton>
          <ModalButton
            variant="primary"
            onClick={onConfirm}
            disabled={loading || !date}
          >
            {loading ? "Saving..." : "Save New Date"}
          </ModalButton>
        </>
      }
    >
      <p className="text-[13px] leading-5 text-neutral-600">
        Record a new intended visit date for this patient. The referral stays
        marked No-Show until the patient actually arrives.
      </p>
      <div className="mt-5">
        <label className="block text-xs font-semibold text-ink-800" htmlFor="reschedule-date">
          New visit date and time <span className="text-brand-700">*</span>
        </label>
        <input
          id="reschedule-date"
          type="datetime-local"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          className="mt-2 h-10 w-full rounded-[var(--radius-input)] border border-neutral-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/20"
        />
        <label
          className="mt-4 block text-xs font-semibold text-ink-800"
          htmlFor="reschedule-reason"
        >
          Reason (optional)
        </label>
        <textarea
          id="reschedule-reason"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          rows={3}
          maxLength={1000}
          className="mt-2 w-full rounded-[var(--radius-input)] border border-neutral-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/20"
        />
        {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
      </div>
    </ModalShell>
  );
}

function LateArrivalModal({
  open,
  patientName,
  note,
  onNoteChange,
  onCancel,
  onConfirm,
  loading,
}) {
  return (
    <ModalShell
      open={open}
      title="Confirm late arrival?"
      subtitle="Verify identity, then receive."
      icon={<AlertTriangle size={14} />}
      size="md"
      onClose={onCancel}
      closeDisabled={loading}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={loading}>
            Cancel
          </ModalButton>
          <ModalButton
            variant="primary"
            onClick={onConfirm}
            disabled={loading || !note.trim()}
          >
            {loading ? "Receiving..." : "Receive Patient"}
          </ModalButton>
        </>
      }
    >
      <p className="text-[13px] leading-5 text-neutral-600">
        Confirm this is {formatDisplayValue(patientName, "this patient")} and that
        they have now arrived. This referral was previously marked No-Show.
        Receiving adds them to today's queue.
      </p>
      <div className="mt-5">
        <label
          className="block text-xs font-semibold text-ink-800"
          htmlFor="late-arrival-note"
        >
          Late-arrival note <span className="text-brand-700">*</span>
        </label>
        <textarea
          id="late-arrival-note"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={3}
          maxLength={1000}
          autoFocus
          disabled={loading}
          className="mt-2 w-full rounded-[var(--radius-input)] border border-neutral-200 px-3 py-2.5 text-sm text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/20 disabled:bg-neutral-50"
          placeholder="Briefly note the patient's late arrival."
        />
      </div>
    </ModalShell>
  );
}

function ArrivalUnavailableState({ title, message }) {
  return (
    <DashboardLayout role="rhu" title={title}>
      <div className="mx-auto max-w-lg py-24 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-brand-50 text-brand-700">
          <AlertTriangle size={30} />
        </div>
        <h1 className="text-2xl font-bold text-ink-800">{title}</h1>
        <p className="mt-3 text-sm text-neutral-500">{message}</p>
        <Link
          to="/rhu/incoming-referrals"
          className="mt-8 inline-flex h-9 items-center gap-2 rounded-full bg-brand-600 px-5 text-[13px] font-medium text-white hover:bg-brand-700"
        >
          <ArrowLeft size={15} />
          Back to Incoming Referrals
        </Link>
      </div>
    </DashboardLayout>
  );
}
