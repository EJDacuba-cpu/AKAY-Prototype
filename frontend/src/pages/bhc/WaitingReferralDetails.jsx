import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  ConnectionErrorState,
  ModalButton,
  ModalShell,
  SoftLoadingArea,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import { createReferral, getReferralDestination, isNoProviderAvailableError } from "../../services/referrals";
import { discardReferralHold, getReferralHold } from "../../services/referralHolds";
import {
  AWAITING_DOCTOR_STATUS,
  UNSENT_NOT_APPOINTMENT,
  discardReasonError,
  unavailableReferralGuidance,
} from "../../utils/bhcReferralWorkspace";
import { formatDate, formatDisplayValue } from "../../utils/formatters";
import { isPriority } from "../../utils/referralAttention";
import { queryKeys } from "../../utils/queryKeys";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { getStoredAuthUser } from "../../services/apiClient";

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[#111827]">
        {formatDisplayValue(value, "Not recorded")}
      </dd>
    </div>
  );
}

export default function WaitingReferralDetails() {
  const { holdId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = getStoredAuthUser();
  const openSubmit = searchParams.get("submit") === "1";
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [discardError, setDiscardError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const {
    data: hold,
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.referralHold(holdId),
    queryFn: () => getReferralHold(holdId),
    enabled: Boolean(holdId),
    retry: false,
  });

  const { data: destination } = useQuery({
    queryKey: ["approved-referral-destinations", user?.id, user?.working_facility_key],
    queryFn: getReferralDestination,
    refetchInterval: 30000,
  });

  const selected = (destination?.destinations || []).find(
    (item) => String(item.id) === String(hold?.ruralHealthUnitId),
  );
  const alternatives = (destination?.destinations || []).filter(
    (item) =>
      String(item.id) !== String(hold?.ruralHealthUnitId) &&
      item.availability?.can_submit_referral,
  );
  const doctorAvailable = Boolean(selected?.availability?.can_submit_referral);
  const guidance = unavailableReferralGuidance({
    facilityName: hold?.ruralHealthUnitName || "the receiving RHU",
    isPriority: isPriority(hold?.urgencyLevel),
    alternativeNames: alternatives.map((item) => item.name),
  });

  useEffect(() => {
    if (openSubmit && hold && doctorAvailable) setConfirmSubmit(true);
  }, [openSubmit, hold, doctorAvailable]);

  const submitMutation = useMutation({
    mutationFn: () =>
      createReferral({
        patientId: hold.patientId,
        healthRecordId: hold.healthRecordId,
        ruralHealthUnitId: hold.ruralHealthUnitId,
        resumeHoldId: hold.id,
        reasonForReferral: hold.reasonForReferral,
        urgencyLevel: hold.urgencyLevel,
        chiefComplaint: hold.chiefComplaint,
        initialDiagnosis: hold.initialDiagnosis,
        initialActionsTaken: hold.initialActionTaken,
        clientSubmissionId: `hold:${hold.id}`,
      }),
    onSuccess: (referral) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.referralHolds() });
      queryClient.invalidateQueries({ queryKey: queryKeys.referrals("bhc") });
      const trackingId = referral?.trackingId || referral?.tracking_id;
      navigate(trackingId ? `/bhc/referrals/${trackingId}` : "/bhc/referrals");
    },
    onError: (error) => {
      setConfirmSubmit(false);
      setSubmitError(
        isNoProviderAvailableError(error)
          ? "No eligible doctor is available now. This referral stays under Waiting to Submit."
          : error?.message || "Unable to submit this referral.",
      );
    },
  });

  const discardMutation = useMutation({
    mutationFn: () => discardReferralHold(hold.id, discardReason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.referralHolds() });
      navigate("/bhc/referrals?tab=waiting");
    },
  });

  function requestDiscard() {
    const message = discardReasonError(discardReason);
    setDiscardError(message);
    if (message) return;
    discardMutation.mutate();
  }

  const loading = isLoading && !hold;
  if (loadError && !hold) {
    return (
      <DashboardLayout role="bhc" title="Waiting Referral">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={errorStateVariant(loadError)}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Waiting to Submit">
      <SoftLoadingArea skeleton="details" isLoading={loading} message="Loading waiting referral...">
        {!hold ? null : (
          <div className="min-w-0 space-y-3">
            <Button asChild variant="link" size="compact" className="px-0">
              <Link to="/bhc/referrals?tab=waiting"><ArrowLeft size={15} />Back to Waiting to Submit</Link>
            </Button>
            <article className="border border-[#E5E7EB] bg-white">
              <header className="border-b border-[#E5E7EB] px-4 py-4">
                <h1 className="text-xl font-bold text-[#111827]">{hold.patientName}</h1>
                <p className="mt-1 text-[13px] text-[#6B7280]">
                  {formatDate(hold.consultationDate, "Consultation date not recorded")} · {hold.ruralHealthUnitName || "Receiving RHU"}
                </p>
                <p className="mt-2 text-[12px] font-medium text-[#B54708]">{AWAITING_DOCTOR_STATUS}</p>
                <p className="mt-2 text-[12px] text-[#6B7280]">{UNSENT_NOT_APPOINTMENT}</p>
              </header>
              <section className="border-b border-[#E5E7EB] px-4 py-4">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Saved consultation</h2>
                <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Detail label="Reason for Referral" value={hold.reasonForReferral} />
                  <Detail label="Receiving RHU" value={hold.ruralHealthUnitName} />
                  <Detail label="Chief Complaint" value={hold.chiefComplaint} />
                  <Detail label="Initial Assessment" value={hold.initialDiagnosis} />
                  <Detail label="Initial Action Taken" value={hold.initialActionTaken} />
                </dl>
                {hold.healthRecordId ? (
                  <Button asChild variant="link" size="compact" className="mt-3 px-0">
                    <Link to={`/bhc/health-records/${hold.healthRecordId}`}>View Source Health Record</Link>
                  </Button>
                ) : null}
              </section>
              <section className="space-y-3 px-4 py-4">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Doctor availability</h2>
                <p className="text-sm text-[#111827]">
                  {doctorAvailable
                    ? `${hold.ruralHealthUnitName || "The receiving RHU"} currently has an eligible doctor. Review the findings, contact the patient if needed, then confirm submission.`
                    : guidance.body}
                </p>
                {submitError ? <p role="alert" className="text-sm text-[#B91C1C]">{submitError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="rounded-none"
                    disabled={!doctorAvailable || submitMutation.isPending}
                    onClick={() => {
                      setSubmitError("");
                      setConfirmSubmit(true);
                    }}
                  >
                    Check Availability & Submit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-none border border-[#D1D5DB]"
                    onClick={() => setDiscardOpen(true)}
                  >
                    Discard unsent referral
                  </Button>
                </div>
              </section>
            </article>
          </div>
        )}
      </SoftLoadingArea>

      <ConfirmationModal
        open={confirmSubmit}
        title="Submit this referral?"
        description="This will create the official referral, generate the tracking ID and QR, and notify the receiving RHU. It will not submit automatically later."
        confirmText="Confirm & Submit"
        cancelText="Back"
        tone="default"
        loading={submitMutation.isPending}
        loadingText="Submitting..."
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={() => submitMutation.mutate()}
      />

      <ModalShell
        open={discardOpen}
        title="Discard unsent referral?"
        size="sm"
        onClose={() => setDiscardOpen(false)}
        footer={
          <>
            <ModalButton onClick={() => setDiscardOpen(false)} disabled={discardMutation.isPending}>
              Keep waiting
            </ModalButton>
            <ModalButton
              variant="destructive"
              onClick={requestDiscard}
              disabled={discardMutation.isPending}
            >
              {discardMutation.isPending ? "Discarding..." : "Discard"}
            </ModalButton>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-[#4B5563]">
          The consultation Health Record is kept. Enter an audited reason for discarding this unsent referral intent.
        </p>
        <textarea
          value={discardReason}
          onChange={(event) => {
            setDiscardReason(event.target.value);
            setDiscardError("");
          }}
          rows={3}
          className="mt-3 w-full rounded-none border border-[#D1D5DB] px-3 py-2 text-sm"
          placeholder="Reason for discarding"
        />
        {discardError ? <p role="alert" className="mt-2 text-xs text-[#B91C1C]">{discardError}</p> : null}
      </ModalShell>
    </DashboardLayout>
  );
}
