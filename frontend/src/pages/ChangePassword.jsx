import { useState } from "react";
import { useNavigate } from "react-router";
import { Check, Circle, KeyRound } from "lucide-react";
import Field from "../components/features/access/FieldError";
import Input from "../components/common/atoms/Input";
import { changePassword } from "../services/apiClient";
import { fieldState } from "../utils/fieldState";
import { meetsPasswordRules, passwordRules } from "../utils/passwordRules";

const LOGO_SRC = "/akay-logo.png";

const firstMessage = (message) => (Array.isArray(message) ? message[0] : message) || "";

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({});
  const [currentError, setCurrentError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rules = passwordRules(password);
  const rulesMet = meetsPasswordRules(password);
  const mismatch = confirmPassword !== "" && confirmPassword !== password;
  const confirmError = touched.confirm && mismatch ? "Passwords do not match." : "";
  const canSubmit = currentPassword !== "" && rulesMet && confirmPassword !== "" && !mismatch;

  const currentState = fieldState({
    touched: touched.current,
    error: currentError,
    confirmed: currentPassword !== "",
  });
  const passwordState = fieldState({
    touched: touched.password,
    error: passwordError,
    confirmed: rulesMet,
  });
  const confirmState = fieldState({
    touched: touched.confirm,
    error: confirmError,
    confirmed: confirmPassword !== "" && !mismatch,
  });

  function touch(field) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setCurrentError("");
    setPasswordError("");
    setFormError("");
    setSubmitting(true);
    try {
      const user = await changePassword({
        currentPassword,
        password,
        passwordConfirmation: confirmPassword,
      });
      navigate(`/${user?.role || "admin"}/dashboard`, { replace: true });
    } catch (error) {
      const currentMessage = firstMessage(error.errors?.current_password);
      const passwordMessage = firstMessage(error.errors?.password);
      if (currentMessage || passwordMessage) {
        setCurrentError(currentMessage);
        setPasswordError(passwordMessage);
      } else {
        setFormError(error.message || "Unable to change your password. Try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-[#F8FAFC] px-4 py-4 text-[#1F2937] sm:px-6">
      <main className="w-full max-w-[460px] rounded-3xl border border-[#E5E7EB] bg-white px-6 py-6 shadow-xl shadow-slate-900/5 sm:px-9 sm:py-7">
        <div className="mb-5 text-center">
          <img
            src={LOGO_SRC}
            alt="AKAY — Medical EHR and Referral System"
            className="mx-auto h-14 w-auto max-w-full object-contain"
            draggable="false"
          />
        </div>

        <div className="mb-5 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[#111827]">
            Change your temporary password
          </h1>
          <p className="mx-auto mt-1.5 max-w-[340px] text-sm leading-5 text-[#6B7280]">
            Enter the temporary password you were given, then choose a new one to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-1" noValidate>
          <Field label="Temporary password" error={currentError} state={currentState}>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setCurrentError("");
              }}
              onBlur={() => touch("current")}
            />
          </Field>

          <Field label="New password" error={passwordError} state={passwordState}>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError("");
              }}
              onBlur={() => touch("password")}
            />
          </Field>

          <ul className="space-y-1 pb-2" aria-label="Password rules">
            {rules.map((rule) => (
              <li
                key={rule.key}
                className={`flex items-center gap-2 text-xs ${rule.met ? "text-emerald-700" : "text-[#64748B]"}`}
              >
                {rule.met ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Circle size={14} aria-hidden="true" />
                )}
                {rule.label}
                <span className="sr-only">{rule.met ? "(met)" : "(not met)"}</span>
              </li>
            ))}
          </ul>

          <Field label="Confirm new password" error={confirmError} state={confirmState}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onBlur={() => touch("confirm")}
            />
          </Field>

          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]"
            >
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] text-sm font-bold text-white shadow-md shadow-red-900/10 transition-all duration-200 hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <KeyRound size={15} aria-hidden="true" />
            {submitting ? "Saving..." : "Change password"}
          </button>
        </form>
      </main>
    </div>
  );
}
