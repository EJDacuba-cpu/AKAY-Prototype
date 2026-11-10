import { useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { TbEndorsementReview } from "../../components/features/health-records/TbEndorsementReview";
import { getTbEndorsements, getTbEndorsement, actOnTbEndorsement } from "../../services/tbCaseService";
import { TB_ENDORSEMENT_LABELS, tbDecisionRecorded } from "../../utils/tbEndorsements";
import { formatPatientName } from "../../utils/formatters";

/** Deep links keep working; access lives under Monitoring Requests. */
export function BhcTbEndorsementsRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("view", "monitoring-requests");
  next.set("tab", "tb-endorsements");
  return <Navigate to={`/bhc/patients?${next.toString()}`} replace />;
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
  function change(key, value) {
    const next = new URLSearchParams(params);
    next.set(key, String(value));
    if (key === "page") next.delete("endorsement");
    setParams(next);
    setError("");
  }
  async function refresh() {
    await Promise.all([list.refetch(), ...(selectedId ? [detail.refetch()] : []),
      client.invalidateQueries({ queryKey: ["tb-case"] }), client.invalidateQueries({ queryKey: ["tb-cases"] })]);
  }
  async function act(action, payload) {
    if (running.current || !detail.data) return;
    const id = detail.data.id;
    running.current = true; setBusy(true); setError("");
    try { await actOnTbEndorsement(id, action, payload); }
    catch (failure) {
      const recorded = (failure.isNetworkError || failure.status >= 500)
        && await getTbEndorsement(id).then(row => tbDecisionRecorded(action, payload, row)).catch(() => false);
      if (!recorded) setError(Object.values(failure.errors || {}).flat().join(" ") || failure.message || "Unable to record the decision. Refresh and try again.");
    } finally {
      try { await refresh(); } finally { running.current = false; setBusy(false); }
    }
  }
  const body = (
    <main className="min-w-0 space-y-5">
      <div className={`flex flex-wrap items-center gap-3 ${embedded ? "justify-end" : "justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-lg font-semibold text-ink-900">TB endorsements</h1>
            <p className="mt-1 text-sm text-neutral-600">Review RHU treatment handoffs and access shared Form 4B cards.</p>
          </div>
        )}
        <div className="flex gap-2">
          {!embedded && (
            <Button asChild variant="secondary">
              <Link to="/bhc/patients?view=monitoring-requests">Monitoring Requests</Link>
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={refresh}>Refresh</Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {list.isError ? <div className="space-y-2"><p role="alert">Unable to load TB endorsements.</p><Button variant="secondary" onClick={() => list.refetch()}>Retry</Button></div>
        : list.isPending ? <p role="status">Loading TB endorsements…</p>
        : list.data?.data?.length === 0 ? <p className="text-sm text-neutral-600">No TB endorsements for this BHC.</p>
        : <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside aria-label="Endorsement list" className="min-w-0 space-y-2">
            {list.data.data.map(row => <button type="button" key={row.id} disabled={busy} aria-pressed={String(selectedId) === String(row.id)} onClick={() => change("endorsement", row.id)} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-3 text-left text-sm text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ink-400 aria-pressed:border-ink-600 aria-pressed:bg-neutral-50 disabled:opacity-50"><span className="block font-semibold text-ink-900">{row.case_number}</span><span className="block">{formatPatientName(row.source_patient)}</span><span className="mt-1 block text-xs text-neutral-500">{TB_ENDORSEMENT_LABELS[row.status]}</span></button>)}
            <div className="flex items-center justify-between gap-2 pt-2"><Button variant="secondary" disabled={busy || page <= 1} onClick={() => change("page", page - 1)}>Previous</Button><span className="text-xs text-neutral-600">{page} / {list.data.last_page}</span><Button variant="secondary" disabled={busy || page >= list.data.last_page} onClick={() => change("page", page + 1)}>Next</Button></div>
          </aside>
          <div className="min-w-0 border border-neutral-200 bg-white p-4 sm:p-5">
            {detail.isError ? <div className="space-y-2"><p role="alert">Unable to load this endorsement.</p><Button variant="secondary" onClick={() => detail.refetch()}>Retry</Button></div>
              : detail.isPending ? <p role="status">Loading endorsement…</p>
              : <TbEndorsementReview key={`${detail.data.id}:${detail.data.version}`} endorsement={detail.data} onAction={act} busy={busy} />}
          </div>
        </div>}
    </main>
  );
  if (embedded) return body;
  return <DashboardLayout role="bhc" title="TB Endorsements">{body}</DashboardLayout>;
}
