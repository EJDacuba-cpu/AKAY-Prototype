import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Search,
  Clock,
  CheckCircle2,
  Activity,
  XCircle,
  RotateCcw,
  X,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ActionMenu from "../../components/common/tables/ActionMenu";
import { getReferrals } from "../../services/referrals";

/* ─────────────────────────────────────────────
   Tab Configuration
───────────────────────────────────────────── */
const REFERRAL_TABS = [
  { key: "All", label: "All Referrals", icon: ClipboardList },
  { key: "Pending", label: "Pending", icon: Clock },
  { key: "Received", label: "Received", icon: ClipboardList },
  { key: "For Monitoring", label: "Monitoring", icon: Activity },
  { key: "Completed", label: "Completed", icon: CheckCircle2 },
  { key: "No-Show", label: "No-Show", icon: XCircle },
];

function getReferralClassification(referral) {
  return (
    referral.classification ||
    referral.referralCategory ||
    referral.category ||
    "General Consultation"
  );
}

function matchesStatusTab(referralStatus, tabKey) {
  if (tabKey === "All") return true;
  if (tabKey === "Pending") {
    return referralStatus === "Pending" || referralStatus === "Pending RHU Review";
  }
  if (tabKey === "Received") {
    return referralStatus === "Received" || referralStatus === "Received by RHU";
  }
  if (tabKey === "For Monitoring") {
    return referralStatus === "For Monitoring" || referralStatus === "Under Assessment";
  }
  return referralStatus === tabKey;
}

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */

export default function Referrals() {
  const [referrals, setReferrals] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    status: "All",
    classification: "All",
  });

  /* Load Referrals via Service */
  useEffect(() => {
    async function loadReferrals() {
      const data = await getReferrals();
      setReferrals(data);
    }
    loadReferrals();
  }, []);

  /* Tab Counts */
  const tabCounts = useMemo(() => {
    const baseSearch = referrals.filter((referral) => {
      const matchesSearch =
        !filters.search ||
        referral.patientName
          ?.toLowerCase()
          .includes(filters.search.toLowerCase()) ||
        referral.trackingId
          ?.toLowerCase()
          .includes(filters.search.toLowerCase()) ||
        referral.chiefComplaint
          ?.toLowerCase()
          .includes(filters.search.toLowerCase()) ||
        referral.concern?.toLowerCase().includes(filters.search.toLowerCase());
      const matchesClass =
        filters.classification === "All"
          ? true
          : getReferralClassification(referral) === filters.classification;
      return matchesSearch && matchesClass;
    });

    return REFERRAL_TABS.reduce((acc, tab) => {
      acc[tab.key] =
        tab.key === "All"
          ? baseSearch.length
          : baseSearch.filter((r) => matchesStatusTab(r.status, tab.key))
              .length;
      return acc;
    }, {});
  }, [referrals, filters.search, filters.classification]);

  /* Filtered Referrals */
  const filteredReferrals = useMemo(() => {
    return referrals.filter((referral) => {
      const matchesSearch =
        !filters.search ||
        referral.patientName
          ?.toLowerCase()
          .includes(filters.search.toLowerCase()) ||
        referral.trackingId
          ?.toLowerCase()
          .includes(filters.search.toLowerCase()) ||
        referral.chiefComplaint
          ?.toLowerCase()
          .includes(filters.search.toLowerCase()) ||
        referral.concern?.toLowerCase().includes(filters.search.toLowerCase());

      const matchesStatus =
        filters.status === "All"
          ? true
          : matchesStatusTab(referral.status, filters.status);

      const matchesClass =
        filters.classification === "All"
          ? true
          : getReferralClassification(referral) === filters.classification;

      return matchesSearch && matchesStatus && matchesClass;
    });
  }, [referrals, filters]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleTabChange = (statusKey) => {
    setFilters((prev) => ({ ...prev, status: statusKey }));
  };

  const clearFilters = () => {
    setFilters({ search: "", status: "All", classification: "All" });
  };

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "All" ||
    filters.classification !== "All";

  const activeFilters = [
    filters.search && { key: "search", label: filters.search },
    filters.status !== "All" && { key: "status", label: filters.status },
    filters.classification !== "All" && {
      key: "classification",
      label: filters.classification,
    },
  ].filter(Boolean);

  function removeFilter(key) {
    if (key === "search") handleFilterChange("search", "");
    if (key === "status") handleFilterChange("status", "All");
    if (key === "classification") handleFilterChange("classification", "All");
  }

  return (
    <DashboardLayout role="bhc" title="Referral Coordination Center">
      <div className="mb-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Search Patient / Tracking ID / Chief Complaint
            </label>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
              />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                placeholder="Search patient, tracking ID, or chief complaint..."
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-3 text-[13px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
              />
            </div>
          </div>

          <div className="w-full xl:w-[210px]">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Classification
            </label>
            <select
              value={filters.classification}
              onChange={(e) =>
                handleFilterChange("classification", e.target.value)
              }
              className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
            >
              <option value="All">All Classifications</option>
              <option value="General Consultation">General Consultation</option>
              <option value="Maternal Care">Maternal Care</option>
              <option value="Immunization">Immunization</option>
            </select>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-3">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => removeFilter(filter.key)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
              >
                {filter.label}
                <X size={10} />
              </button>
            ))}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] transition-colors hover:text-[#0B2E59]"
              >
                <RotateCcw size={11} />
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto rounded-lg bg-[#F1F5F9] p-1">
        {REFERRAL_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = filters.status === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-[11.5px] font-medium transition-all ${
                isActive
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Icon size={13} className={isActive ? "text-[#0B2E59]" : ""} />
              {tab.label}
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                  isActive
                    ? "bg-[#0B2E59]/10 text-[#0B2E59]"
                    : "bg-slate-200/70 text-slate-500"
                }`}
              >
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
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
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-semibold text-[#0B2E59]">
                        {referral.trackingId}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-slate-800">
                            {referral.patientName || referral.patient}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {referral.ageSex}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <ClassificationBadge
                        classification={getReferralClassification(referral)}
                      />
                    </td>

                    <td className="px-4 py-4">
                      <StatusBadge status={referral.status} />
                    </td>

                    <td className="px-4 py-4 text-[12px] text-slate-500">
                      {new Date(referral.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-4 text-right">
                      <ActionMenu
                        title={referral.patientName || referral.patient}
                        subtitle={referral.trackingId}
                        viewLink={`/bhc/referrals/${referral.trackingId || referral.id}`}
                        viewLabel="View Referral"
                        editLink={`/bhc/referrals/${referral.id}/print`}
                        editLabel="Print Referral Slip"
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-24 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
                      <ClipboardList size={20} className="text-[#94A3B8]" />
                    </div>
                    <p className="text-[13px] font-semibold text-[#334155]">
                      No referrals found
                    </p>
                    <p className="mt-1 max-w-sm mx-auto text-[11.5px] text-[#94A3B8]">
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

function StatusBadge({ status }) {
  const map = {
    "Pending RHU Review": "bg-slate-100 text-slate-700",
    Pending: "bg-slate-100 text-slate-700",
    "For Monitoring": "bg-amber-50 text-amber-700",
    Received: "bg-blue-50 text-blue-700",
    "Received by RHU": "bg-blue-50 text-blue-700",
    "Under Assessment": "bg-amber-50 text-amber-700",
    Completed: "bg-emerald-50 text-emerald-700",
    "No-Show": "bg-red-50 text-red-700",
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
    "General Consultation": "bg-blue-50 text-blue-700",
    "Maternal Care": "bg-pink-50 text-pink-700",
    Immunization: "bg-emerald-50 text-emerald-700",
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
