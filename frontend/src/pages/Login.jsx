import { useState } from "react";
import { Lock, Mail, ArrowRight, Activity } from "lucide-react";
import { useNavigate } from "react-router";
import { loginUser } from "../utils/auth";

const LOGO_SRC = "/akay-logo-only.png";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const user = await loginUser(email, password);

      if (user.role === "admin") navigate("/admin/dashboard");
      if (user.role === "bhc") navigate("/bhc/dashboard");
      if (user.role === "rhu") navigate("/rhu/dashboard");
    } catch (error) {
      setError(error.message || "Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-[#F8FAFC] px-4 py-4 text-[#1F2937] sm:px-6">
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .animate-fade-in {
            animation: fadeIn 0.25s ease-out forwards;
          }
        `}
      </style>

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
            Community EHR & Referral Tracking
          </p>
        </div>

        <div className="mb-5 text-center">
          <h2 className="text-xl font-bold tracking-tight text-[#111827]">
            Sign in to AKAY
          </h2>

          <p className="mx-auto mt-1.5 max-w-[340px] text-sm leading-5 text-[#6B7280]">
            Access community health records and referral tracking securely.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#6B7280]">
              Email Address
            </label>

            <div className="relative group">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Mail
                  size={17}
                  className="text-[#9CA3AF] transition-colors group-focus-within:text-[#B91C1C]"
                />
              </div>

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-4 text-sm text-[#111827] outline-none transition-all placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-4 focus:ring-red-700/10"
                placeholder="user@akay.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#6B7280]">
              Password
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
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-4 text-sm text-[#111827] outline-none transition-all placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-4 focus:ring-red-700/10"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="animate-fade-in flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#B91C1C]" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] text-sm font-bold text-white shadow-md shadow-red-900/10 transition-all duration-200 hover:bg-[#991B1B] focus:outline-none focus:ring-4 focus:ring-red-700/15 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Signing in...
              </span>
            ) : (
              <>
                Sign In <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-center gap-6 border-t border-[#E5E7EB] pt-4 text-center">
          <button className="text-[11px] font-semibold text-[#6B7280] transition-colors hover:text-[#B91C1C]">
            Reset password
          </button>

          <button className="text-[11px] font-semibold text-[#6B7280] transition-colors hover:text-[#B91C1C]">
            AKAY service status
          </button>
        </div>

        <div className="mt-4 text-center">
          <div className="flex items-center justify-center gap-2 text-[11px] text-[#9CA3AF]">
            <Activity size={12} />
            <span>Protected access</span>
          </div>

          <p className="mt-1 text-[9px] text-[#CBD5E1]">
            &copy; 2026 AKAY Community EHR System. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
}
