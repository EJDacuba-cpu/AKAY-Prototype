import { useMemo, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { ButtonSpinner, ConfirmationModal, ModalButton, ModalShell } from "../../common";
import Input from "../../common/atoms/Input";
import Field from "../access/FieldError";
import useNotification from "../../../hooks/useNotification";
import {
  copyInviteLink,
  getAccountInvites,
  issueTemporaryPassword,
  resendInvite,
  updateInviteEmail,
} from "../../../services/accountInviteService";
import { apiRequest } from "../../../services/apiClient";
import { inviteStatus } from "../../../utils/accessRequestStatus";
import { isValidEmail } from "../../../utils/accountForm";
import { copyText } from "../../../utils/clipboard";
import { fieldState } from "../../../utils/fieldState";
import AccessRequestTable, { accessColumns, accountName, formatDateTime, roleLabel } from "./AccessRequestTable";
import TemporaryPasswordDialog, { ManualCopyDialog } from "./TemporaryPasswordDialog";
import useAccessRows from "./useAccessRows";

const MENU_ACTIONS = ["copy", "editEmail", "temporaryPassword"];
const EMAIL_TAKEN = "Email is already taken.";

/** Invites tab: rows from the account invite API, statuses from `inviteStatus` (spec F2). */
export default function InvitesTab({ rolesData, pendingCount, onChanged }) {
  const notify = useNotification();
  const list = useAccessRows(getAccountInvites, onChanged);
  const [confirmTemp, setConfirmTemp] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);
  const [editing, setEditing] = useState(null);
  const [manualCopy, setManualCopy] = useState(null);
  const columns = useMemo(
    () => accessColumns({ rolesData, dateOf: (row) => row.sent_at }),
    [rolesData],
  );

  function handleAction(action, row) {
    if (list.busyId) return;
    if (action === "resend") void resend(row);
    if (action === "copy") void copy(row);
    if (action === "editEmail") setEditing(row);
    if (action === "temporaryPassword") setConfirmTemp(row);
  }

  async function resend(row) {
    const updated = await list.runAction(row, () => resendInvite(row.id));
    if (updated) announceDelivery(updated);
  }

  function announceDelivery(updated) {
    if (updated.delivery === "failed") notify.error("The email could not be sent. Use Copy link to share it another way.");
    else notify.success(`Invite sent to ${updated.email}.`);
  }

  async function copy(row) {
    const url = await list.runAction(row, () => copyInviteLink(row.id));
    if (!url) return;
    if (await copyText(url)) notify.success("Link copied. The emailed link no longer works.");
    else setManualCopy({ name: accountName(row), url });
  }

  async function issueTemp() {
    const row = confirmTemp;
    const result = await list.runAction(row, () => issueTemporaryPassword(row.id));
    setConfirmTemp(null);
    if (result?.password) setTempPassword({ name: accountName(row), password: result.password });
  }

  /** Saves the new email; the server validates it again and resends the invite. Throws on failure for the form. */
  async function saveEmail(row, email) {
    const updated = await updateInviteEmail(row.id, email);
    setEditing(null);
    announceDelivery(updated);
    list.refresh();
  }

  return (
    <>
      <AccessRequestTable
        rows={list.rows}
        columns={columns}
        statusOf={(row) => inviteStatus(row)}
        onAction={handleAction}
        menuActions={MENU_ACTIONS}
        emptyMessage="No account invites found."
        loading={list.loading}
        error={list.error}
        busyId={list.busyId}
        filters={list.filters}
        onFiltersChange={list.updateFilters}
        searchPlaceholder="Search by account or email..."
        needsAction={pendingCount}
        linkExpiry="48 hours"
        heading="Invites"
        description="New accounts set their own password from a one-time invite link."
        detailTitle="Account invite"
        detailsOf={(row) => [
          ["Account", accountName(row)],
          ["Email", row.email],
          ["Role", roleLabel(rolesData, row.user)],
          ["Facility", row.user?.facility],
          ["Invited", formatDateTime(row.sent_at)],
          ["Link expires", formatDateTime(row.expires_at)],
          ["Temporary password expires", formatDateTime(row.temp_password_expires_at)],
          ["Completed", formatDateTime(row.completed_at)],
        ]}
      />

      <ConfirmationModal
        open={Boolean(confirmTemp)}
        title="Issue temporary password"
        description={`Issue a temporary password for ${accountName(confirmTemp || {})}? Any invite link stops working.`}
        confirmText="Issue temporary password"
        cancelText="Cancel"
        loading={Boolean(list.busyId)}
        loadingText="Issuing..."
        onCancel={() => !list.busyId && setConfirmTemp(null)}
        onConfirm={issueTemp}
      />

      <TemporaryPasswordDialog
        name={tempPassword?.name}
        password={tempPassword?.password}
        onClose={() => setTempPassword(null)}
      />

      <ManualCopyDialog
        name={manualCopy?.name}
        url={manualCopy?.url}
        onClose={() => setManualCopy(null)}
      />

      {editing && (
        <EditEmailDialog
          row={editing}
          onCancel={() => setEditing(null)}
          onSave={(email) => saveEmail(editing, email)}
        />
      )}
    </>
  );
}

