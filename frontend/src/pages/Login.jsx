import { useState } from "react";
import { Lock, Mail, Heart, ShieldCheck, Stethoscope } from "lucide-react";
import { useNavigate } from "react-router";
import { loginUser } from "../utils/auth";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setIsLoading(true);

    // Simulating API call
    setTimeout(() => {
      const user = loginUser(email, password);
      if (!user) {
        setError("Invalid email or password.");
        setIsLoading(false);
        return;
      }
      if (user.role === "admin") navigate("/admin/dashboard");
      if (user.role === "bhc") navigate("/bhc/dashboard");
      if (user.role === "rhu") navigate("/rhu/dashboard");
    }, 800);
  }

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* ═══════════ LEFT PANEL: RED BACKGROUND + FLOATING FORM ═══════════ */}
      <div className="hidden lg:flex w-1/2 relative flex-col bg-gradient-to-br from-red-950 via-red-900 to-red-800 items-center justify-center p-10 overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-700/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-red-950/40 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>

        {/* Top Left Branding */}
        <div className="absolute top-5 left-12 text-white z-20">
          <div className="flex items-center gap-2.5 mb-1">
            <Heart size={22} className="fill-white text-white" />
            <h1 className="text-2xl font-extrabold tracking-tight">AKAY</h1>
          </div>
          <p className="text-red-200/60  text-[11px] font-semibold tracking-[0.2em] uppercase pl-9">
            Healthcare System
          </p>
        </div>

        {/* Floating White Form Card */}
        <div className="relative z-10 bg-white w-full max-w-md rounded-3xl shadow-2xl p-10 border border-slate-100/50">
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Sign In
            </h2>
            <p className="text-slate-500 text-sm mt-2">
              Enter your credentials to access the portal.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  type="email"
                  required
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:border-red-700 focus:ring-2 focus:ring-red-100 outline-none transition-all text-sm text-slate-800 placeholder:text-slate-400"
                  placeholder="email@akay.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  type="password"
                  required
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:border-red-700 focus:ring-2 focus:ring-red-100 outline-none transition-all text-sm text-slate-800 placeholder:text-slate-400"
                  placeholder="••••••••"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-xs font-medium px-4 py-3 rounded-lg flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 rounded-xl text-white font-bold text-sm bg-red-700 shadow-lg shadow-red-700/30 transition-all hover:bg-red-800 hover:shadow-xl hover:shadow-red-800/30 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-white"
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    ></path>
                  </svg>
                  Validating...
                </span>
              ) : (
                "Log in"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-400 text-xs cursor-pointer hover:text-red-600 transition-colors">
              Can't access your account?
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════ RIGHT PANEL: CLINICAL IMAGERY & BRANDING ═══════════ */}
      <div className="w-full lg:w-1/2 relative bg-slate-50 flex flex-col justify-between overflow-hidden">
        {/* Abstract Medical Visual Placeholder */}
        {/* NOTE: Replace this div with an <img> tag if you have a real medical staff photo */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white via-red-50/30 to-white">
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Large Abstract Stethoscope / Cross Graphic */}
            <div className="relative">
              <div className="w-64 h-64 rounded-full border-[40px] border-red-100/60 absolute -top-32 -left-32"></div>
              <div className="w-96 h-96 rounded-full border-[60px] border-slate-100/80 absolute -bottom-48 -right-48"></div>
              <div className="relative z-10 bg-white p-10 rounded-full shadow-2xl shadow-slate-200/50 border border-slate-100">
                <Stethoscope
                  size={120}
                  strokeWidth={1}
                  className="text-red-700/80"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Branding Section */}
        <div className="relative z-10 p-12 bg-gradient-to-t from-white via-white/90 to-transparent pt-32">
          <div className="max-w-sm">
            <h3 className="text-3xl font-extrabold text-slate-900 leading-tight mb-4">
              Connecting Communities to{" "}
              <span className="text-red-700">Quality Care</span>
            </h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-8">
              A centralized digital ecosystem bridging Barangay Health Centers
              and Rural Health Units for seamless patient referrals.
            </p>

            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-extrabold text-slate-900">100%</p>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Secure
                </p>
              </div>
              <div className="w-px h-10 bg-slate-200"></div>
              <div>
                <p className="text-2xl font-extrabold text-slate-900">24/7</p>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Access
                </p>
              </div>
              <div className="w-px h-10 bg-slate-200"></div>
              <div>
                <p className="text-2xl font-extrabold text-slate-900">
                  Data Privacy
                </p>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Compliant
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ MOBILE VIEW (Visible on small screens) ═══════════ */}
      <div className="lg:hidden fixed inset-0 w-full h-full bg-gradient-to-br from-red-950 via-red-900 to-red-800 flex flex-col items-center justify-center p-6 z-50">
        <div className="absolute top-0 right-0 w-72 h-72 bg-red-700/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

        {/* Mobile Logo */}
        <div className="text-white text-center mb-8 relative z-10">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Heart size={24} className="fill-white text-white" />
            <h1 className="text-3xl font-extrabold tracking-tight">AKAY</h1>
          </div>
          <p className="text-red-200/60 text-[10px] font-semibold tracking-[0.2em] uppercase">
            Healthcare System
          </p>
        </div>

        {/* Mobile Form Card */}
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8 relative z-10">
          <h2 className="text-2xl font-extrabold text-slate-900 mb-1">
            Sign In
          </h2>
          <p className="text-slate-500 text-xs mb-6">
            Enter your credentials to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="email"
                required
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50/50 focus:border-red-700 focus:ring-2 focus:ring-red-100 outline-none text-sm"
                placeholder="Email Address"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="relative">
              <Lock
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="password"
                required
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50/50 focus:border-red-700 focus:ring-2 focus:ring-red-100 outline-none text-sm"
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-red-600 text-xs text-center bg-red-50 py-2 rounded-lg font-medium">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-lg text-white font-bold text-sm bg-red-700 shadow-lg shadow-red-700/30 transition-all hover:bg-red-800 disabled:opacity-70"
            >
              {isLoading ? "Validating..." : "Log in"}
            </button>
          </form>

          <p className="text-slate-400 text-[11px] text-center mt-5 cursor-pointer hover:text-red-600 transition-colors">
            Can't access your account?
          </p>
        </div>

        <div className="mt-6 flex items-center gap-2 text-white/40 relative z-10">
          <ShieldCheck size={12} />
          <span className="text-[9px] font-bold tracking-widest uppercase">
            Authorized Access Only
          </span>
        </div>
      </div>
    </div>
  );
}
