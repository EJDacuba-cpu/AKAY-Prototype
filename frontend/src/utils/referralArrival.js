import { formatAgeSex } from './rhuQueueView.js';

/**
 * Intake staff without Health Records get only an arrival summary from the server. This turns it into
 * the referral shape the QR scanner already renders; `summaryOnly` tells it which rows to leave out.
 */
export function arrivalToReferral(arrival) {
  if (!arrival) return null;
  return {
    id: String(arrival.referral_id),
    trackingId: arrival.tracking_id,
    status: arrival.status,
    patientName: arrival.patient?.full_name ?? '',
    ageSex: formatAgeSex(arrival.patient),
    referringHci: arrival.sending_bhc ?? '',
    destinationFacility: arrival.receiving_rhu ?? '',
    referralDateTime: arrival.referred_at ?? '',
    summaryOnly: true,
  };
}
