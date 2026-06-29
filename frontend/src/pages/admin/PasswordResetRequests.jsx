import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  KeyRound,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  ListToolbar,
  SoftLoadingArea,
} from "../../components/common";
import {
  approvePasswordResetRequest,
  getPasswordResetRequests,
  PASSWORD_RESET_REQUESTS_UPDATED_EVENT,
  rejectPasswordResetRequest,
} from "../../services/passwordResetService";
import { formatDisplayValue } from "../../utils/formatters";

const DEFAULT_FILTERS = {
  search: "",
  status: "all",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
];

export default function PasswordResetRequests() {
  const [requests, setRequests] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadRequests = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const nextRequests = await getPasswordResetRequests({
        search: filters.search,
        status: filters.status,
        perPage: 50,
      });
      setRequests(nextRequests);
    } catch (error) {
      setError(error.message || "Unable to load password reset requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters.search, filters.status]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    function handleUpdated() {
      void loadRequests({ silent: true });
    }

    window.addEventListener(PASSWORD_RESET_REQUESTS_UPDATED_EVENT, handleUpdated);
    return () =>
      window.removeEventListener(
        PASSWORD_RESET_REQUESTS_UPDATED_EVENT,
        handleUpdated,
      );
  }, [loadRequests]);

  const activeFilters = [
    filters.status !== "all" && {
      key: "status",
      label:
        STATUS_OPTIONS.find((option) => option.value === filters.status)
          ?.label || filters.status,
    },
  ].filter(Boolean);

  const dropdownFilters = [
    {
      key: "status",
      label: "Status",
      value: filters.status,
      options: STATUS_OPTIONS,
    },
  ];

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "Pending").length,
    [requests],
  );

  function updateFilters(nextFilters) {
    setFilters((prev) => ({ ...prev, ...nextFilters }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function removeFilter(key) {
    setFilters((prev) => ({
      ...prev,
      [key]: key === "status" ? "all" : "",
    }));
  }

  async function handleConfirmedAction() {
    if (!confirmAction?.request) return;

    setActionLoading(true);
    try {
      if (confirmAction.type === "approve") {
        await approvePasswordResetRequest(confirmAction.request.id);
      } else {
        await rejectPasswordResetRequest(confirmAction.request.id);
      }
      setConfirmAction(null);
      await loadRequests({ silent: true });
    } catch (error) {
      setError(error.message || "Unable to update this password reset request.");
    } finally {
      setActionLoading(false);
    }
  }

  const showLoadingOverlay = loading || refreshing;

  return (
    <DashboardLayout role="admin" title="Password Reset Requests">
      <SoftLoadingArea
        isLoading={showLoadingOverlay}
        message={loading ? "Loading requests..." : "Refreshing requests..."}
      >
        <ListToolbar
          searchValue={filters.search}
          onSearchChange={(value) => updateFilters({ search: value })}
          searchPlaceholder="Search by user, email, role, or facility..."
          filters={dropdownFilters}
          activeFilterCount={filters.status === "all" ? 0 : 1}
          activeFilters={activeFilters}
          onApplyFilters={updateFilters}
          onClearFilters={clearFilters}
          onRemoveFilter={removeFilter}
          disabled={showLoadingOverlay}
        />

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Pending Review" value={pendingCount} />
          <SummaryCard label="Visible Requests" value={requests.length} />
          <SummaryCard label="Security" value="Admin approval required" text />
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Password Reset Queue
              </h2>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Review requests and send secure one-time reset links.
              </p>
            </div>
            <ShieldCheck size={18} className="text-[#B91C1C]" />
          </div>

          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-[#B91C1C]">
              {error}
            </div>
          )}

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Facility</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {requests.length === 0 ? (
                  <EmptyRow />
                ) : (
                  requests.map((request) => (
                    <tr key={request.id} className="hover:bg-[#FAFBFD]">
                      <td className="px-4 py-3.5 font-semibold text-[#111827]">
                        {request.userName}
                      </td>
                      <td className="px-4 py-3.5 text-[#64748B]">
                        {request.email}
                      </td>
                      <td className="px-4 py-3.5">
                        {formatRole(request.role)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3.5 text-[#64748B]">
                        {request.facility}
                      </td>
                      <td className="px-4 py-3.5 text-[#64748B]">
                        {formatDateTime(request.requestedAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <ResetStatusBadge status={request.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <RequestActions
                          request={request}
                          onView={() => setSelectedRequest(request)}
                          onApprove={() =>
                            setConfirmAction({ type: "approve", request })
                          }
                          onReject={() =>
                            setConfirmAction({ type: "reject", request })
                          }
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#F3F4F6] md:hidden">
            {requests.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Search size={22} className="mx-auto mb-2 text-[#CBD5E1]" />
                <p className="text-sm font-semibold text-[#64748B]">
                  No password reset requests found.
                </p>
              </div>
            ) : (
              requests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onView={() => setSelectedRequest(request)}
                  onApprove={() =>
                    setConfirmAction({ type: "approve", request })
                  }
                  onReject={() =>
                    setConfirmAction({ type: "reject", request })
                  }
                />
              ))
            )}
          </div>
        </div>
      </SoftLoadingArea>

      {selectedRequest && (
        <DetailsModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
        />
      )}

      <ConfirmationModal
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === "approve"
            ? "Approve password reset?"
            : "Reject password reset?"
        }
        description={
          confirmAction?.type === "approve"
            ? "This will send a secure one-time reset link to the user's email."
            : "This request will be marked as rejected."
        }
        confirmText={
          confirmAction?.type === "approve"
            ? "Approve and send link"
            : "Reject request"
        }
        cancelText="Cancel"
        loading={actionLoading}
        loadingText="Saving..."
        onCancel={() => !actionLoading && setConfirmAction(null)}
        onConfirm={handleConfirmedAction}
      />
    </DashboardLayout>
  );
}

function SummaryCard({ label, value, text = false }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
        {label}
      </p>
      <p
        className={`mt-1 font-bold text-[#0F172A] ${
          text ? "text-sm" : "text-xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={7} className="px-6 py-16 text-center">
        <Search size={22} className="mx-auto mb-2 text-[#CBD5E1]" />
        <p className="text-sm font-semibold text-[#64748B]">
          No password reset requests found.
        </p>
      </td>
    </tr>
  );
}

function RequestCard({ request, onView, onApprove, onReject }) {
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#0F172A]">
            {request.userName}
          </p>
          <p className="mt-0.5 truncate text-xs text-[#64748B]">
            {request.email}
          </p>
        </div>
        <ResetStatusBadge status={request.status} />
      </div>
      <div className="grid gap-2 text-xs text-[#64748B]">
        <span>{formatRole(request.role)}</span>
        <span className="truncate">{request.facility}</span>
        <span>{formatDateTime(request.requestedAt)}</span>
      </div>
      <RequestActions
        request={request}
        onView={onView}
        onApprove={onApprove}
        onReject={onReject}
        mobile
      />
    </div>
  );
}

function RequestActions({ request, onView, onApprove, onReject, mobile = false }) {
  const canDecide = request.status === "Pending";
  const buttonClass = mobile
    ? "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold"
    : "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold";

  return (
    <div className={`flex items-center gap-2 ${mobile ? "" : "justify-end"}`}>
      <button
        type="button"
        onClick={onView}
        className={`${buttonClass} border-[#E5E7EB] bg-white text-[#64748B] hover:bg-[#F8FAFC]`}
      >
        <Eye size={13} />
        View details
      </button>
      {canDecide && (
        <>
          <button
            type="button"
            onClick={onApprove}
            className={`${buttonClass} border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70`}
          >
            <CheckCircle2 size={13} />
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            className={`${buttonClass} border-red-100 bg-red-50 text-[#B91C1C] hover:bg-red-100/70`}
          >
            <XCircle size={13} />
            Reject
          </button>
        </>
      )}
    </div>
  );
}

function ResetStatusBadge({ status }) {
  const map = {
    Pending: "border-amber-200 bg-amber-50 text-amber-700",
    Approved: "border-blue-200 bg-blue-50 text-blue-700",
    Rejected: "border-red-100 bg-red-50 text-[#B91C1C]",
    Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Expired: "border-slate-200 bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
        map[status] || map.Pending
      }`}
    >
      {status}
    </span>
  );
}

function DetailsModal({ request, onClose }) {
  const details = [
    ["User", request.userName],
    ["Email", request.email],
    ["Role", formatRole(request.role)],
    ["Facility", request.facility],
    ["Requested", formatDateTime(request.requestedAt)],
    ["Approved", formatDateTime(request.approvedAt)],
    ["Rejected", formatDateTime(request.rejectedAt)],
    ["Completed", formatDateTime(request.completedAt)],
    ["Expires", formatDateTime(request.expiresAt)],
    ["Admin Note", request.adminNote],
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#F1F5F9] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-[#B91C1C]" />
              <h2 className="text-base font-bold text-[#0F172A]">
                Password Reset Request
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#64748B]">
              Request #{request.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#64748B]"
            aria-label="Close details"
          >
            <XCircle size={18} />
          </button>
        </div>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[#F1F5F9] bg-[#FAFBFC] px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                {label}
              </p>
              <p className="mt-1 break-words text-sm font-semibold text-[#0F172A]">
                {formatDisplayValue(value, "Not recorded")}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRole(role = "") {
  const value = String(role || "").toLowerCase();
  if (value === "bhw") return "BHC Worker";
  if (value === "rhu_staff") return "RHU Staff";
  if (value === "admin") return "Admin / MHO";
  return formatDisplayValue(role, "Not recorded");
}
