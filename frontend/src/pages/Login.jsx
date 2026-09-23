import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, CheckCircle2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { loginUser } from "../utils/auth";
import { submitPasswordResetRequest } from "../services/passwordResetService";
import ButtonSpinner from "../components/common/loading/ButtonSpinner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionNotice, setSessionNotice] = useState(() =>
    location.state?.sessionReason === "session-expired"
      ? "Your session has expired. Please sign in again."
      : location.state?.sessionEnded
        ? "Your session is no longer valid. Please sign in again."
        : "",
  );
  const [fieldErrors, setFieldErrors] = useState({});
  const [mode, setMode] = useState("signin");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const isReset = mode === "reset";

  function clearFieldError(field) {
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isLoading) return;
    const errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length) {
      e.currentTarget.elements.namedItem(Object.keys(errors)[0])?.focus();
      return;
    }
    setIsLoading(true);
    setSessionNotice("");
    try {
      const user = await loginUser(email.trim(), password);
      const requestedPath = location.state?.from;
      const requestedUrl = requestedPath?.pathname
        ? `${requestedPath.pathname}${requestedPath.search || ""}`
        : "";
      const expectedPrefix = user.role === "admin" ? "/admin/" : `/${user.role}/`;
      if (requestedUrl.startsWith(expectedPrefix)) {
        navigate(requestedUrl, { replace: true });
        return;
      }
      if (user.role === "admin") navigate("/admin/dashboard", { replace: true });
      if (user.role === "bhc") navigate("/bhc/dashboard", { replace: true });
      if (user.role === "rhu") navigate("/rhu/dashboard", { replace: true });
    } catch (error) {
      setError(error.message || "Unable to sign in. Check your email and password.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetRequest(e) {
    e.preventDefault();
    if (isLoading || resetSuccess) return;
    const trimmedEmail = resetEmail.trim();
    setError("");
    setFieldErrors({});
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setFieldErrors({ resetEmail: "Enter a valid email address." });
      e.currentTarget.elements.namedItem("resetEmail")?.focus();
      return;
    }
    setIsLoading(true);
    try {
      await submitPasswordResetRequest(trimmedEmail);
      setResetSuccess("Your password reset request has been submitted. Please wait for administrator approval.");
    } catch (error) {
      setError(error.message || "Unable to submit your password reset request. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function switchMode() {
    setError("");
    setSessionNotice("");
    setFieldErrors({});
    setResetSuccess("");
    setShowPassword(false);
    if (!isReset) setResetEmail(email);
    setMode(isReset ? "signin" : "reset");
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-8 font-sans text-slate-900 sm:px-6"
      style={{ "--color-primary": "#B91C1C", "--color-primary-hover": "#991B1B", "--color-ring": "#B91C1C33" }}
    >
      <main aria-labelledby="login-title" className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="text-center">
          <img src="/akay-logo-only.svg" alt="AKAY logo" className="mx-auto size-16 rounded-full object-contain" draggable="false" />
          <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--color-primary)]">AKAY</p>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-700">Community Electronic Health Records<br />&amp; Referral Tracking System</p>
          <p className="mt-2 text-xs text-slate-500">Bulakan, Bulacan</p>
        </header>

        <div className="my-6 border-t border-slate-100" />
        <h1 id="login-title" style={{ fontFamily: "var(--font-sans)" }} className="text-xl font-semibold tracking-tight">
          {isReset ? "Request password reset" : "Sign in"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isReset
            ? "Enter your registered email address. An administrator must approve your request before you can reset your password."
            : "Access patient health records and track referrals."}
        </p>
        {sessionNotice && <p role="status" className="mt-4 rounded-md bg-slate-50 p-3 text-sm leading-5 text-slate-600">{sessionNotice}</p>}

        <form onSubmit={isReset ? handleResetRequest : handleSubmit} noValidate aria-busy={isLoading} className="mt-6 space-y-4">
          <div>
            <label htmlFor={isReset ? "resetEmail" : "email"} className="mb-2 block text-sm font-medium">Email address</label>
            <Input
              id={isReset ? "resetEmail" : "email"}
              name={isReset ? "resetEmail" : "email"}
              type="email"
              autoComplete={isReset ? "email" : "username"}
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={isLoading || (isReset && Boolean(resetSuccess))}
              value={isReset ? resetEmail : email}
              onChange={(e) => {
                if (isReset) setResetEmail(e.target.value);
                else setEmail(e.target.value);
                clearFieldError(isReset ? "resetEmail" : "email");
              }}
              aria-invalid={Boolean(isReset ? fieldErrors.resetEmail : fieldErrors.email)}
              aria-describedby={(isReset ? fieldErrors.resetEmail : fieldErrors.email) ? "email-error" : undefined}
              placeholder="Enter your registered email"
            />
            {(isReset ? fieldErrors.resetEmail : fieldErrors.email) && (
              <p id="email-error" role="alert" className="mt-2 text-xs text-red-700">{isReset ? fieldErrors.resetEmail : fieldErrors.email}</p>
            )}
          </div>

          {!isReset && (
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label>
              <div className="relative">
                <Input
                  id="password" name="password" type={showPassword ? "text" : "password"}
                  autoComplete="current-password" required disabled={isLoading}
                  value={password} onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  placeholder="Enter your password" className="pr-12"
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-0.5" disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </Button>
              </div>
              {fieldErrors.password && <p id="password-error" role="alert" className="mt-2 text-xs text-red-700">{fieldErrors.password}</p>}
            </div>
          )}

          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800">{error}</p>}
          {resetSuccess && (
            <div role="status" className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>{resetSuccess}</p>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isLoading || (isReset && Boolean(resetSuccess))}>
            {isLoading && <ButtonSpinner />}
            {isReset ? (isLoading ? "Submitting request…" : "Submit reset request") : (isLoading ? "Signing in…" : "Sign in")}
          </Button>
        </form>

        <div className="mt-2 text-center">
          <Button type="button" variant="link" disabled={isLoading} onClick={switchMode}>
            {isReset ? "Back to sign in" : "Forgot password?"}
          </Button>
        </div>
        <div className="mt-5 flex items-start justify-center gap-2 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-500">
          <LockKeyhole size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>For authorized BHC and RHU personnel only.</p>
        </div>
      </main>
      <footer className="mt-5 text-center text-xs text-slate-500">&copy; {new Date().getFullYear()} AKAY</footer>
    </div>
  );
}
