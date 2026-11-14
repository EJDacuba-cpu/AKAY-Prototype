/** Unified BHC Monitoring Requests inbox (handoffs + TB endorsements). */

export const KIND_MONITORING_HANDOFF = "monitoring_handoff";
export const KIND_TB_ENDORSEMENT = "tb_endorsement";

export const MONITORING_HANDOFF_STATUS_LABELS = {
  pending_review: "Pending Review",
  linkage_needed: "Needs Verification",
  accepted_awaiting_first_visit: "Accepted — Awaiting First Visit",
  monitoring_active: "Monitoring Active",
  declined: "Declined",
  redirected: "Redirected",
};

export const TB_INBOX_STATUS_LABELS = {
  linkage_needed: "Needs Verification",
  pending_review: "Pending Review",
  accepted: "Accepted for DOTS",
  declined: "Declined",
  revoked: "Revoked",
};

export function monitoringInboxStatusTone(status) {
  if (
    status === "monitoring_active" ||
    status === "accepted_awaiting_first_visit" ||
    status === "accepted"
  ) {
    return "success";
  }
  if (status === "pending_review") return "info";
  if (status === "linkage_needed") return "warning";
  if (status === "declined" || status === "revoked") return "danger";
  return "neutral";
}

export function handoffInboxRow(request) {
  const status = request?.status || "";
  const serviceLabel = request.service?.label || request.service_key || "";
  const isService = request.handoff_kind === "service" || Boolean(serviceLabel && !request.condition?.name);
  return {
    key: `${KIND_MONITORING_HANDOFF}:${request.id}`,
    kind: KIND_MONITORING_HANDOFF,
    id: request.id,
    patient: request.source_patient,
    conditionLabel: isService
      ? (serviceLabel || "Health service")
      : (request.condition?.name || "Condition"),
    typeLabel: isService ? "Service monitoring handoff" : "Monitoring handoff",
    sendingRhu: request.sending_rhu?.name || "RHU",
    status,
    statusLabel:
      MONITORING_HANDOFF_STATUS_LABELS[status] ||
      String(status || "Unknown").replaceAll("_", " "),
    sortAt: request.created_at || "",
  };
}

export function tbEndorsementInboxRow(row) {
  const status = row?.status || "";
  const caseLabel = row.case_number ? `TB · ${row.case_number}` : "Tuberculosis";
  return {
    key: `${KIND_TB_ENDORSEMENT}:${row.id}`,
    kind: KIND_TB_ENDORSEMENT,
    id: row.id,
    patient: row.source_patient,
    conditionLabel: caseLabel,
    typeLabel: "TB endorsement",
    sendingRhu: row.sending_rhu?.name || "RHU",
    status,
    statusLabel:
      TB_INBOX_STATUS_LABELS[status] ||
      String(status || "Unknown").replaceAll("_", " "),
    sortAt: row.endorsed_at || row.reviewed_at || "",
    caseId: row.case_id,
  };
}

/** Newest first; stable by id when timestamps match or are missing. */
export function mergeMonitoringInbox({
  handoffs = [],
  endorsements = [],
  includeTb = true,
} = {}) {
  const rows = [
    ...(Array.isArray(handoffs) ? handoffs.map(handoffInboxRow) : []),
    ...(includeTb && Array.isArray(endorsements)
      ? endorsements.map(tbEndorsementInboxRow)
      : []),
  ];
  return rows.sort((left, right) => {
    const byTime = String(right.sortAt || "").localeCompare(String(left.sortAt || ""));
    if (byTime !== 0) return byTime;
    return Number(right.id) - Number(left.id);
  });
}

/**
 * Legacy / deep-link mode: open the existing TB endorsement review UI without
 * the old tab chrome. Sidebar Monitoring Requests stays the entry point.
 */
export function monitoringInboxShowsTbReview(params, { canTbEndorsements = false } = {}) {
  if (!canTbEndorsements) return false;
  const search =
    params && typeof params.get === "function"
      ? params
      : new URLSearchParams(params || "");
  return Boolean(
    search.get("endorsement") ||
      search.get("case") ||
      search.get("tab") === "tb-endorsements",
  );
}

/** Clear TB review query keys so the unified list is shown again. */
export function clearTbReviewSearchParams(params) {
  const next = new URLSearchParams(params);
  next.delete("tab");
  next.delete("case");
  next.delete("page");
  next.delete("endorsement");
  return next;
}
