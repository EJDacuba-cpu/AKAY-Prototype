import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { ModalButton, ModalShell } from "../../common";
import Input from "../../common/atoms/Input";
import Field from "../access/FieldError";
import AccountStatusBadge from "./AccountStatusBadge";
import useEmailAvailability from "../../../hooks/useEmailAvailability";
import { getAdminAccount, updateAdminAccountProfile } from "../../../services/adminAccountsService";
import { profileChanges, validateAccountProfile } from "../../../utils/accountForm";
import { roleLabel } from "../../../utils/accountSetup";
import { formatUserName } from "../../../utils/formatters";
import { fieldState } from "../../../utils/fieldState";
import { queryKeys } from "../../../utils/queryKeys";

/**
 * One account's details, opened from Users. Name, email and contact number can be corrected with the pencil;
 * role, facility and status change access or routing, so they are read-only here.
 * `account` (optional) is shown while the full record loads; `onChanged` runs after any successful save.
 */
export default function AccountDetailsModal({ accountId, account, rolesData, onClose, onChanged }) {
  const queryClient = useQueryClient();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: queryKeys.adminAccount(accountId),
    queryFn: () => getAdminAccount(accountId),
    placeholderData: account,
    retry: false,
  });
  const current = data || account;

  const [form, setForm] = useState(null);
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState("");
  const emailCheck = useEmailAvailability({ ignoreId: accountId });

  const editing = form !== null;
  const validation = form ? validateAccountProfile(form) : {};
  // A server message wins until the field is edited again; an edited field's cleared entry must not hide a local error.
  const emailTaken = form ? emailCheck.isTaken(form.email) : false;
  const errors = {
    name: serverErrors.name || validation.name,
    email: serverErrors.email || validation.email || (emailTaken ? EMAIL_TAKEN : undefined),
    contact_number: serverErrors.contact_number || validation.contact_number,
  };
  const changes = form && current ? profileChanges(current, form) : {};
  const canSave = Object.keys(changes).length > 0 && !saving && !(changes.email && emailTaken);

  function startEdit() {
    setForm({ name: current.name || "", email: current.email || "", contact_number: current.contact_number || "" });
    setTouched({});
    setServerErrors({});
    setFormError("");
  }

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setServerErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function save(event) {
    event.preventDefault();
    setTouched({ name: true, email: true, contact_number: true });
    if (Object.keys(validateAccountProfile(form)).length || !canSave) return;

    setSaving(true);
    setFormError("");
    try {
      if (changes.email && (await emailCheck.check(changes.email))) {
        setServerErrors({ email: EMAIL_TAKEN });
        return;
      }
      const updated = await updateAdminAccountProfile(accountId, changes);
      queryClient.setQueryData(queryKeys.adminAccount(accountId), updated);
      queryClient.setQueryData(queryKeys.adminAccounts(), (list) =>
        Array.isArray(list) ? list.map((item) => (item.id === updated.id ? updated : item)) : list,
      );
      onChanged?.();
      setForm(null);
    } catch (failure) {
      const fieldErrors = {
        name: failure.errors?.name?.[0],
        email: failure.errors?.email?.[0],
        contact_number: failure.errors?.contact_number?.[0],
      };
      setServerErrors(fieldErrors);
      setTouched({ name: true, email: true, contact_number: true });
      if (!fieldErrors.name && !fieldErrors.email && !fieldErrors.contact_number) {
        setFormError(failure.message || "The changes could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  const isAdmin = current?.backendRole === "admin";

  return (
    <ModalShell
      title="Account details"
      subtitle={current?.email || "No email"}
      size="md"
      onClose={onClose}
      closeDisabled={saving}
      footer={<ModalButton variant="secondary" onClick={onClose} disabled={saving}>Close</ModalButton>}
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
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account</h3>
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                aria-label="Edit name, email and contact number"
                title="Edit name, email and contact number"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>

          {editing && (
            <form onSubmit={save} noValidate className="mt-2">
              <Field label="Name" error={touched.name ? errors.name : ""}>
                <Input
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                />
              </Field>
              <Field
                label="Email"
                error={touched.email ? errors.email : ""}
                state={touched.email ? fieldState({ touched: true, error: errors.email, checking: emailCheck.checking, confirmed: emailCheck.isFree(form.email) }) : undefined}
              >
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setField("email", event.target.value)}
                  onBlur={() => {
                    setTouched((prev) => ({ ...prev, email: true }));
                    emailCheck.onBlur(form.email);
                  }}
                />
              </Field>
              <p className="mb-3 text-xs leading-5 text-slate-500">
                If this account&apos;s invite is still open, a new invite is sent to the new address and the old link stops working.
              </p>
              <Field label="Contact number" error={touched.contact_number ? errors.contact_number : ""}>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={form.contact_number}
                  onChange={(event) => setField("contact_number", event.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, contact_number: true }))}
                />
              </Field>
              {formError && <p role="alert" className="mb-2 text-xs text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2">
                <ModalButton onClick={() => setForm(null)} disabled={saving}>Cancel</ModalButton>
                <ModalButton type="submit" variant="primary" disabled={!canSave}>
                  {saving ? "Saving..." : "Save"}
                </ModalButton>
              </div>
            </form>
          )}

          <dl className="divide-y divide-slate-100">
            {!editing && <Row label="Name">{formatUserName(current, "User Account")}</Row>}
            {!editing && <Row label="Email">{current.email || "Not recorded"}</Row>}
            {!editing && <Row label="Contact number">{current.contact_number || "Not recorded"}</Row>}
            <Row label="Role">{roleLabel(current, rolesData)}</Row>
            <Row label="Facility">{current.facility || "-"}</Row>
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

const EMAIL_TAKEN = "Email is already taken.";

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
  const today = new Date().toLocaleDateString("en-CA");
  const active = (user.facility_assignments || []).filter(
    (a) => !a.revoked_at && a.starts_on && a.starts_on.slice(0, 10) <= today && (!a.ends_on || a.ends_on.slice(0, 10) >= today),
  );
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
