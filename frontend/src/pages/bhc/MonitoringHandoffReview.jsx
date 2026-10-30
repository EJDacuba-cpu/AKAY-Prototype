import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { RefreshingIndicator, SoftLoadingArea } from "../../components/common";
import { Button } from "../../components/ui/button";
import {
  acceptMonitoringHandoffRequest,
  declineMonitoringHandoffRequest,
  getMonitoringHandoffRequest,
  linkMonitoringHandoffRequest,
  searchBhcPatients,
} from "../../services/monitoringHandoffService";
import { formatDisplayValue, formatPatientName } from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import useAccess from "../../hooks/useAccess";

const STATUS_LABELS = {
  pending_review: "Pending Review",
  linkage_needed: "Linkage Needed",
  accepted_awaiting_first_visit: "Accepted — Awaiting First Visit",
  monitoring_active: "Monitoring Active",
  declined: "Declined",
  redirected: "Redirected",
};

export default function MonitoringHandoffReview() {
  const { requestId } = useParams();
  const access = useAccess();
  const canAct = access.can("consultations.encode");
  const queryClient = useQueryClient();
  const [linkQuery, setLinkQuery] = useState("");
  const [linkMatches, setLinkMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [reason, setReason] = useState("");
  const [redirectBhcId, setRedirectBhcId] = useState("");
  const [busy, setBusy] = useState("");

  const detailsQuery = useQuery({
    queryKey: queryKeys.monitoringHandoff(requestId),
    queryFn: () => getMonitoringHandoffRequest(requestId),
    enabled: Boolean(requestId),
  });
  const request = detailsQuery.data || null;
  const loading = detailsQuery.isLoading && !request;
  const otherBhcs = request?.catchment_bhcs || [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.monitoringHandoffs() });
    await detailsQuery.refetch();
  }

  async function searchDirectory(query) {
    setLinkQuery(query);
    if (!query.trim()) {
      setLinkMatches([]);
      return;
    }
    setSearching(true);
    try {
      const rows = await searchBhcPatients(query.trim());
      setLinkMatches(Array.isArray(rows) ? rows : []);
    } catch (error) {
      toast.error(error?.message || "Unable to search this BHC directory.");
    } finally {
      setSearching(false);
    }
  }

  async function run(action, fn) {
    if (!canAct || busy) return;
    setBusy(action);
    try {
      await fn();
      toast.success(action === "accept" ? "Monitoring request accepted. Start Consultation to begin monitoring." : "Saved.");
      await refresh();
    } catch (error) {
      toast.error(error?.message || "Unable to update this request.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Monitoring Request">
        <SoftLoadingArea skeleton="details" isLoading message="Loading monitoring request..." minHeight="min-h-[520px]">
          <div className="min-h-[520px]" />
        </SoftLoadingArea>
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
            <Link to="/bhc/patients?view=monitoring-requests"><ArrowLeft size={15} />Back to Patients</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const sourceName = formatPatientName(request.source_patient) || "Patient";
  const linkedName = request.linked_patient ? formatPatientName(request.linked_patient) : "";

  return (
    <DashboardLayout role="bhc" title="Monitoring Request">
      <div className="min-w-0 space-y-3">
        <Button asChild variant="link" size="compact" className="px-0">
          <Link to="/bhc/patients?view=monitoring-requests"><ArrowLeft size={15} />Back to Patients</Link>
        </Button>
        <article className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <header className="border-b border-neutral-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-bold tracking-tight text-ink-900">{sourceName}</h1>
                <p className="mt-1 text-sm text-neutral-600">RHU monitoring request</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-ink-900">
                  {STATUS_LABELS[request.status] || request.status}
                </span>
                {detailsQuery.isFetching && <RefreshingIndicator label="Updating request..." />}
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <Detail label="Sending RHU" value={request.sending_rhu?.name} />
              <Detail label="Receiving BHC" value={request.receiving_bhc?.name} />
              <Detail label="Registration" value={registrationLabel(request.registration_status)} />
            </dl>
          </header>
          <section className="border-b border-neutral-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink-900">RHU-confirmed diagnosis</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Detail label="Condition" value={request.condition?.name} />
              <Detail label="Status" value={formatDisplayValue(request.condition?.status)} />
            </dl>
            <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">{request.recommendation}</p>
          </section>
          {request.status === "linkage_needed" && canAct && (
            <section className="border-b border-neutral-200 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink-900">Verify / Link Patient</h2>
              <p className="mt-1 text-sm text-neutral-600">Search this BHC directory only. Linking never creates a patient.</p>
              <input
                value={linkQuery}
                onChange={(event) => searchDirectory(event.target.value)}
                placeholder="Search name, ID, or contact number"
                className="mt-3 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm"
              />
              {searching && <p className="mt-2 text-xs text-neutral-500">Searching…</p>}
              <ul className="mt-3 divide-y divide-neutral-100">
                {linkMatches.map((patient) => (
                  <li key={patient.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-medium text-ink-900">{formatPatientName(patient) || `Patient ${patient.id}`}</span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy === "link"}
                      onClick={() => run("link", () => linkMonitoringHandoffRequest(request.id, patient.id))}
                    >
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {linkedName && (
            <section className="border-b border-neutral-200 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-ink-900">Linked BHC patient</h2>
              <p className="mt-2 text-sm text-neutral-700">{linkedName}</p>
            </section>
          )}
          {canAct && ["pending_review", "linkage_needed", "accepted_awaiting_first_visit"].includes(request.status) && (
            <section className="p-4 sm:p-5">
              <div className="flex flex-wrap gap-2">
                {request.status === "pending_review" && (
                  <Button type="button" variant="brand" disabled={busy === "accept"} onClick={() => run("accept", () => acceptMonitoringHandoffRequest(request.id))}>
                    Accept Monitoring
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy === "decline" || !reason.trim()}
                  onClick={() => run("decline", () => declineMonitoringHandoffRequest(request.id, {
                    reason: reason.trim(),
                    redirectedToBhcId: redirectBhcId || undefined,
                  }))}
                >
                  Decline / Redirect
                </Button>
              </div>
              <label className="mt-4 block text-xs">
                <span className="mb-1 block font-semibold uppercase tracking-wide text-neutral-600">Reason</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
              </label>
              <label className="mt-3 block text-xs">
                <span className="mb-1 block font-semibold uppercase tracking-wide text-neutral-600">Redirect to another catchment BHC (optional)</span>
                <select value={redirectBhcId} onChange={(event) => setRedirectBhcId(event.target.value)} className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm">
                  <option value="">Do not redirect</option>
                  {otherBhcs.map((bhc) => (
                    <option key={bhc.id} value={String(bhc.id)}>{bhc.name}</option>
                  ))}
                </select>
              </label>
            </section>
          )}
        </article>
      </div>
    </DashboardLayout>
  );
}

function registrationLabel(status) {
  if (status === "linkage_needed") return "Needs identity link";
  if (status === "registered_at_receiving_bhc") return "Registered at this BHC";
  return "RHU identity only";
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{formatDisplayValue(value) || "—"}</dd>
    </div>
  );
}

void MonitoringHandoffReview;
