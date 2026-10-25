import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import RestrictedArea from "../../components/common/access/RestrictedArea";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  SoftLoadingArea,
} from "../../components/common";
import BhcReferralSlip from "../../components/features/patients/profile/BhcReferralSlip";
import { getReferralById } from "../../services/referrals";
import { getHealthRecordById } from "../../services/healthRecordService";
import { getRhuPatientProfileQueries } from "../../services/patientProfileQueries";
import { getCurrentUser } from "../../utils/auth";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { queryKeys } from "../../utils/queryKeys";
import {
  isNumericReferralId,
  linkedReferralRecord,
  pickReferral,
  referralBelongsToPatient,
} from "../../utils/referralSlipView";
import { rhuPatientReferralsPath } from "../../utils/rhuVisitRoutes";

function Shell({ children }) {
  return (
    <DashboardLayout role="rhu" title="BHC Referral Slip">
      {children}
    </DashboardLayout>
  );
}

export default function RhuReferralSlip() {
  const user = getCurrentUser();
  const canViewHistory = (user?.permissions || []).includes("clinical.history");
  const { patientId, referralId } = useParams();
  const backPath = rhuPatientReferralsPath(patientId);
  const profileQueries = getRhuPatientProfileQueries(patientId, { canViewHistory });

  const {
    data: patient,
    isLoading: patientLoading,
    error: patientError,
    refetch: refetchPatient,
  } = useQuery({ ...profileQueries.patient, enabled: Boolean(patientId) });

  const {
    data: listedReferrals = [],
    isLoading: listLoading,
    error: listError,
    refetch: refetchList,
  } = useQuery(profileQueries.referrals);

  const listed = pickReferral(listedReferrals, referralId);
  const fetchById = canViewHistory && isNumericReferralId(referralId);

  const {
    data: fetchedReferral = null,
    isPending: referralPending,
    isError: referralError,
    error: referralFailure,
    refetch: refetchReferral,
  } = useQuery({
    queryKey: queryKeys.referralDetails("rhu", referralId),
    queryFn: () => getReferralById(referralId),
    enabled: fetchById,
    retry: false,
  });

  const fromFetch =
    fetchedReferral && referralBelongsToPatient(fetchedReferral, patientId) ? fetchedReferral : null;
  const referral = fromFetch || listed || null;

  const linkedId = referral?.healthRecordId;
  const { data: fetchedRecord = null } = useQuery({
    queryKey: queryKeys.healthRecordDetails("rhu", linkedId),
    queryFn: () => getHealthRecordById(linkedId),
    enabled: canViewHistory && Boolean(linkedId),
    retry: false,
  });

  const record = fetchedRecord || linkedReferralRecord(referral, []);
  const unauthorized = Number(referralFailure?.status) === 403 || Number(patientError?.status) === 403;
  const loading =
    (patientLoading && !patient) ||
    ((listLoading || (fetchById && referralPending)) && !referral);
  const missing = Boolean(referralId) && !referral && !loading && !unauthorized;
  const loadError = (patientError || listError || (referralError && !unauthorized)) && !referral;

  function retry() {
    refetchPatient();
    refetchList();
    if (fetchById) refetchReferral();
  }

  if (!canViewHistory) {
    return (
      <Shell>
        <RestrictedArea locked label="Health Records & History" className="min-h-[420px] rounded-xl" />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-4">
        <Link
          to={backPath}
          className="inline-flex items-center gap-2 text-[13px] font-medium text-neutral-600 hover:text-ink-800"
        >
          <ArrowLeft size={15} />
          Back to Patient Profile → Referrals
        </Link>

        {loading ? (
          <SoftLoadingArea isLoading message="Loading BHC referral slip..." minHeight="min-h-[420px]">
            <div className="min-h-[420px]" />
          </SoftLoadingArea>
        ) : unauthorized ? (
          <p className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600 shadow-card">
            Clinical referral details are restricted to authorized RHU users.
          </p>
        ) : loadError ? (
          <ConnectionErrorState onRetry={retry} variant={errorStateVariant(patientError || listError || referralFailure)} />
        ) : missing ? (
          <p className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600 shadow-card">
            The referral linked to this visit could not be loaded for this patient.
          </p>
        ) : (
          <BhcReferralSlip referral={referral} record={record} patient={patient} />
        )}
      </div>
    </Shell>
  );
}
