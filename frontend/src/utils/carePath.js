import { formatDate } from "./formatters.js";

/**
 * The patient's place on the BHC -> RHU -> BHC care path, built only from what
 * the server has said: the patient's referrals and the RHU condition groups
 * (see groupMedicalConditions). Three stops, each "done", "active" or "none":
 *
 * - referred: the latest referral that was not cancelled or declined; active
 *   while it still waits on the RHU.
 * - confirmed: an RHU-confirmed (active/controlled) condition; active while a
 *   condition is under evaluation.
 * - monitoring: BHC monitoring started for a confirmed condition; active when
 *   the RHU recommended it but it has not started.
 *
 * Legacy monitorings and BHC-recorded concerns never move the path: only the
 * RHU confirms, and nothing here infers a status the RHU did not set.
 */

const DEAD_REFERRAL = new Set(["cancelled", "declined"]);
const OPEN_REFERRAL = new Set(["pending", "received", "referred", "referred/pending"]);

function referralDateValue(referral = {}) {
  return (
    referral.dateOfReferral ||
    referral.date_of_referral ||
    referral.referralDate ||
    referral.referral_datetime ||
    referral.dateSubmitted ||
    referral.createdAt ||
    referral.created_at ||
    referral.date ||
    ""
  );
}

function statusOf(referral) {
  return String(referral?.status || "").trim().toLowerCase();
}

function latestLiveReferral(referrals = []) {
  return referrals
    .filter((referral) => !DEAD_REFERRAL.has(statusOf(referral)))
    .reduce((latest, referral) => {
      if (!latest) return referral;
      const a = new Date(referralDateValue(latest)).getTime() || 0;
      const b = new Date(referralDateValue(referral)).getTime() || 0;
      return b > a ? referral : latest;
    }, null);
}

function namesDetail(conditions) {
  const [first, ...rest] = conditions.map((c) => c.conditionName).filter(Boolean);
  if (!first) return "";
  return rest.length ? `${first} +${rest.length}` : first;
}

function referredStep(referrals) {
  const latest = latestLiveReferral(referrals);
  if (!latest) return { state: "none", detail: "Not referred" };
  const date = formatDate(referralDateValue(latest), "");
  if (OPEN_REFERRAL.has(statusOf(latest))) {
    return { state: "active", detail: date ? `Awaiting RHU · ${date}` : "Awaiting RHU" };
  }
  return { state: "done", detail: date || "Referred" };
}

function confirmedStep(groups) {
  const confirmed = (groups?.confirmed || []).filter((c) => c.kind === "rhu");
  if (confirmed.length) return { state: "done", detail: namesDetail(confirmed) || "Confirmed" };
  if ((groups?.underEvaluation || []).length) return { state: "active", detail: "Under evaluation" };
  if ((groups?.past || []).length) return { state: "none", detail: "No active condition" };
  return { state: "none", detail: "Not confirmed" };
}

function monitoringStep(groups) {
  const confirmed = (groups?.confirmed || []).filter((c) => c.kind === "rhu");
  const monitored = confirmed.filter((c) => c.monitoring);
  if (monitored.length) return { state: "done", detail: namesDetail(monitored) || "Monitoring" };
  if (confirmed.some((c) => c.bhcMonitoringRecommendedAt)) return { state: "active", detail: "Recommended by RHU" };
  return { state: "none", detail: "Not monitoring" };
}

export function buildCarePath({ referrals = [], groups = {} } = {}) {
  const steps = [
    { key: "referred", label: "BHC referral", ...referredStep(referrals) },
    { key: "confirmed", label: "RHU confirmation", ...confirmedStep(groups) },
    { key: "monitoring", label: "BHC monitoring", ...monitoringStep(groups) },
  ];
  const reached = steps.filter((step) => step.state !== "none").length;
  const summary = `Care path: ${steps.map((step) => `${step.label}, ${step.detail.toLowerCase()}`).join("; ")}.`;
  return { steps, reached, summary };
}