/** Edit email of an open invite: live format check, then the Task 1 availability check on blur. */
function EditEmailDialog({ row, onCancel, onSave }) {
  const current = row.email || row.user?.email || "";
  const [email, setEmail] = useState(current);
  const [touched, setTouched] = useState(false);
  const [checking, setChecking] = useState(false);
  const [taken, setTaken] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const checks = useRef(new Map());

  const key = email.trim().toLowerCase();
  const unchanged = key === current.toLowerCase();
  const formatError = isValidEmail(email.trim()) ? "" : "Enter a valid email address.";
  const error = serverError || (touched ? formatError || (taken[key] ? EMAIL_TAKEN : "") : "");
  const state = fieldState({ touched, error, checking, confirmed: taken[key] === false });

  // Asks the server once per address; a failed check is forgotten and retried, and saving validates again.
  function checkEmail(value) {
    const lookup = value.toLowerCase();
    if (!isValidEmail(value)) return Promise.resolve(null);
    if (!checks.current.has(lookup)) {
      const query = new URLSearchParams({ email: value, ...(row.user?.id ? { ignore: row.user.id } : {}) });
      checks.current.set(lookup, apiRequest(`/users/email-available?${query}`)
        .then((result) => !result.available)
        .catch(() => null)
        .then((isTaken) => {
          if (isTaken === null) checks.current.delete(lookup);
          else setTaken((map) => ({ ...map, [lookup]: isTaken }));
          return isTaken;
        }));
    }
    return checks.current.get(lookup);
  }

  function handleBlur() {
    setTouched(true);
    setChecking(true);
    checkEmail(email.trim()).finally(() => setChecking(false));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched(true);
    if (formatError || unchanged || saving) return;
    setSaving(true);
    try {
      if (await checkEmail(email.trim())) return;
      await onSave(email.trim());
    } catch (saveError) {
      setServerError(saveError.errors?.email?.[0] || saveError.message || "The email could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open
      title="Edit email"
      subtitle={accountName(row)}
      icon={<Mail size={14} />}
      size="sm"
      onClose={onCancel}
      closeDisabled={saving}
      dismissOnBackdrop={!saving}
      dismissOnEscape={!saving}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={saving}>
            Cancel
          </ModalButton>
          <ModalButton
            type="submit"
            form="edit-invite-email"
            variant="primary"
            primary
            disabled={saving || unchanged}
          >
            {saving && <ButtonSpinner />}
            {saving ? "Saving..." : "Save and resend"}
          </ModalButton>
        </>
      }
    >
      <form id="edit-invite-email" onSubmit={handleSubmit} noValidate>
        <Field label="Email" error={error} state={state}>
          <Input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setServerError("");
            }}
            onBlur={handleBlur}
          />
        </Field>
        <p className="text-[13px] leading-5 text-slate-600">
          A new invite is sent to this address. The old link stops working.
        </p>
      </form>
    </ModalShell>
  );
}
