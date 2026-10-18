import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ModalButton, ModalShell } from "../../common";
import AccountStatusBadge from "./AccountStatusBadge";
import { getAdminAccount } from "../../../services/adminAccountsService";
import {
  accountTypeLabel,
  activeFacilityAssignments,
  homeFacilityLabel,
  roleLabel,
} from "../../../utils/accountSetup";
import { formatUserName } from "../../../utils/formatters";
import { queryKeys } from "../../../utils/queryKeys";

/**
 * One account's details, opened from Users ⋯ > View details. Read-only: corrections are made with Users ⋯ > Edit.
 * `account` (optional) is shown while the full record loads.
 */
export default function AccountDetailsModal({ accountId, account, rolesData, onClose }) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: queryKeys.adminAccount(accountId),
    queryFn: () => getAdminAccount(accountId),
    placeholderData: account,
    retry: false,
  });
  const current = data || account;
  const isAdmin = current?.backendRole === "admin";

  return (
    <ModalShell
      title="Account details"
      subtitle={current?.email || "No email"}
      size="md"
      onClose={onClose}
      footer={<ModalButton variant="secondary" onClick={onClose}>Close</ModalButton>}
    >
      {!current && isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading account...</p>}

      {!current && error && (
        <div className="py-6 text-center">
          <p className="text-sm text-red-600">{error.message || "Could not load this account."}</p>
          <button type="button" onClick={() => refetch()} className="mt-2 text-xs font-semibold text-red-700 hover:underline">
            Try again
          </button>
        </div>
      )}

      {current && (
        <>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account</h3>

          <dl className="divide-y divide-slate-100">
            <Row label="Name">{formatUserName(current, "User Account")}</Row>
            <Row label="Email">{current.email || "Not recorded"}</Row>
            <Row label="Contact number">{current.contact_number || "Not recorded"}</Row>
            <Row label="Role">{roleLabel(current, rolesData)}</Row>
            <Row label="Account type">{accountTypeLabel(current) || "Not recorded"}</Row>
            <Row label="Home facility">{homeFacilityLabel(current)}</Row>
            <Row label="Status"><AccountStatusBadge status={current.status} /></Row>
            <Row label="Date created">{formatDateTime(current.created_at)}</Row>
          </dl>

          {!isAdmin && (
            <Link
              to={"/admin/staff-assignments?userId=" + current.id}
              className="mt-3 block text-xs font-medium text-red-700 hover:underline"
            >
              Additional assignments: {assignmentSummary(current)}
            </Link>
          )}
        </>
      )}
    </ModalShell>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/** The nurse's current additional BHC access ("Pitpitan BHC · 1 active"), or "No active assignments". */
function assignmentSummary(user) {
  const active = activeFacilityAssignments(user);
  return active.length
    ? active.map((a) => a.barangay_health_center?.name || "BHC").join(", ") + " · " + active.length + " active"
    : "No active assignments";
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
