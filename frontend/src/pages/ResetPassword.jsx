import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, CheckCircle2, Lock, Mail } from "lucide-react";
import {
  completePasswordReset,
  verifyPasswordResetToken,
} from "../services/passwordResetService";

const LOGO_SRC = "/akay-logo-only.png";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [verifying, setVerifying] = useState(Boolean(token));
  const [validToken, setValidToken] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const passwordHint = useMemo(
    () => "Use at least 8 characters with uppercase, lowercase, and a number.",
    [],
  );

  useEffect(() => {
    let active = true;

    async function verifyToken() {
      if (!token) {
        setError("Password reset token is missing.");
        setVerifying(false);
        return;
      }

      try {
        const response = await verifyPasswordResetToken(token);
        if (!active) return;
        setValidToken(true);
        setEmail(response?.data?.email || "");
      } catch (error) {
        if (!active) return;
        setError(
          error.message ||
            "This password reset link is invalid or expired.",
        );
      } finally {
        if (active) setVerifying(false);
      }
    }

    verifyToken();

    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError(passwordHint);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await completePasswordReset({
        token,
        password,
        passwordConfirmation: confirmPassword,
      });
      setSuccess(
        response.message ||
          "Password changed successfully. You may now sign in.",
      );
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setError(
        error.message ||
          "Unable to change your password. Please request a new reset link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-[#F8FAFC] px-4 py-4 text-[#1F2937] sm:px-6">
      <main className="w-full max-w-[460px] rounded-3xl border border-[#E5E7EB] bg-white px-6 py-6 shadow-xl shadow-slate-900/5 sm:px-9 sm:py-7">
        <div className="mb-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
            <img
              src={LOGO_SRC}
              alt="AKAY Logo"
              className="h-12 w-12 object-contain"
              draggable="false"
            />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#B91C1C]">
            AKAY
          </h1>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF] sm:text-[10px]">
            Secure Password Reset
          </p>
        </div>

        <div className="mb-5 text-center">
          <h2 className="text-xl font-bold tracking-tight text-[#111827]">
            Create a new password
          </h2>
          <p className="mx-auto mt-1.5 max-w-[340px] text-sm leading-5 text-[#6B7280]">
            Choose a new password for your AKAY account.
          </p>
        </div>

        {verifying ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
            Verifying reset link...
          </div>
        ) : success ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-medium leading-5 text-emerald-700">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
              {success}
            </div>
            <Link
              to="/login"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] text-sm font-bold text-white shadow-md shadow-red-900/10 transition-all duration-200 hover:bg-[#991B1B]"
            >
              Back to sign in
            </Link>
          </div>
        ) : validToken ? (
          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            {email && (
              <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#64748B]">
                <Mail size={14} className="text-[#B91C1C]" />
                {email}
              </div>
            )}

            <PasswordField
              label="New Password"
              value={password}
              onChange={setPassword}
            />
            <PasswordField
              label="Confirm Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />

            <p className="text-[11px] leading-5 text-[#94A3B8]">
              {passwordHint}
            </p>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] text-sm font-bold text-white shadow-md shadow-red-900/10 transition-all duration-200 hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Changing password..." : "Change password"}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-medium leading-5 text-[#B91C1C]">
              {error || "This password reset link is invalid or expired."}
            </div>
            <Link
              to="/login"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
            >
              <ArrowLeft size={15} />
              Back to sign in
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function PasswordField({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#6B7280]">
        {label}
      </label>
      <div className="relative group">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Lock
            size={17}
            className="text-[#9CA3AF] transition-colors group-focus-within:text-[#B91C1C]"
          />
        </div>
        <input
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-4 text-sm text-[#111827] outline-none transition-all placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-4 focus:ring-red-700/10"
          placeholder="Enter password"
        />
      </div>
    </div>
  );
}
