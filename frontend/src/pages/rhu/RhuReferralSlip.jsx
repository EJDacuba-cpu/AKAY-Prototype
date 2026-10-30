import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";

import RestrictedArea from "../../components/common/access/RestrictedArea";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  SoftLoadingArea,
} from "../../components/common";
import ReferralReturnSlipSection from "../../components/features/patients/profile/ReferralReturnSlipSection";
import BhcReferralSlip from "../../components/features/patients/profile/BhcReferralSlip";
import useRhuReferralSlipData from "../../hooks/useRhuReferralSlipData";
import { getCurrentUser } from "../../utils/auth";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { rhuPatientReferralsPath } from "../../utils/rhuVisitRoutes";

function Shell({ children }) {
  return (
    <DashboardLayout role="rhu" title="Referral Details">
      {children}
    </DashboardLayout>
  );
}

export default function RhuReferralSlip() {
  const user = getCurrentUser();
  const canViewHistory = (user?.permissions || []).includes("clinical.history");
  const { patientId, referralId } = useParams();
  const backPath = rhuPatientReferralsPath(patientId);
  const { patient, referral, record, loading, unauthorized, missing, loadError, retry } =
    useRhuReferralSlipData({ patientId, referralId });

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
          <ConnectionErrorState onRetry={retry} variant={errorStateVariant(loadError)} />
        ) : missing ? (
          <p className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600 shadow-card">
            The referral linked to this visit could not be loaded for this patient.
          </p>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink-900">Referral Details</h1>
            <BhcReferralSlip referral={referral} record={record} patient={patient} />
            <ReferralReturnSlipSection referral={referral} pendingMessage="Pending feedback. The return slip will appear here once submitted." />
          </>
        )}
      </div>
    </Shell>
  );
}
