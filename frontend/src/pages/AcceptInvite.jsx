import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Check, Circle, Mail } from "lucide-react";
import Field from "../components/features/access/FieldError";
import Input from "../components/common/atoms/Input";
import { acceptInvite, verifyInvite } from "../services/accountInviteService";
import { fieldState } from "../utils/fieldState";
import { meetsPasswordRules, passwordRules } from "../utils/passwordRules";

const LOGO_SRC = "/akay-logo.png";
const INVALID_LINK_MESSAGE =
  "This invite link is invalid or expired. Ask your MHO to send a new one.";
const SIGN_IN_NOTICE = "Your password is set. Sign in to continue.";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [verifying, setVerifying] = useState(Boolean(token));
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({});
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function verify() {
      if (!token) return;
      try {
        const response = await verifyInvite(token);
        if (active) setInvite(response?.data || null);
      } catch {
        if (active) setInvite(null);
      } finally {
        if (active) setVerifying(false);
      }
    }

    verify();
    return () => {
      active = false;
    };
  }, [token]);

  const rules = passwordRules(password);
  const rulesMet = meetsPasswordRules(password);
  const mismatch = confirmPassword !== "" && confirmPassword !== password;
  const confirmError = touched.confirm && mismatch ? "Passwords do not match." : "";
  const canSubmit = rulesMet && confirmPassword !== "" && !mismatch;

  const passwordState = fieldState({
    touched: touched.password,
    error: passwordError,
    confirmed: rulesMet,
  });
  const confirmState = fieldState({
    touched: touched.confirm,
    error: confirmError,
    confirmed: canSubmit,
  });

  function touch(field) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setPasswordError("");
    setFormError("");
    setSubmitting(true);
    try {
      await acceptInvite({
        token,
        password,
        passwordConfirmation: confirmPassword,
      });
      navigate("/login", { replace: true, state: { notice: SIGN_IN_NOTICE } });
    } catch (error) {
      const passwordMessage = error.errors?.password;
      if (passwordMessage) {
        setPasswordError(
          Array.isArray(passwordMessage) ? passwordMessage[0] : passwordMessage,
        );
      } else if (error.status === 422) {
        setInvite(null);
      } else {
        setFormError(error.message || "Unable to save your password. Try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-[#F8FAFC] px-4 py-4 text-[#1F2937] sm:px-6">
      <main className="w-full max-w-[460px] rounded-3xl border border-[#E5E7EB] bg-white px-6 py-6 shadow-xl shadow-slate-900/5 sm:px-9 sm:py-7">
        <div className="mb-5 text-center">
          <h1>
            <img
              src={LOGO_SRC}
              alt="AKAY — Medical EHR and Referral System"
              className="mx-auto h-14 w-auto max-w-full object-contain"
              draggable="false"
            />
          </h1>
          <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF] sm:text-[10px]">
            Account Invitation
          </p>
        </div>

        {verifying ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
            Verifying invite link...
          </div>
        ) : invite ? (
          <>
            <div className="mb-5 text-center">
              <h2 className="text-xl font-bold tracking-tight text-[#111827]">
                Welcome to AKAY, {invite.name}
              </h2>
              <p className="mx-auto mt-1.5 max-w-[340px] text-sm leading-5 text-[#6B7280]">
                Set a password to finish setting up your account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-1" noValidate>
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#64748B]">
                <Mail size={14} className="text-[#B91C1C]" aria-hidden="true" />
                <span className="sr-only">Email</span>
                {invite.email}
              </div>

              <Field label="Password" error={passwordError} state={passwordState}>
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

              <Field
                label="Confirm password"
                error={confirmError}
                state={confirmState}
              >
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
                {submitting ? "Saving..." : "Save and continue"}
              </button>
            </form>
          </>
        ) : (
          <div className="space-y-4">
            <div
              role="alert"
              className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-medium leading-5 text-[#B91C1C]"
            >
              {INVALID_LINK_MESSAGE}
            </div>
            <Link
              to="/login"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              Back to sign in
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
