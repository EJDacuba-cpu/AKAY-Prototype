import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { ActionMenu, ListToolbar } from "../../components/common";
import TableSkeleton from "../../components/common/loading/TableSkeleton";
import { getReferrals } from "../../services/referrals";
import {
  formatDisplayValue,
  formatFacilityName,
  formatPatientName,
} from "../../utils/formatters";

const DEFAULT_FILTERS = {
  search: "",
  status: "All",
  classification: "All",
  urgency: "All Urgency",
  dateSubmitted: "",
};

function getReferralClassification(referral) {
  return formatDisplayValue(
    referral.classification || referral.referralCategory || referral.category,
    "General Consultation",
  );
}

function getReferralUrgency(referral) {
  const raw =
    referral.urgency ||
    referral.priorityLevel ||
    referral.priority ||
    "Non-Urgent";

  const mapLegacyToNew = {
    High: "Emergency",
    Medium: "Urgent",
    Normal: "Non-Urgent",
  };

  return formatDisplayValue(mapLegacyToNew[raw] || raw, "Non-Urgent");
}

function getReferralPatientName(referral) {
  return formatPatientName(
    referral.patientName || referral.patient || referral,
    "Unknown Patient",
  );
}

function getReferralDestination(referral) {
  return formatFacilityName(
    referral.receivingFacility ||
      referral.destinationFacility ||
      referral.rural_health_unit ||
      referral.ruralHealthUnit,
    "Unassigned RHU",
  );
}

function matchesReferralStatus(referralStatus, selectedStatus) {
  if (selectedStatus === "All") return true;
  if (selectedStatus === "Pending") {
    return (
      referralStatus === "Pending" || referralStatus === "Pending RHU Review"
    );
  }
  if (selectedStatus === "Received") {
    return (
      referralStatus === "Received" || referralStatus === "Received by RHU"
    );
  }
  if (selectedStatus === "For Monitoring") {
    return (
      referralStatus === "For Monitoring" ||
      referralStatus === "Under Assessment"
    );
  }

  return referralStatus === selectedStatus;
}

function getDateValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getSubmittedDate(referral) {
  return getDateValue(
    referral.createdAt ||
      referral.dateSubmitted ||
      referral.dateOfReferral ||
      referral.referralDate,
  );
}

