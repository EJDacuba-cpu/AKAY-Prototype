export function validateApiBaseUrl(value, { isProduction = false } = {}) {
  const candidate = String(value || "").trim();

  if (!candidate) {
    throw new Error(
      "VITE_API_BASE_URL is required. Use /api locally or an HTTPS API URL in production.",
    );
  }

  if (candidate.startsWith("/")) {
    if (candidate.startsWith("//") || /[?#]/.test(candidate)) {
      throw new Error("VITE_API_BASE_URL must be a clean root-relative path.");
    }

    return candidate.replace(/\/+$/, "") || "/";
  }

  let parsed;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("VITE_API_BASE_URL must be a valid absolute URL or root-relative path.");
  }

  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash) {
    throw new Error("VITE_API_BASE_URL contains an unsupported or unsafe URL value.");
  }

  if (isProduction && parsed.protocol !== "https:") {
    throw new Error("VITE_API_BASE_URL must use HTTPS for a production build.");
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function apiOrigin(apiBaseUrl) {
  if (apiBaseUrl.startsWith("/")) return null;

  return new URL(apiBaseUrl).origin;
}
