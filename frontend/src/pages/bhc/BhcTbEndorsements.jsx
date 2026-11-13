import { useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionErrorState, PageSkeletonLoader, RefreshingIndicator } from "../../components/common";
import { Button } from "../../components/ui/button";
import PlainStatusStamp from "../../components/common/badges/PlainStatusStamp";
import { TbEndorsementReview } from "../../components/features/health-records/TbEndorsementReview";
import { getTbEndorsements, getTbEndorsement, actOnTbEndorsement } from "../../services/tbCaseService";
import { TB_ENDORSEMENT_LABELS, tbDecisionRecorded } from "../../utils/tbEndorsements";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { formatPatientName } from "../../utils/formatters";

/** Deep links keep working; access lives under Monitoring Requests (unified inbox). */
export function BhcTbEndorsementsRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("view", "monitoring-requests");
  // Do not force the old TB tab; the unified list is the entry. Explicit
  // case/endorsement query params still open the TB review UI.
  next.delete("tab");
  return <Navigate to={`/bhc/patients?${next.toString()}`} replace />;
}

function endorsementTone(status) {
  if (status === "accepted") return "success";
  if (status === "pending_review") return "info";
  if (status === "linkage_needed") return "warning";
  if (status === "declined" || status === "revoked") return "danger";
  return "neutral";
}

export default function BhcTbEndorsements({ embedded = false } = {}) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const caseId = params.get("case") || "";
  const list = useQuery({ queryKey: ["tb-endorsements", page, caseId], queryFn: () => getTbEndorsements(page, caseId), retry: false });
  const selectedId = params.get("endorsement") || list.data?.data?.[0]?.id || "";
  const detail = useQuery({ queryKey: ["tb-endorsement", String(selectedId)], queryFn: () => getTbEndorsement(selectedId), enabled: Boolean(selectedId), retry: false, refetchOnWindowFocus: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const rows = list.data?.data || [];
  const lastPage = list.data?.last_page || 1;

  function change(key, value) {
    const next = new URLSearchParams(params);
    next.set(key, String(value));
    if (key === "page") next.delete("endorsement");
    setParams(next);
    setError("");
  }

  async function refresh() {
    await Promise.all([
      list.refetch(),
      ...(selectedId ? [detail.refetch()] : []),
      client.invalidateQueries({ queryKey: ["tb-case"] }),
      client.invalidateQueries({ queryKey: ["tb-cases"] }),
    ]);
  }

  async function act(action, payload) {
    if (running.current || !detail.data) return;
    const id = detail.data.id;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await actOnTbEndorsement(id, action, payload);
    } catch (failure) {
      const recorded =
        (failure.isNetworkError || failure.status >= 500) &&
        (await getTbEndorsement(id)
          .then((row) => tbDecisionRecorded(action, payload, row))
          .catch(() => false));
      if (!recorded) {
        setError(
          Object.values(failure.errors || {}).flat().join(" ") ||
            failure.message ||
            "Unable to record the decision. Refresh and try again.",
        );
      }
    } finally {
      try {
        await refresh();
      } finally {
        running.current = false;
        setBusy(false);
      }
    }
  }

  if (list.isError && !list.data) {
    const errorState = (
      <ConnectionErrorState
        fullPage
        variant={errorStateVariant(list.error)}
        onRetry={() => list.refetch()}
        retrying={list.isFetching}
      />
    );
    if (embedded) return errorState;
    return (
      <DashboardLayout role="bhc" title="TB Endorsements">
        {errorState}
      </DashboardLayout>
    );
  }

  if (list.isPending && !list.data) {
    const loadingState = (
      <PageSkeletonLoader skeleton="table" message="Loading TB endorsements…" options={{ columns: 1, action: false }} />
    );
    if (embedded) return loadingState;
    return (
      <DashboardLayout role="bhc" title="TB Endorsements">
        {loadingState}
      </DashboardLayout>
    );
  }

  function backToUnifiedInbox() {
    const next = new URLSearchParams(params);
    next.set("view", "monitoring-requests");
    next.delete("tab");
    next.delete("case");
    next.delete("page");
    next.delete("endorsement");
    setParams(next, { replace: true });
  }

  const body = (
    <main className="min-w-0 space-y-4">
      <div className={`flex flex-wrap items-center gap-3 ${embedded ? "justify-end" : "justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-[17px] font-bold tracking-tight text-ink-800">TB endorsements</h1>
            <p className="mt-1 text-[13px] text-neutral-600">
              Review RHU treatment handoffs and access shared Form 4B cards.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          {embedded ? (
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={backToUnifiedInbox}>
              Back to Monitoring Requests
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link to="/bhc/patients?view=monitoring-requests">Monitoring Requests</Link>
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={busy || list.isFetching} onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-alert-700">{error}</p>}

      {list.isError && list.data ? (
        <p role="status" className="text-sm text-neutral-600">
          Unable to refresh TB endorsements. Showing the last list that loaded.
        </p>
      ) : null}

      {list.isFetching && list.data ? (
        <div className="flex justify-end"><RefreshingIndicator label="Updating TB endorsements..." /></div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-14 text-center shadow-card">
          <p className="text-sm font-semibold text-ink-800">No TB endorsements for this BHC.</p>
          <p className="mt-1 text-xs text-neutral-600">
            RHU treatment handoffs assigned to this center will appear here.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs tabular-nums text-neutral-600">
            {rows.length} endorsement{rows.length === 1 ? "" : "s"}
            {caseId ? " for this case" : ""}
          </p>
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside
              aria-label="Endorsement list"
              className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card"
            >
              <div className="hidden h-11 items-center bg-neutral-100 px-4 text-[10px] font-bold uppercase tracking-wide text-neutral-600 sm:flex">
                Case / Patient
              </div>
              <ul className="divide-y divide-neutral-100">
                {rows.map((row) => {
                  const active = String(selectedId) === String(row.id);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        disabled={busy}
                        aria-pressed={active}
                        onClick={() => change("endorsement", row.id)}
                        className={`flex min-h-14 w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 disabled:opacity-50 ${
                          active ? "bg-neutral-50" : "bg-white"
                        }`}
                      >
                        <span className="block truncate text-sm font-semibold text-ink-800">
                          {row.case_number}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-600">
                          {formatPatientName(row.source_patient)}
                        </span>
                        <PlainStatusStamp
                          label={TB_ENDORSEMENT_LABELS[row.status] || row.status}
                          tone={endorsementTone(row.status)}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between gap-2 border-t border-neutral-200 px-3 py-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || page <= 1}
                  onClick={() => change("page", page - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs tabular-nums text-neutral-600">
                  {page} / {lastPage}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || page >= lastPage}
                  onClick={() => change("page", page + 1)}
                >
                  Next
                </Button>
              </div>
            </aside>

            <div className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-card sm:p-5">
              {detail.isError ? (
                <ConnectionErrorState
                  size="compact"
                  variant={errorStateVariant(detail.error)}
                  onRetry={() => detail.refetch()}
                  retrying={detail.isFetching}
                />
              ) : detail.isPending ? (
                <p role="status" className="text-sm text-neutral-600">
                  Loading endorsement…
                </p>
              ) : (
                <TbEndorsementReview
                  key={`${detail.data.id}:${detail.data.version}`}
                  endorsement={detail.data}
                  onAction={act}
                  busy={busy}
                />
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );

  if (embedded) return body;
  return (
    <DashboardLayout role="bhc" title="TB Endorsements">
      {body}
    </DashboardLayout>
  );
}