export default function Referrals() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    async function loadReferrals() {
      try {
        setLoading(true);
        const data = await getReferrals();
        setReferrals(data);
      } finally {
        setLoading(false);
      }
    }
    loadReferrals();
  }, []);

  const classificationOptions = useMemo(
    () => [
      "All",
      ...new Set(referrals.map(getReferralClassification).filter(Boolean)),
    ],
    [referrals],
  );

  const filteredReferrals = useMemo(() => {
    return referrals.filter((referral) => {
      const searchTerm = filters.search.toLowerCase();
      const patientName = getReferralPatientName(referral).toLowerCase();
      const matchesSearch =
        !filters.search ||
        patientName.includes(searchTerm) ||
        referral.trackingId?.toLowerCase().includes(searchTerm) ||
        referral.chiefComplaint?.toLowerCase().includes(searchTerm) ||
        referral.concern?.toLowerCase().includes(searchTerm);

      const matchesStatus = matchesReferralStatus(
        referral.status,
        filters.status,
      );
      const matchesClass =
        filters.classification === "All" ||
        getReferralClassification(referral) === filters.classification;
      const matchesUrgency =
        filters.urgency === "All Urgency" ||
        getReferralUrgency(referral) === filters.urgency;
      const matchesDate =
        !filters.dateSubmitted ||
        getSubmittedDate(referral) === filters.dateSubmitted;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesClass &&
        matchesUrgency &&
        matchesDate
      );
    });
  }, [referrals, filters]);

  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
    filters.status !== "All" && { key: "status", label: filters.status },
    filters.classification !== "All" && {
      key: "classification",
      label: filters.classification,
    },
    filters.urgency !== "All Urgency" && {
      key: "urgency",
      label: filters.urgency,
    },
    filters.dateSubmitted && {
      key: "dateSubmitted",
      label: filters.dateSubmitted,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  const dropdownFilters = [
    {
      key: "status",
      label: "Status",
      value: filters.status,
      options: [
        "All",
        "Pending",
        "Received",
        "For Monitoring",
        "Completed",
        "No-Show",
      ],
    },
    {
      key: "classification",
      label: "Classification",
      value: filters.classification,
      options: classificationOptions,
    },
    {
      key: "urgency",
      label: "Urgency",
      value: filters.urgency,
      options: ["All Urgency", "Non-Urgent", "Urgent", "Emergency"],
    },
    {
      key: "dateSubmitted",
      label: "Date Submitted",
      value: filters.dateSubmitted,
      type: "date",
    },
  ];

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    const resetValues = {
      search: "",
      status: "All",
      classification: "All",
      urgency: "All Urgency",
      dateSubmitted: "",
    };
    setFilters((prev) => ({ ...prev, [key]: resetValues[key] }));
  }

  return (
    <DashboardLayout role="bhc" title="Referral Coordination Center">
      <ListToolbar
        searchValue={filters.search}
        onSearchChange={(value) => updateFilter("search", value)}
        searchPlaceholder="Search by patient name, referral ID, or chief complaint..."
        filters={dropdownFilters}
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilters}
        onApplyFilters={(nextFilters) =>
          setFilters((prev) => ({ ...prev, ...nextFilters }))
        }
        onClearFilters={clearFilters}
        onRemoveFilter={removeFilter}
      />

      {loading ? (
        <TableSkeleton columns={8} rows={8} label="Loading referrals..." />
      ) : (
      <div className="min-w-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#F3F4F6] px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Referral Tracking
            </h2>
            <p className="text-[11px] text-slate-400">
              {filteredReferrals.length} referral record
              {filteredReferrals.length === 1 ? "" : "s"} shown
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3">Tracking ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Referred To</th>
                <th className="px-4 py-3">Classification</th>
                <th className="px-4 py-3">Urgency</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F8FAFC]">
              {filteredReferrals.length > 0 ? (
                filteredReferrals.map((referral) => {
                  const patientName = getReferralPatientName(referral);
                  const destinationFacility = getReferralDestination(referral);

                  return (
                  <tr
                    key={referral.trackingId || referral.id}
                    className="group transition-colors duration-150 hover:bg-slate-50/80"
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-semibold text-[#0F172A]">
                        {referral.trackingId}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-slate-800">
                          {patientName}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {referral.ageSex}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-[12px] text-slate-600">
                      {destinationFacility}
                    </td>

                    <td className="px-4 py-4">
                      <ClassificationBadge
                        classification={getReferralClassification(referral)}
                      />
                    </td>

                    <td className="px-4 py-4">
                      <UrgencyBadge urgency={getReferralUrgency(referral)} />
                    </td>

                    <td className="px-4 py-4 text-[12px] text-slate-500">
                      {getSubmittedDate(referral) || "—"}
                    </td>

                    <td className="px-4 py-4">
                      <StatusBadge status={referral.status} />
                    </td>

                    <td className="px-4 py-4 text-right">
                      <ActionMenu
                        title={patientName}
                        subtitle={referral.trackingId}
                        viewLink={`/bhc/referrals/${
                          referral.trackingId || referral.id
                        }`}
                        viewLabel="View Referral"
                        editLink={`/bhc/referrals/${
                          referral.trackingId || referral.id
                        }/print-slip`}
                        editLabel="Print Referral Slip"
                      />
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-24 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
                      <ClipboardList size={20} className="text-[#94A3B8]" />
                    </div>
                    <p className="text-[13px] font-semibold text-[#334155]">
                      No referrals found
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-[11.5px] text-[#94A3B8]">
                      Referrals generated from consultation assessments will
                      appear here after submission to RHU.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </DashboardLayout>
  );
}

function StatusBadge({ status }) {
  const map = {
    "Pending RHU Review": "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Pending: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    "For Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Received: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "Received by RHU": "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "Under Assessment": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Completed: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "No-Show": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  };

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
        map[status] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {status}
    </span>
  );
}

function ClassificationBadge({ classification }) {
  const map = {
    "General Consultation": "bg-slate-100 text-slate-700",
    "Maternal Care": "bg-pink-50 text-pink-700",
    Maternal: "bg-pink-50 text-pink-700",
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

function UrgencyBadge({ urgency }) {
  const map = {
    Emergency: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
    Urgent: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "Non-Urgent": "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
  };

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
        map[urgency] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {urgency}
    </span>
  );
}
