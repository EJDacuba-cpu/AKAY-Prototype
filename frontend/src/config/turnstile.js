export const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export const TURNSTILE_DUMMY_SITE_KEYS = [
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
];

export const TURNSTILE_ACTION = "login";

const CAPTCHA_MESSAGES = {
  CAPTCHA_REQUIRED: "Complete the bot check before signing in.",
  CAPTCHA_FAILED: "Bot verification failed. Refresh the check and try again.",
  CAPTCHA_UNAVAILABLE:
    "Bot protection is temporarily unavailable. Please try again in a moment.",
};

const TEMP_PASSWORD_EXPIRED_MESSAGE =
  "This temporary password has expired. Ask the MHO for a new one.";

export function resolveTurnstileSiteKey(value, { isProduction = false } = {}) {
  const siteKey = String(value || "").trim();
  if (!siteKey) return "";
  if (isProduction && TURNSTILE_DUMMY_SITE_KEYS.includes(siteKey)) return "";
  return siteKey;
}

export function isCaptchaError(error) {
  return Boolean(error?.code && CAPTCHA_MESSAGES[error.code]);
}

export function shouldResetTurnstile(error) {
  return error?.code !== "LOGIN_THROTTLED";
}

export function loginErrorMessage(error) {
  if (error?.code === "TEMP_PASSWORD_EXPIRED") return TEMP_PASSWORD_EXPIRED_MESSAGE;
  if (error?.code && CAPTCHA_MESSAGES[error.code]) return CAPTCHA_MESSAGES[error.code];
  const tokenError = error?.errors?.turnstile_token;
  if (Array.isArray(tokenError) && tokenError[0]) return tokenError[0];
  if (typeof tokenError === "string" && tokenError) return tokenError;
  return error?.message || "Unable to sign in. Check your email and password.";
}

export const TURNSTILE_SITE_KEY = resolveTurnstileSiteKey(
  import.meta.env?.VITE_TURNSTILE_SITE_KEY,
  { isProduction: Boolean(import.meta.env?.PROD) },
);
