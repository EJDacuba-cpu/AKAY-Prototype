import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ModalButton, ModalShell } from "../../common";
import Input from "../../common/atoms/Input";
import Field from "../access/FieldError";
import useEmailAvailability from "../../../hooks/useEmailAvailability";
import { getAdminAccount, updateAdminAccountProfile } from "../../../services/adminAccountsService";
import { profileChanges, validateAccountProfile } from "../../../utils/accountForm";
import { fieldState } from "../../../utils/fieldState";
import { queryKeys } from "../../../utils/queryKeys";

const EMAIL_TAKEN = "Email is already taken.";
const FORM_ID = "edit-account-form";

/**
 * Users ⋯ > Edit: three text boxes (name, email, contact number) saved with PATCH /users/{id}. Role, facility and
 * status change access or routing, so they are not editable here. `account` is the row from the Users table.
 */
export default function EditAccountModal({ accountId, account, onClose }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.adminAccount(accountId),
    queryFn: () => getAdminAccount(accountId),
    placeholderData: account,
    retry: false,
  });
  const current = data || account;

  const [form, setForm] = useState(() => ({
    name: account.name || "",
    email: account.email || "",
    contact_number: account.contact_number || "",
  }));
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState("");
  const emailCheck = useEmailAvailability({ ignoreId: accountId });

  const validation = validateAccountProfile(form, current);
  const emailTaken = emailCheck.isTaken(form.email);
  // A server message wins until the field is edited again; a cleared server entry must not hide a local error.
  const errors = {
    name: serverErrors.name || validation.name,
    email: serverErrors.email || validation.email || (emailTaken ? EMAIL_TAKEN : undefined),
    contact_number: serverErrors.contact_number || validation.contact_number,
  };
  const changes = profileChanges(current, form);
  const canSave = Object.keys(changes).length > 0 && !saving && !(changes.email && emailTaken);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setServerErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function touch(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  async function save(event) {
    event.preventDefault();
    setTouched({ name: true, email: true, contact_number: true });
    if (Object.keys(validateAccountProfile(form, current)).length || !canSave) return;

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
      onClose();
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

  return (
    <ModalShell
      title="Edit account"
      subtitle={current.email || "No email"}
      size="md"
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={saving}>Cancel</ModalButton>
          <ModalButton type="submit" form={FORM_ID} variant="primary" disabled={!canSave}>
            {saving ? "Saving..." : "Save"}
          </ModalButton>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={save} noValidate>
        <Field label="Name" error={touched.name ? errors.name : ""}>
          <Input value={form.name} onChange={(event) => setField("name", event.target.value)} onBlur={() => touch("name")} />
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
              touch("email");
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
            onBlur={() => touch("contact_number")}
          />
        </Field>
        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
      </form>
    </ModalShell>
  );
}
