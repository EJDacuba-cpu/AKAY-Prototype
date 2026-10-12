import { useRef, useState } from "react";
import { ButtonSpinner, ModalButton } from "../../common";
import Input from "../../common/atoms/Input";
import Field from "../access/FieldError";
import { apiRequest } from "../../../services/apiClient";
import { isValidEmail } from "../../../utils/accountForm";
import { fieldState } from "../../../utils/fieldState";

const EMAIL_TAKEN = "Email is already taken.";

/**
 * Edit email of an open invite, inline in Account details: live format check, then the availability check on blur.
 * `onSave(email)` resolves when saved and throws to show the server's message under the field.
 */
export default function InlineEmailEdit({ row, onCancel, onSave }) {
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
    <form onSubmit={handleSubmit} noValidate className="mt-2">
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
      <p className="mb-2 text-xs leading-5 text-slate-500">
        A new invite is sent to this address. The old link stops working.
      </p>
      <div className="flex justify-end gap-2">
        <ModalButton onClick={onCancel} disabled={saving}>Cancel</ModalButton>
        <ModalButton type="submit" variant="primary" disabled={saving || unchanged}>
          {saving && <ButtonSpinner />}
          {saving ? "Saving..." : "Save and resend"}
        </ModalButton>
      </div>
    </form>
  );
}
