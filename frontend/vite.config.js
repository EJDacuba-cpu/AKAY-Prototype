import { defineConfig, loadEnv } from "vite";
import process from "node:process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { apiOrigin, validateApiBaseUrl } from "./config/environment";

const browserHeaders = (apiBaseUrl, reportOnly = false) => {
  const connectSources = ["'self'"];
  const configuredApiOrigin = apiOrigin(apiBaseUrl);

  if (configuredApiOrigin) connectSources.push(configuredApiOrigin);
  if (reportOnly) connectSources.push("ws:", "wss:");

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${[...new Set(connectSources)].join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");

  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy":
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    [reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy"]: csp,
  };
};

function parseAllowedHosts(value) {
  return String(value || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isProduction = mode === "production";
  const apiBaseUrl = validateApiBaseUrl(env.VITE_API_BASE_URL, {
    isProduction,
  });
  const proxyTarget = env.AKAY_DEV_API_PROXY_TARGET || "http://localhost:8000";
  const allowedHosts = parseAllowedHosts(env.AKAY_VITE_ALLOWED_HOSTS);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      headers: browserHeaders(apiBaseUrl, true),
      ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/sanctum": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      headers: browserHeaders(apiBaseUrl),
    },
  };
});
