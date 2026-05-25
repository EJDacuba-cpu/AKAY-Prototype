import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Search,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ActionMenu from "../../components/common/tables/ActionMenu";
import { getReferrals } from "../../services/referrals";

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */

export default function Referrals() {
  const [referrals, setReferrals] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  /* Load Referrals via Service */
  useEffect(() => {
    async function loadReferrals() {
      const data = await getReferrals();
      setReferrals(data);
    }
    loadReferrals();
  }, []);

  /* Filtered Referrals */
  const filteredReferrals = useMemo(() => {
    return referrals.filter((referral) => {
      const matchesSearch =
        referral.patientName?.toLowerCase().includes(search.toLowerCase()) ||
        referral.trackingId?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "All" ? true : referral.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [referrals, search, statusFilter]);

  return (
    <DashboardLayout role="bhc" title="Referral Coordination Center">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            Referral Coordination Center
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Monitor and coordinate official BHC-to-RHU clinical escalation
            referrals.
          </p>
        </div>
      </div>

      {/* Quick Filters & Search Row */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <QuickFilter
            active={statusFilter === "All"}
            label="All Referrals"
            onClick={() => setStatusFilter("All")}
          />
          <QuickFilter
            active={statusFilter === "Pending RHU Review"}
            label="Pending RHU Review"
            onClick={() => setStatusFilter("Pending RHU Review")}
          />
          <QuickFilter
            active={statusFilter === "Under Assessment"}
            label="Under Assessment"
            onClick={() => setStatusFilter("Under Assessment")}
          />
          <QuickFilter
            active={statusFilter === "Completed"}
            label="Completed"
            onClick={() => setStatusFilter("Completed")}
          />
          <QuickFilter
            active={statusFilter === "No-Show"}
            label="No-Show"
            onClick={() => setStatusFilter("No-Show")}
          />
        </div>

        <div className="relative w-full max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BCC3CD]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] pl-9 pr-3 text-sm text-[#1A1A1A] outline-none transition focus:border-[#0B2E59] focus:ring-1 focus:ring-[#0B2E59]/10"
            placeholder="Search patient or tracking ID..."
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-sm">
        {/* Table Header Bar */}
        <div className="flex items-center justify-between border-b border-[#F3F4F6] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF]">
              <ClipboardList size={15} className="text-[#2563EB]" />
            </div>
            <h2 className="text-sm font-semibold text-[#0B2E59]">
              Referral Records
            </h2>
            <span className="rounded-md bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-semibold text-[#6B7280]">
              {filteredReferrals.length}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3">Tracking ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Classification</th>
                <th className="px-4 py-3">Referral Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F8FAFC]">
              {filteredReferrals.length > 0 ? (
                filteredReferrals.map((referral) => (
                  <tr
                    key={referral.id}
                    className="group transition-colors duration-150 hover:bg-slate-50/80"
                  >
                    {/* Tracking ID */}
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-semibold text-[#0B2E59]">
                        {referral.trackingId}
                      </span>
                    </td>

                    {/* Patient */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {referral.patientName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {referral.ageSex}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Classification */}
                    <td className="px-4 py-4">
                      <ClassificationBadge
                        classification={referral.classification}
                      />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <StatusBadge status={referral.status} />
                    </td>

                    {/* Submitted */}
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {new Date(referral.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 text-right">
                      <ActionMenu
                        title={referral.patient}
                        subtitle={referral.trackingId}
                        viewLink={`/bhc/referrals/${referral.id}`}
                        viewLabel="View Referral"
                        editLink={`/bhc/referrals/${referral.id}/print`}
                        editLabel="Print Referral Slip"
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <ClipboardList
                      size={36}
                      className="mx-auto mb-4 text-slate-300"
                    />
                    <p className="text-sm font-semibold text-slate-600">
                      No referrals found
                    </p>
                    <p className="mt-1 max-w-sm mx-auto text-xs text-slate-400">
                      Referrals generated from consultation assessments will
                      appear here after escalation to RHU.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────
   Sub-Components
───────────────────────────────────────────── */

function QuickFilter({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[11px] font-semibold transition ${
        active
          ? "bg-[#0B2E59] text-white"
          : "border border-[#E8ECF0] bg-white text-[#6B7280] hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    "Pending RHU Review": "bg-slate-100 text-slate-700",
    "Received by RHU": "bg-blue-100 text-blue-700",
    "Under Assessment": "bg-amber-100 text-amber-700",
    Completed: "bg-emerald-100 text-emerald-700",
    "No-Show": "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${
        map[status] || "bg-slate-100 text-slate-700"
      }`}
    >
      {status}
    </span>
  );
}

function ClassificationBadge({ classification }) {
  const map = {
    "General Consultation": "bg-blue-100 text-blue-700",
    "Maternal Care": "bg-pink-100 text-pink-700",
    Immunization: "bg-emerald-100 text-emerald-700",
  };

  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${
        map[classification] || "bg-slate-100 text-slate-700"
      }`}
    >
      {classification}
    </span>
  );
}

