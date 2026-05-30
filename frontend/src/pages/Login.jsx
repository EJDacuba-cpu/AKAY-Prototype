import { useState } from "react";
import { Lock, Mail, Heart, ArrowRight, Activity } from "lucide-react";
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
    setError("");

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 sm:px-6 py-6 sm:py-12">
      {/* Main Card Container */}
      <div className="w-full max-w-[460px] bg-white rounded-2xl shadow-xl overflow-hidden ring-1 ring-slate-900/5 border border-slate-100">
        {/* Header / Branding - Red Theme */}
        <div className="relative bg-red-700 px-6 sm:px-10 pt-8 sm:pt-12 pb-6 sm:pb-10 text-center overflow-hidden shadow-md shadow-red-900/20">
          {/* Decorative circles in red */}
          <div className="absolute top-0 left-0 w-32 h-32 bg-red-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl translate-x-1/3 translate-y-1/3"></div>

          <div className="relative z-10">
            <div className="flex justify-center items-center gap-2 mb-2">
              <div className="bg-white/10 backdrop-blur-sm p-1.5 rounded-lg">
                <Heart size={18} className="fill-white text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                AKAY
              </h1>
            </div>
            <p className="text-red-100 text-[10px] sm:text-xs font-medium uppercase tracking-widest">
              Healthcare System
            </p>
          </div>
        </div>

        {/* Form Body */}
        <div className="px-5 sm:px-8 py-6 sm:py-10 space-y-5 sm:space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 text-center">
              Sign In
            </h2>
            <p className="text-slate-500 text-sm mt-1 sm:mt-2 text-center">
              Secure access to the medical referral portal.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Email Input */}
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2">
                Email Address
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail
                    size={18}
                    className="text-slate-400 group-focus-within:text-red-600 transition-colors"
                  />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 transition-all text-sm"
                  placeholder="user@akay.com"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2">
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock
                    size={18}
                    className="text-slate-400 group-focus-within:text-red-600 transition-colors"
                  />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 transition-all text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-[11px] sm:text-xs font-medium px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg flex items-center gap-2 animate-fade-in">
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full shrink-0"></div>
                {error}
              </div>
            )}

            {/* Submit Button - Red Primary */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white font-semibold py-3 sm:py-3.5 rounded-lg transition-all duration-200 focus:ring-2 focus:ring-red-700/20 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-red-700/30 text-sm sm:text-base"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
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
                  Signing in...
                </span>
              ) : (
                <>
                  Sign In <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Footer Links */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 border-t border-slate-100 pt-5 sm:pt-6 mt-4 sm:mt-6">
            <button className="text-[11px] sm:text-xs font-medium text-slate-500 hover:text-red-600 transition-colors">
              Forgot password?
            </button>
            <button className="text-[11px] sm:text-xs font-medium text-slate-500 hover:text-red-600 transition-colors">
              System Status
            </button>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="mt-6 sm:mt-8 text-center">
        <div className="flex items-center justify-center gap-2 text-slate-400 text-[10px] sm:text-xs">
          <Activity size={12} />
          <span>Secure Connection</span>
        </div>
        <p className="text-slate-300 text-[10px] mt-2">
          &copy; 2024 AKAY Health System. All rights reserved.
        </p>
      </div>
    </div>
  );
}

// Add simple fade animation for error messages
const style = document.createElement("style");
style.innerHTML = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fadeIn 0.3s ease-out forwards;
  }
`;
document.head.appendChild(style);
