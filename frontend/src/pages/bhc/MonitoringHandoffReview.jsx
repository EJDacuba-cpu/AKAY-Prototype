import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionErrorState, RefreshingIndicator, SoftLoadingArea } from "../../components/common";
import PlainStatusStamp from "../../components/common/badges/PlainStatusStamp";
import { Button } from "../../components/ui/button";
import {
  acceptMonitoringHandoffRequest,
  correctMonitoringHandoffIdentityLink,
  flagMonitoringHandoffIdentityReview,
  getMonitoringHandoffRequest,
  linkMonitoringHandoffRequest,
  registerMonitoringHandoffSource,
  resolveMonitoringHandoffIdentityReview,
  searchBhcPatients,
} from "../../services/monitoringHandoffService";
import { formatDisplayValue, formatPatientName } from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import useAccess from "../../hooks/useAccess";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { LaboratoryEvidenceList } from "../../components/features/health-records/LaboratoryEvidence";
import { startRoute } from "../../utils/startConsultation";
import {
  canRegisterSourceAtBhc,
  canVerifyCrossRecordLink,
  compareIdentityFields,
  hasDemographicConflict,
  identitySourceLabel,
  isPotentialDemographicMatch,
  isSameSharedPatient,
  verificationStatusLabel,
} from "../../utils/handoffIdentityVerification";

const STATUS_LABELS = {
  pending_review: "Pending Review",
  linkage_needed: "Needs Verification",
  accepted_awaiting_first_visit: "Accepted — Awaiting First Visit",
  monitoring_active: "Monitoring Active",
  declined: "Declined",
  redirected: "Redirected",
};

const controlClass =
  "h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";

