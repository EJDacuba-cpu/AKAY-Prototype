import { useQuery } from "@tanstack/react-query";
import { getReferralById } from "../services/referrals";
import { getHealthRecordById } from "../services/healthRecordService";
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
  const linkedId = String(referral?.healthRecordId || referral?.health_record_id || "");
  const recordQuery = useQuery({
    // Details pages cache { record, patient, linkedReferral }; this key caches raw records.
    queryKey: queryKeys.healthRecordData("rhu", linkedId),
    queryFn: () => getHealthRecordById(linkedId),
    enabled: active && Boolean(linkedId),
    retry: false,
  });
  const errors = [patientQuery.error, listQuery.error, referralQuery.error, recordQuery.error];
  // A deleted/unavailable source record is different from a failed connection.
  const recordError = Number(recordQuery.error?.status) === 404 ? null : recordQuery.error;
  const unauthorized = !canViewHistory || errors.some((error) => Number(error?.status) === 403);
  const loading = active && (
    (patientQuery.isLoading && !patientQuery.data) ||
    ((listQuery.isLoading || (fetchById && referralQuery.isPending)) && !referral) ||
    (Boolean(linkedId) && recordQuery.isLoading)
  );
  const loadError = active && !unauthorized && (
    (!referral && (patientQuery.error || listQuery.error || referralQuery.error)) || recordError
  );

  function retry() {
    if (!active) return;
    patientQuery.refetch();
    listQuery.refetch();
    if (fetchById) referralQuery.refetch();
    if (linkedId) recordQuery.refetch();
  }

  return {
    patient: active && !unauthorized ? patientQuery.data : null,
    referral: unauthorized ? null : referral,
    record: active && !unauthorized && referral && Number(recordQuery.error?.status) !== 404
      ? recordQuery.data || linkedReferralRecord(referral, [])
      : null,
    loading,
    unauthorized,
    missing: active && !referral && !loading && !unauthorized && !loadError,
    loadError,
    retry,
  };
}
