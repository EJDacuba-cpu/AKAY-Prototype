import { apiRequest, unwrapData } from "./apiClient";

export const getTbDrReferralPreview = async recordId => unwrapData(await apiRequest(`/health-records/${recordId}/tb-dr-referral`));
export const getTbDrReferral = async id => unwrapData(await apiRequest(`/tb-dr-referrals/${id}`));
export const saveTbDrReferral = async attempt => unwrapData(await apiRequest(attempt.referralId
  ? `/tb-dr-referrals/${attempt.referralId}/status` : `/health-records/${attempt.recordId}/tb-dr-referral`, {
  method: "POST", headers: { "Idempotency-Key": attempt.key }, body: attempt.payload,
}));

export async function downloadTbDrReferralPdf(id) {
  const blob = await apiRequest(`/tb-dr-referrals/${id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `DR-TB-Referral-${id}.pdf`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
