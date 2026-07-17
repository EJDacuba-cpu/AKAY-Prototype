import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  QrCode,
  Search,
  AlertCircle,
  Check,
  MoreVertical,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  DataTableEmptyState,
  ListToolbar,
  ModuleTableCard,
  PageStateWrapper,
  TablePagination,
} from "../../components/common";
import {
  getIncomingReferrals,
} from "../../services/referrals";
import {
  formatDisplayValue,
  formatFacilityName,
  formatPatientName,
  formatReferralStatus,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes statusPop {
    0%   { transform: scale(0.85); opacity: 0; }
    60%  { transform: scale(1.05); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes menuOpen {
    from { opacity: 0; transform: scale(0.96) translateY(-4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes menuClose {
    from { opacity: 1; transform: scale(1) translateY(0); }
    to   { opacity: 0; transform: scale(0.96) translateY(-4px); }
  }

  .anim-fade-up { opacity: 0; animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .anim-fade-in { animation: fadeIn 0.25s ease both; }
  .anim-status-pop { animation: statusPop 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .menu-open { animation: menuOpen 0.2s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .menu-close { animation: menuClose 0.15s cubic-bezier(0.55, 0, 1, 0.45) both; }
`;

const REFERRAL_STATUS_OPTIONS = [
  { key: "All Status", label: "All" },
  { key: "Pending", label: "Pending" },
  { key: "Received", label: "Received" },
  { key: "For Monitoring", label: "Monitoring" },
  { key: "Completed", label: "Done" },
  { key: "No-Show", label: "No-Show" },
];

const DATE_OPTIONS = ["All Dates", "Today", "Yesterday", "Last 7 Days"];
const ITEMS_PER_PAGE = 5;

function ActionMenu({ referral }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const menuItems = [
    {
      key: "view",
      label: "View Details",
      icon: <Eye size={15} />,
      color: "#B91C1C",
    },
    {
      key: "copy",
      label: copied ? "Copied!" : "Copy Tracking ID",
      icon: copied ? <Check size={15} /> : <Copy size={15} />,
      color: copied ? "#059669" : "#374151",
    },
  ];

  function updateMenuPosition() {
    if (!btnRef.current) return;

    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 240;
    const padding = 12;

    let top = rect.bottom + 8;
    let left = rect.right - menuWidth;

    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (top + 200 > window.innerHeight - padding) {
      top = rect.top - 200 - 8;
    }
    if (top < padding) top = padding;

    setPosition({ top, left });
  }

  function handleOpen() {
    setCopied(false);
    updateMenuPosition();
    setOpen(true);
    setClosing(false);
  }

  function handleClose() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  }

  function handleCopyId() {
    navigator.clipboard.writeText(referral.trackingId).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        handleClose();
      }, 900);
    });
  }

  function handleAction(item) {
    if (item.key === "view") {
      handleClose();
      navigate(getReferralDetailsPath(referral));
      return;
    }

    if (item.key === "copy") {
      handleCopyId();
      return;
    }

    handleClose();
  }

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e) {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        handleClose();
      }
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") handleClose();
    }

    function handleWindowChange() {
      handleClose();
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("scroll", handleWindowChange, true);
      window.addEventListener("resize", handleWindowChange);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("resize", handleWindowChange);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open ? handleClose() : handleOpen();
        }}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200 active:scale-[0.97] ${
          open
            ? "border-red-200 bg-red-50 text-[#B91C1C]"
            : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical size={15} />
      </button>

      {(open || closing) &&
        createPortal(
          <div
            ref={menuRef}
            className={`fixed z-[80] w-[240px] origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-black/[0.12] ${
              closing ? "menu-close" : "menu-open"
            }`}
            style={{ top: position.top, left: position.left }}
            role="menu"
          >
            <div className="mb-1.5 border-b border-slate-100 px-2.5 pb-2">
              <p className="font-mono text-[11px] font-semibold text-[#0F172A]">
                {referral.trackingId}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                {getReferralPatientName(referral)} /{" "}
                {formatDisplayValue(referral.ageSex, "Age / Sex not recorded")}
                {/*
                {referral.patientName || referral.patient} · {referral.ageSex}
                */}
              </p>
            </div>

            {menuItems.map((item) => (
              <button
                key={item.key}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(item);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150 hover:bg-slate-50 active:scale-[0.98]"
                role="menuitem"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${item.color}0A`,
                    color: item.color,
                  }}
                >
                  {item.icon}
                </div>

                <span
                  className="flex-1 text-[12px] font-medium"
                  style={{ color: item.color }}
                >
                  {item.label}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function StatusBadge({ status, animate = false }) {
  const displayStatus = formatReferralStatus(formatDisplayValue(status, "Pending"));
  const map = {
    Pending: {
      bg: "#F1F5F9",
      text: "#475569",
      border: "#CBD5E1",
      dot: "#94A3B8",
    },
    Received: {
      bg: "#EFF6FF",
      text: "#1D4ED8",
      border: "#BFDBFE",
      dot: "#3B82F6",
    },
    "For Monitoring": {
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FDE68A",
      dot: "#F59E0B",
    },
    Done: {
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
      dot: "#10B981",
    },
    "No-Show": {
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FDE68A",
      dot: "#F59E0B",
    },
  };

  const s = map[displayStatus] || map.Pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        animate ? "anim-status-pop" : ""
      }`}
      style={{ backgroundColor: s.bg, borderColor: s.border, color: s.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {displayStatus}
    </span>
  );
}

function UrgencyBadge({ urgency }) {
  const displayUrgency = formatDisplayValue(urgency, "Non-Urgent");
  const map = {
    Emergency: {
      bg: "#FEF2F2",
      text: "#B91C1C",
      icon: <AlertCircle size={11} />,
    },
    Urgent: {
      bg: "#FFFBEB",
      text: "#B45309",
      icon: <Clock size={11} />,
    },
    "Non-Urgent": {
      bg: "#F8FAFC",
      text: "#475569",
      icon: <CheckCircle2 size={11} />,
    },
    High: {
      bg: "#FEF2F2",
      text: "#B91C1C",
      icon: <AlertCircle size={11} />,
    },
    Medium: {
      bg: "#FFFBEB",
      text: "#B45309",
      icon: <Clock size={11} />,
    },
    Normal: {
      bg: "#F8FAFC",
      text: "#475569",
      icon: <CheckCircle2 size={11} />,
    },
  };

  const s = map[displayUrgency] || map["Non-Urgent"];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-slate-100 px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.icon}
      {displayUrgency}
    </span>
  );
}

function getReferralUrgency(referral) {
  const raw =
    referral?.urgency ||
    referral?.priorityLevel ||
    referral?.priority ||
    "Non-Urgent";

  const mapLegacyToNew = {
    High: "Emergency",
    Medium: "Urgent",
    Normal: "Non-Urgent",
  };

  return formatDisplayValue(mapLegacyToNew[raw] || raw, "Non-Urgent");
}

function getReferralCategory(referral) {
  return formatDisplayValue(
    referral?.referralCategory || referral?.category || referral?.classification,
    "Uncategorized",
  );
}

function getReferralPatientName(referral) {
  return formatPatientName(
    referral?.patientName || referral?.patient || referral,
    "Unknown Patient",
  );
}

function isReferralCategory(value) {
  return /^(A1|A2|B1|B2|C1|C2|Unclassified)$/i.test(String(value || ""));
}

function getCategoryColumnLabel(referrals) {
  return referrals.some((referral) =>
    isReferralCategory(getReferralCategory(referral)),
  )
    ? "Referral Category"
    : "Patient Classification";
}

function isRhuFacility(value = "") {
  return /rhu|rural health unit/i.test(String(value));
}

function cleanBarangayName(value = "") {
  return String(value)
    .replace(/^barangay\s+/i, "")
    .trim();
}

function getReferringHci(referral) {
  const candidates = [
    referral?.referringHealthCenter,
    referral?.referringBHC,
    referral?.bhcName,
    referral?.sourceFacility,
    referral?.referringFacility,
    referral?.bhc,
    referral?.referringHci,
    referral?.barangayHealthCenter,
    referral?.barangay_health_center,
  ]
    .map((value) => formatFacilityName(value, ""))
    .filter(Boolean);

  const valid = candidates.find((value) => !isRhuFacility(value));
  if (valid) return valid;

  const barangay =
    referral?.referringBarangay ||
    referral?.patientBarangay ||
    referral?.barangay;

  return barangay
    ? `Barangay ${cleanBarangayName(barangay)} Health Center`
    : "Barangay Health Center";
}

function getReferralDate(referral) {
  return getReferralSubmittedAt(referral);
}

function parseReferralDate(value) {
  if (!value) return null;
  const normalized = String(value).replace("·", " ");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getReferralSubmittedAt(referral = {}) {
  const directDate =
    parseReferralDate(referral.createdAt) ||
    parseReferralDate(referral.submittedAt) ||
    parseReferralDate(referral.dateSubmitted);

  if (directDate) return directDate;

  if (referral.dateOfReferral) {
    return (
      parseReferralDate(
        referral.timeOfReferral
          ? `${referral.dateOfReferral}T${referral.timeOfReferral}`
          : referral.dateOfReferral,
      ) ||
      parseReferralDate(
        [referral.dateOfReferral, referral.timeOfReferral]
          .filter(Boolean)
          .join(" "),
      )
    );
  }

  return null;
}

function getReferralSubmittedTime(referral) {
  const date = getReferralSubmittedAt(referral);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

function compareReferralQueueOrder(a, b) {
  const timeDiff = getReferralSubmittedTime(a) - getReferralSubmittedTime(b);
  if (timeDiff !== 0) return timeDiff;

  return String(a.trackingId || a.id || "").localeCompare(
    String(b.trackingId || b.id || ""),
  );
}

function getReferralRouteTarget(referral = {}) {
  return String(referral.id || referral.trackingId || "").trim();
}

function getReferralDetailsPath(referral = {}) {
  const target = getReferralRouteTarget(referral);
  return `/rhu/referrals/${encodeURIComponent(target)}`;
}

function formatReferralSubmittedAt(referral) {
  const date = getReferralSubmittedAt(referral);
  if (!date) return "No date recorded";

  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  })} · ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function matchesDateFilter(referral, filter) {
  if (filter === "All Dates") return true;

  const date = getReferralDate(referral);
  if (!date) return false;

  const today = new Date();
  if (filter === "Today") return isSameDay(date, today);

  if (filter === "Yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return isSameDay(date, yesterday);
  }

  if (filter === "Last 7 Days") {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return date >= start && date <= today;
  }

  return true;
}

function CategoryBadge({ category }) {
  const displayCategory = formatDisplayValue(category, "Uncategorized");

  return (
    <span className="inline-flex items-center rounded-md border border-red-100 bg-red-50/70 px-2 py-0.5 font-mono text-[10px] font-bold text-[#B91C1C]">
      {displayCategory}
    </span>
  );
}

export default function IncomingReferrals() {
  const navigate = useNavigate();
  const [animatedIds] = useState(new Set());

  const [filters, setFilters] = useState({
    search: "",
    status: "All Status",
    category: "All Categories",
    urgency: "All Urgency",
    date: "All Dates",
    referringBhc: "All Referring BHCs",
  });
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data: referralsData = [],
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.incomingReferrals("rhu"),
    queryFn: () => getIncomingReferrals(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const referrals = useMemo(
    () => (Array.isArray(referralsData) ? referralsData : []),
    [referralsData],
  );
  const loading = isLoading && referrals.length === 0;
  const isBackgroundRefreshing = isFetching && referrals.length > 0;

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      status: "All Status",
      category: "All Categories",
      urgency: "All Urgency",
      date: "All Dates",
      referringBhc: "All Referring BHCs",
    });
  };

  const activeFilters = [
    filters.status !== "All Status" && {
      key: "status",
      label:
        filters.status === "For Monitoring" ? "Monitoring" : filters.status,
    },
    filters.category !== "All Categories" && {
      key: "category",
      label: filters.category,
    },
    filters.urgency !== "All Urgency" && {
      key: "urgency",
      label: filters.urgency,
    },
    filters.date !== "All Dates" && { key: "date", label: filters.date },
    filters.referringBhc !== "All Referring BHCs" && {
      key: "referringBhc",
      label: filters.referringBhc,
    },
  ].filter(Boolean);

  function removeFilter(key) {
    if (key === "status") handleFilterChange("status", "All Status");
    if (key === "category") handleFilterChange("category", "All Categories");
    if (key === "urgency") handleFilterChange("urgency", "All Urgency");
    if (key === "date") handleFilterChange("date", "All Dates");
    if (key === "referringBhc") {
      handleFilterChange("referringBhc", "All Referring BHCs");
    }
  }

  const categoryOptions = useMemo(() => {
    return [
      "All Categories",
      ...new Set(referrals.map(getReferralCategory).filter(Boolean)),
    ];
  }, [referrals]);

  const referringBhcOptions = useMemo(() => {
    return [
      "All Referring BHCs",
      ...new Set(referrals.map(getReferringHci).filter(Boolean)),
    ];
  }, [referrals]);

  const categoryColumnLabel = useMemo(
    () => getCategoryColumnLabel(referrals),
    [referrals],
  );

  const baseFiltered = useMemo(() => {
    return referrals.filter((referral) => {
      const q = filters.search.toLowerCase();

      const patientName = getReferralPatientName(referral);

      const matchSearch =
        !filters.search ||
        patientName.toLowerCase().includes(q) ||
        (referral.trackingId || "").toLowerCase().includes(q) ||
        (referral.chiefComplaint || referral.concern || "")
          .toLowerCase()
          .includes(q) ||
        getReferringHci(referral).toLowerCase().includes(q);

      const matchCategory =
        filters.category === "All Categories" ||
        getReferralCategory(referral) === filters.category;
      const matchUrgency =
        filters.urgency === "All Urgency" ||
        getReferralUrgency(referral) === filters.urgency;
      const matchDate = matchesDateFilter(referral, filters.date);
      const matchReferringBhc =
        filters.referringBhc === "All Referring BHCs" ||
        getReferringHci(referral) === filters.referringBhc;

      return (
        matchSearch &&
        matchCategory &&
        matchUrgency &&
        matchDate &&
        matchReferringBhc
      );
    });
  }, [referrals, filters]);

  const filtered = useMemo(() => {
    const statusFiltered = baseFiltered.filter(
      (referral) =>
        filters.status === "All Status" || referral.status === filters.status,
    );

    // RHU queue follows first-referred, first-shown ordering based on BHC submission time.
    return statusFiltered.slice().sort(compareReferralQueueOrder);
  }, [baseFiltered, filters.status]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedReferrals = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const toolbarFilters = [
    {
      key: "status",
      label: "Status",
      value: filters.status,
      options: REFERRAL_STATUS_OPTIONS.map((option) => option.key),
    },
    {
      key: "category",
      label: categoryColumnLabel,
      value: filters.category,
      options: categoryOptions,
    },
    {
      key: "urgency",
      label: "Urgency",
      value: filters.urgency,
      options: ["All Urgency", "Non-Urgent", "Urgent", "Emergency"],
    },
    {
      key: "date",
      label: "Date Submitted",
      value: filters.date,
      options: DATE_OPTIONS,
    },
    {
      key: "referringBhc",
      label: "Referring BHC",
      value: filters.referringBhc,
      options: referringBhcOptions,
    },
  ];

  return (
    <DashboardLayout role="rhu" title="Incoming Referrals">
      <style>{keyframes}</style>

      <PageStateWrapper
        isLoading={loading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={referrals.length > 0}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading referrals..."
      >
        <div className="space-y-4">
        {!loading && (
          <ListToolbar
            searchValue={filters.search}
            onSearchChange={(value) => handleFilterChange("search", value)}
            searchPlaceholder="Search by patient name, BHC, referral ID, or chief complaint..."
            filters={toolbarFilters}
            activeFilterCount={activeFilters.length}
            activeFilters={activeFilters}
            onApplyFilters={(nextFilters) =>
              setFilters((prev) => ({ ...prev, ...nextFilters }))
            }
            onClearFilters={clearFilters}
            onRemoveFilter={removeFilter}
            actions={
              <Link
                to="/rhu/qr-scanner"
                className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] active:bg-[#7F1D1D]"
              >
                <QrCode size={14} strokeWidth={2.5} />
                QR Scan
              </Link>
            }
          />
        )}

        {loading ? null : (
        <ModuleTableCard
          title="Referral Tracking"
          count={filtered.length}
          subtitle="BHC-RHU referral records and tracking status."
          minWidth="min-w-[1360px]"
          refreshing={isBackgroundRefreshing}
          refreshingLabel="Updating referrals..."
          footer={
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          }
        >
              <thead>
                <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  <th className="whitespace-nowrap px-4 py-3">Queue No.</th>
                  <th className="whitespace-nowrap px-4 py-3">Tracking ID</th>
                <th className="whitespace-nowrap px-4 py-3">Date / Time</th>
                  <th className="whitespace-nowrap px-4 py-3">Patient</th>
                  <th className="whitespace-nowrap px-4 py-3">Name of Referring HCI</th>
                  <th className="whitespace-nowrap px-4 py-3">{categoryColumnLabel}</th>
                  <th className="whitespace-nowrap px-4 py-3">Urgency</th>
                  <th className="whitespace-nowrap px-4 py-3">Chief Complaint</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F8FAFC]">
                {filtered.length === 0 ? (
                  <DataTableEmptyState
                    colSpan={10}
                    icon={<Search size={20} className="text-[#94A3B8]" />}
                    title="No referrals match your filters"
                    description="Try adjusting your search or filters."
                  />
                ) : (
                  paginatedReferrals.map((referral, index) => {
                    const animated = animatedIds.has(referral.trackingId);
                    const isTerminal = referral.status === "Completed";
                    const patientName = getReferralPatientName(referral);
                    const ageSex = formatDisplayValue(
                      referral.ageSex,
                      "Age / Sex not recorded",
                    );
                    const chiefComplaint = formatDisplayValue(
                      referral.chiefComplaint || referral.concern,
                      "Not recorded",
                    );

                    return (
                      <tr
                        key={getReferralRouteTarget(referral)}
                        onClick={() =>
                          navigate(getReferralDetailsPath(referral))
                        }
                        className={`group cursor-pointer transition-colors duration-150 hover:bg-[#FAFBFD] ${
                          isTerminal ? "bg-slate-50/30" : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span className="text-[12px] font-bold text-slate-500">
                            #{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-1.5 font-mono text-[11px] font-semibold text-[#B91C1C] transition-colors duration-200 group-hover:border-[#FECACA] group-hover:bg-[#FEF2F2]">
                            {referral.trackingId}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#6B7280]">
                          {formatReferralSubmittedAt(referral)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5">
                          <p className="text-[13px] font-semibold text-[#111827]">
                            {patientName}
                          </p>
                          <p className="mt-0.5 text-[10.5px] text-slate-400">
                            {ageSex}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#6B7280]">
                          {getReferringHci(referral)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5">
                          <CategoryBadge
                            category={getReferralCategory(referral)}
                          />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5">
                          <UrgencyBadge
                            urgency={getReferralUrgency(referral)}
                          />
                        </td>

                        <td className="max-w-[180px] truncate px-4 py-3.5 text-[13px] text-[#6B7280]">
                          {chiefComplaint}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5">
                          <StatusBadge
                            status={referral.status}
                            animate={animated}
                          />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end">
                            <ActionMenu referral={referral} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
        </ModuleTableCard>
        )}
        </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}