export default function MonitoringHandoffReview() {
  const { requestId } = useParams();
  const access = useAccess();
  const canAct = access.can("consultations.encode");
  const queryClient = useQueryClient();
  const [linkQuery, setLinkQuery] = useState("");
  const [linkMatches, setLinkMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchState, setSearchState] = useState("idle"); // idle | success | error
  const [searchError, setSearchError] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [verificationEvidence, setVerificationEvidence] = useState("");
  const [busy, setBusy] = useState("");

  const detailsQuery = useQuery({
    queryKey: queryKeys.monitoringHandoff(requestId),
    queryFn: () => getMonitoringHandoffRequest(requestId),
    enabled: Boolean(requestId),
  });
  const request = detailsQuery.data || null;
  const loading = Boolean(requestId) && detailsQuery.isPending && !request;
  const needsVerification = request?.status === "linkage_needed";
  const needsReview = request?.verification_status === "needs_review"
    || request?.identity_resolution === "needs_review";
  const verified = Boolean(request?.linked_patient)
    && ["pending_review", "accepted_awaiting_first_visit", "monitoring_active"].includes(request?.status);
  const canCorrectLink = canAct && request?.status === "pending_review" && Boolean(request?.linked_patient);

  const comparison = useMemo(
    () => (selectedMatch ? compareIdentityFields(request?.source_patient, selectedMatch) : []),
    [request?.source_patient, selectedMatch],
  );
  const samePatientSelected = isSameSharedPatient(request?.source_patient, selectedMatch);
  const potentialMatchSelected = isPotentialDemographicMatch(request?.source_patient, selectedMatch);
  const demographicConflict = selectedMatch
    && !samePatientSelected
    && hasDemographicConflict(request?.source_patient, selectedMatch);
  const canCrossLink = canVerifyCrossRecordLink({
    source: request?.source_patient,
    candidate: selectedMatch,
    identityConfirmed,
    needsReview,
    matchCount: linkMatches.length,
  });
  const canRegisterSource = needsVerification
    && canAct
    && !searching
    && canRegisterSourceAtBhc({
      searchState,
      matches: linkMatches,
      selectedMatch,
      needsReview,
    });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.monitoringHandoffs() });
    await queryClient.invalidateQueries({ queryKey: ["patients"] });
    await queryClient.invalidateQueries({ queryKey: ["rhu-shared-clinical"] });
    await detailsQuery.refetch();
  }

  function clearSearchSelection() {
    setSelectedMatch(null);
    setLinkMatches([]);
    setLinkQuery("");
    setSearchState("idle");
    setSearchError("");
    setReviewNote("");
    setIdentityConfirmed(false);
    setVerificationEvidence("");
  }

  async function searchDirectory(event) {
    event?.preventDefault?.();
    const query = linkQuery.trim();
    if (searching || busy || query.length < 2) return;
    setSearching(true);
    setSearchError("");
    setSelectedMatch(null);
    try {
      const rows = await searchBhcPatients(query);
      setLinkMatches(Array.isArray(rows) ? rows : []);
      setSearchState("success");
    } catch (error) {
      setSearchState("error");
      setSearchError(error?.message || "Search failed. Try again.");
      // Keep prior matches/selection; failed search is not a confirmed no-match.
    } finally {
      setSearching(false);
    }
  }

  async function run(action, fn, successMessage) {
    if (!canAct || busy) return;
    setBusy(action);
    try {
      await fn();
      toast.success(successMessage || "Saved.");
      clearSearchSelection();
      await refresh();
    } catch (error) {
      toast.error(error?.message || "Unable to update this request.");
      await detailsQuery.refetch();
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Monitoring Request">
        <SoftLoadingArea skeleton="monitoring-handoff" isLoading message="Loading monitoring request..." minHeight="min-h-[520px]">
          <div className="min-h-[520px]" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (detailsQuery.error && detailsQuery.error.status !== 404 && (!request || [401, 403].includes(detailsQuery.error.status))) {
    return (
      <DashboardLayout role="bhc" title="Monitoring Request">
        <ConnectionErrorState fullPage onRetry={() => detailsQuery.refetch()} retrying={detailsQuery.isFetching} variant={errorStateVariant(detailsQuery.error)} />
      </DashboardLayout>
    );
  }

  if (!request) {
    return (
      <DashboardLayout role="bhc" title="Monitoring Request">
        <div className="mx-auto max-w-lg py-20 text-center">
          <AlertTriangle className="mx-auto mb-4 text-neutral-500" size={28} />
          <h1 className="text-xl font-bold text-ink-900">Monitoring Request Not Found</h1>
          <p className="mt-2 text-sm text-neutral-600">This request does not exist or belongs to another facility.</p>
          <Button asChild variant="secondary" className="mt-6">
            <Link to="/bhc/patients?view=monitoring-requests"><ArrowLeft size={15} />Back to Monitoring Requests</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const source = request.source_patient || {};
  const sourceName = formatPatientName(source) || "Patient";
  const linkedPatient = request.linked_patient;
  const linkedId = linkedPatient?.id;
  const serviceKey = request.service_key || request.service?.key || "";
  const startPath = linkedId && request.handoff_kind === "service" && serviceKey
    ? startRoute({
      patientId: linkedId,
      selectedPrograms: [serviceKey],
      handoffId: request.id,
    })
    : linkedId && request.condition?.id
      ? startRoute({ patientId: linkedId, startConditionIds: [request.condition.id] })
      : linkedId
        ? startRoute({ patientId: linkedId })
        : null;
  const canAccept = canAct && request.status === "pending_review";
  const canStart = Boolean(request.can_start_consultation && startPath);
  const showActions = canAccept || canStart;

  return (
    <DashboardLayout role="bhc" title="Monitoring Request">
      <div className="min-w-0 space-y-3">
        <Button asChild variant="link" size="compact" className="px-0">
          <Link to="/bhc/patients?view=monitoring-requests"><ArrowLeft size={15} />Back to Monitoring Requests</Link>
        </Button>

        <article className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          {/* A. Patient Summary */}
          <header className="border-b border-neutral-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-bold tracking-tight text-ink-900">{sourceName}</h1>
                <p className="mt-1 text-sm tabular-nums text-neutral-600">Patient ID {source.id || "—"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PlainStatusStamp
                  label={STATUS_LABELS[request.status] || request.status}
                  tone={requestStatusTone(request.status)}
                />
                <PlainStatusStamp
                  label={verificationStatusLabel(request.verification_status)}
                  tone={verificationTone(request.verification_status)}
                />
                {detailsQuery.isFetching && <RefreshingIndicator label="Updating..." />}
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Birthdate" value={source.birthdate} />
              <Detail label="Sex" value={source.sex} />
              <Detail label="Source" value={identitySourceLabel(request.identity_source)} />
              <Detail
                label={request.handoff_kind === "service" ? "Health service" : "RHU condition"}
                value={request.handoff_kind === "service"
                  ? (request.service?.label || serviceKey || "—")
                  : request.condition?.name}
              />
              <Detail label="Sending RHU" value={request.sending_rhu?.name} />
              <Detail label="Receiving BHC" value={request.receiving_bhc?.name} />
            </dl>
          </header>

          {/* B. Patient Verification */}
          {needsVerification && canAct && !needsReview && (
            <section className="space-y-4 border-b border-neutral-200 p-4 sm:p-5">
              <h2 className="text-[17px] font-bold text-ink-900">Patient Verification</h2>

              <form onSubmit={searchDirectory} className="flex flex-wrap items-end gap-2">
                <label className="min-w-[12rem] flex-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  Search BHC patients
                  <input
                    value={linkQuery}
                    onChange={(event) => {
                      setLinkQuery(event.target.value);
                      if (searchState === "error") {
                        setSearchError("");
                        setSearchState(linkMatches.length || selectedMatch ? "success" : "idle");
                      }
                    }}
                    placeholder="Name, Patient ID, or contact"
                    className={`mt-1 ${controlClass}`}
                    disabled={Boolean(busy) || searching}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={Boolean(busy) || searching || linkQuery.trim().length < 2}
                >
                  {searching ? "Searching…" : "Search"}
                </Button>
              </form>

              {searchError && (
                <p role="alert" className="text-sm text-alert-700">{searchError}</p>
              )}

              {searchState === "success" && linkMatches.length > 0 && (
                <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
                  {linkMatches.map((patient) => {
                    const selected = selectedMatch?.id === patient.id;
                    return (
                      <li key={patient.id}>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => setSelectedMatch(patient)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                            selected ? "bg-brand-50" : "hover:bg-neutral-50"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink-900">
                              {formatPatientName(patient) || `Patient ${patient.id}`}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] tabular-nums text-neutral-600">
                              ID {patient.id}
                              {patient.birthdate ? ` · ${patient.birthdate}` : ""}
                              {patient.sex ? ` · ${patient.sex}` : ""}
                              {patient.contact_number ? ` · ${patient.contact_number}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                            {selected ? "Selected" : "Select"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {searchState === "success" && linkMatches.length === 0 && !selectedMatch && (
                <p className="text-sm text-neutral-600">No matching BHC registration found.</p>
              )}

              {selectedMatch && (
                <div className="overflow-hidden rounded-lg border border-neutral-200">
                  <div className="border-b border-neutral-200 bg-neutral-100 px-3 py-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-neutral-600">Identity comparison</h3>
                  </div>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                        <th className="px-3 py-2 font-bold">Field</th>
                        <th className="px-3 py-2 font-bold">RHU source</th>
                        <th className="px-3 py-2 font-bold">Selected BHC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((row) => (
                        <tr key={row.label} className="border-t border-neutral-100">
                          <td className="px-3 py-2 text-neutral-600">{row.label}</td>
                          <td className="px-3 py-2 tabular-nums text-ink-900">{row.source}</td>
                          <td className={`px-3 py-2 tabular-nums ${row.match ? "text-ink-900" : "font-medium text-warning-700"}`}>
                            {row.candidate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedMatch && samePatientSelected && (
                <Button
                  type="button"
                  variant="brand"
                  disabled={busy === "link"}
                  onClick={() => run(
                    "link",
                    () => linkMonitoringHandoffRequest(request.id, selectedMatch.id),
                    "Existing patient verified.",
                  )}
                >
                  Verify Existing Patient
                </Button>
              )}

              {selectedMatch && !samePatientSelected && potentialMatchSelected && (
                <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <PlainStatusStamp label="Potential Match" tone="warning" />
                  <p className="text-sm text-neutral-700">
                    Name, birthdate, and sex match. Confirm supporting identity details before linking.
                    Patient IDs stay unchanged; records are not merged.
                  </p>
                  {linkMatches.length > 1 && (
                    <p className="text-sm text-warning-700">
                      Multiple potential registrations were found. Confirm you selected the correct BHC record.
                    </p>
                  )}
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    Verification evidence summary
                    <textarea
                      value={verificationEvidence}
                      onChange={(event) => setVerificationEvidence(event.target.value)}
                      rows={2}
                      placeholder="e.g. Contact and address matched registration card"
                      className={`mt-1 ${controlClass} h-auto py-2`}
                      disabled={Boolean(busy)}
                    />
                  </label>
                  <label className="flex items-start gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={identityConfirmed}
                      onChange={(event) => setIdentityConfirmed(event.target.checked)}
                      disabled={Boolean(busy)}
                    />
                    <span>
                      I verified that BHC Patient ID {selectedMatch.id} is the same person as RHU
                      Patient ID {request.source_patient?.id}.
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="brand"
                    disabled={busy === "link" || !canCrossLink}
                    onClick={() => run(
                      "link",
                      () => linkMonitoringHandoffRequest(request.id, selectedMatch.id, {
                        identityConfirmed: true,
                        verificationEvidence,
                      }),
                      "Cross-record patient identity verified.",
                    )}
                  >
                    Verify &amp; Link Existing Patient
                  </Button>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    Or escalate for review
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={2}
                      className={`mt-1 ${controlClass} h-auto py-2`}
                      disabled={Boolean(busy)}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy === "review" || !reviewNote.trim()}
                    onClick={() => run(
                      "review",
                      () => flagMonitoringHandoffIdentityReview(request.id, reviewNote.trim()),
                      "Escalated for identity review.",
                    )}
                  >
                    Escalate for Review
                  </Button>
                </div>
              )}

              {selectedMatch && demographicConflict && (
                <div className="space-y-2">
                  <p className="text-sm text-warning-700">
                    Demographics conflict with the RHU source patient. Do not link. Escalate for identity review.
                  </p>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    Review note
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={2}
                      className={`mt-1 ${controlClass} h-auto py-2`}
                      disabled={Boolean(busy)}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy === "review" || !reviewNote.trim()}
                    onClick={() => run(
                      "review",
                      () => flagMonitoringHandoffIdentityReview(request.id, reviewNote.trim()),
                      "Escalated for identity review.",
                    )}
                  >
                    Escalate for Review
                  </Button>
                </div>
              )}

              {canRegisterSource && (
                <Button
                  type="button"
                  variant="brand"
                  disabled={Boolean(busy)}
                  onClick={() => run(
                    "register",
                    () => registerMonitoringHandoffSource(request.id),
                    "Patient registered at this BHC.",
                  )}
                >
                  {busy === "register" ? "Registering…" : "Register at BHC"}
                </Button>
              )}
            </section>
          )}

          {needsReview && (
            <section className="space-y-3 border-b border-neutral-200 bg-warning-50 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <PlainStatusStamp label="Requires Review" tone="warning" />
                <p className="text-sm text-warning-700">
                  {request.identity_resolution_note || "Identity requires authorized review."}
                </p>
              </div>
              {canAct && needsVerification && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    Resolution note
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={2}
                      className={`mt-1 ${controlClass} h-auto py-2 bg-white`}
                      disabled={Boolean(busy)}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="brand"
                    disabled={busy === "resolve" || !reviewNote.trim()}
                    onClick={() => run(
                      "resolve",
                      () => resolveMonitoringHandoffIdentityReview(request.id, reviewNote.trim()),
                      "Identity review cleared. Verify linkage again.",
                    )}
                  >
                    Clear Review &amp; Resume Verification
                  </Button>
                </div>
              )}
            </section>
          )}

          {verified && (
            <section className="space-y-3 border-b border-neutral-200 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-bold text-ink-900">Verified at Receiving BHC</h2>
                  <p className="mt-1 text-sm tabular-nums text-neutral-700">
                    {formatPatientName(linkedPatient) || sourceName} · ID {linkedId}
                  </p>
                  {request.identity_resolution === "verified_cross_record" && (
                    <p className="mt-1 text-xs text-neutral-600">
                      Cross-record link: RHU source ID {request.source_patient?.id} → BHC ID {linkedId}. Both records preserved.
                    </p>
                  )}
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/bhc/patients/${linkedId}`}>Patient Profile</Link>
                </Button>
              </div>
              {canCorrectLink && (
                <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-sm text-neutral-700">
                    Incorrect verification? Unlink and return this request to identity review. Existing consultations stay on their original patient IDs.
                  </p>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    Correction note
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={2}
                      className={`mt-1 ${controlClass} h-auto py-2 bg-white`}
                      disabled={Boolean(busy)}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy === "correct" || !reviewNote.trim()}
                    onClick={() => run(
                      "correct",
                      () => correctMonitoringHandoffIdentityLink(request.id, reviewNote.trim()),
                      "Identity link cleared for correction.",
                    )}
                  >
                    Correct Identity Link
                  </Button>
                </div>
              )}
            </section>
          )}

          {verified && (
            <section className="border-b border-neutral-200 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink-900">Monitoring recommendation</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{request.recommendation || "—"}</p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {request.handoff_kind === "service" ? (
                  <Detail
                    label="Health service"
                    value={request.service?.label || serviceKey || "—"}
                  />
                ) : (
                  <>
                    <Detail label="Condition" value={request.condition?.name} />
                    <Detail label="Status" value={formatDisplayValue(request.condition?.status)} />
                  </>
                )}
              </dl>
            </section>
          )}

          {verified && (
            <section className="min-w-0 space-y-3 border-b border-neutral-200 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink-900">RHU Laboratory Evidence</h2>
              <LaboratoryEvidenceList
                entries={request.laboratory_evidence || []}
                emptyMessage="No laboratory evidence shared with this request."
              />
            </section>
          )}

          {verified && (
            <section className="border-b border-neutral-200 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink-900">Physician-authorized prescriptions</h2>
              <p className="mt-1 text-xs text-neutral-600">
                Informational only. Dispense from this BHC through consultation inventory workflows; RHU prescriptions are fulfilled at the RHU To Dispense desk.
              </p>
              {(request.prescriptions || []).length === 0 ? (
                <p className="mt-2 text-sm text-neutral-600">None shared with this request.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {request.prescriptions.map((rx, index) => (
                    <li key={`${rx.medicineName || "rx"}-${index}`} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-ink-900">
                      <p className="font-medium">{rx.line || rx.medicineName}</p>
                      {(rx.physicianName || rx.authorizedAt) && (
                        <p className="mt-1 text-xs text-neutral-600">
                          {[rx.physicianName, rx.authorizedAt].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* C. Monitoring Request Actions */}
          {showActions && (
            <section className="space-y-3 p-4 sm:p-5">
              <h2 className="text-[17px] font-bold text-ink-900">Monitoring Request Actions</h2>
              <div className="flex flex-wrap gap-2">
                {canAccept && (
                  <Button
                    type="button"
                    variant="brand"
                    disabled={busy === "accept"}
                    onClick={() => run(
                      "accept",
                      () => acceptMonitoringHandoffRequest(request.id),
                      "Monitoring request accepted.",
                    )}
                  >
                    Accept Monitoring
                  </Button>
                )}
                {canStart && (
                  <Button asChild variant="brand">
                    <Link to={startPath}>Start Consultation</Link>
                  </Button>
                )}
              </div>
            </section>
          )}
        </article>
      </div>
    </DashboardLayout>
  );
}

function requestStatusTone(status) {
  if (status === "monitoring_active" || status === "accepted_awaiting_first_visit") return "success";
  if (status === "pending_review") return "info";
  if (status === "linkage_needed") return "warning";
  if (status === "declined") return "danger";
  return "neutral";
}

function verificationTone(status) {
  if (status === "verified") return "success";
  if (status === "needs_review") return "warning";
  if (status === "awaiting_verification") return "warning";
  return "neutral";
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{formatDisplayValue(value) || "—"}</dd>
    </div>
  );
}

void MonitoringHandoffReview;
