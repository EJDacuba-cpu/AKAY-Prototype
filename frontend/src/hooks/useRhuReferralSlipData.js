import { useQuery } from "@tanstack/react-query";
import { getReferralById } from "../services/referrals";
import { getRhuPatientProfileQueries } from "../services/patientProfileQueries";
import { getCurrentUser } from "../utils/auth";
import { queryKeys } from "../utils/queryKeys";
import {
  isNumericReferralId,
  linkedReferralRecord,
  pickReferral,
  referralBelongsToPatient,
} from "../utils/referralSlipView";

/** One permission-gated cache for the standalone slip and the in-ITR reference. */
export default function useRhuReferralSlipData({ patientId, referralId, enabled = true }) {
  const canViewHistory = (getCurrentUser()?.permissions || []).includes("clinical.history");
  const active = Boolean(enabled && canViewHistory && patientId && referralId);
  const queries = getRhuPatientProfileQueries(patientId, { canViewHistory: active });
  const patientQuery = useQuery({ ...queries.patient, enabled: active });
  const listQuery = useQuery({ ...queries.referrals, enabled: active });
  const fetchById = active && isNumericReferralId(referralId);
  const referralQuery = useQuery({
    queryKey: queryKeys.referralDetails("rhu", referralId),
    queryFn: () => getReferralById(referralId),
    enabled: fetchById,
    retry: false,
  });
  const candidates = [referralQuery.data, pickReferral(listQuery.data, referralId)];
  const referral = active
    ? candidates.find((candidate) => referralBelongsToPatient(candidate, patientId)) || null
    : null;
  // Slip clinical fields come from the redacted nested health_record on the referral.
  // Do not open the BHC Clinic Ledger via GET /health-records/{id}.
  const record = active && !referral ? null : linkedReferralRecord(referral, []);
  const errors = [patientQuery.error, listQuery.error, referralQuery.error];
  const unauthorized = !canViewHistory || errors.some((error) => [401, 403].includes(Number(error?.status)));
  const loading = active && (
    (patientQuery.isPending && !patientQuery.data) ||
    ((listQuery.isPending || (fetchById && referralQuery.isPending)) && !referral)
  );
  const loadError = active && !unauthorized && !referral && (patientQuery.error || listQuery.error || referralQuery.error);

  function retry() {
    if (!active) return;
    patientQuery.refetch();
    listQuery.refetch();
    if (fetchById) referralQuery.refetch();
  }

  const retrying = active && (
    patientQuery.isFetching ||
    listQuery.isFetching ||
    referralQuery.isFetching
  );

  return {
    patient: active && !unauthorized ? patientQuery.data : null,
    referral: unauthorized ? null : referral,
    record: active && !unauthorized && referral ? record : null,
    loading,
    unauthorized,
    missing: active && !referral && !loading && !unauthorized && !loadError,
    loadError,
    retry,
    retrying,
  };
}
