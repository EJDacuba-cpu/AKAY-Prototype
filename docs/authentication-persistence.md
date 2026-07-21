# AKAY Authentication Persistence

AKAY uses one browser authentication architecture: a short-lived Sanctum access
token held only in JavaScript memory plus a rotating opaque Sanctum refresh token
held in an HttpOnly cookie. The refresh credential is never returned in JSON and
is scoped to `/api/auth`. Authentication data is not written to localStorage,
sessionStorage, IndexedDB, URLs, or persisted query caches.

## Lifecycle

- Access tokens expire after 15 minutes by default and remain subject to the
  existing Sanctum expiration and revocation checks.
- Refresh sessions have a 120-minute idle limit and an eight-hour absolute limit
  by default. Rotation renews idle activity but preserves the original absolute
  expiration.
- Login and each successful refresh rotate the browser credential. Logout deletes
  the presented access and refresh tokens and expires the cookie with matching
  path/domain attributes.
- Password resets, account deactivation, role changes, and facility changes use
  the existing account-wide token revocation service, which also deletes refresh
  credentials.
- Expired Sanctum rows remain covered by the existing scheduled token pruning.

The session endpoints bypass `AkayCacheService` and return `Cache-Control:
no-store, private`, `Pragma: no-cache`, and `Vary: Authorization, Cookie`.

## CSRF and origins

Cookie-touching auth requests use JSON plus the exact `X-AKAY-Session: 1` header.
For browser requests carrying an `Origin`, the server requires that origin to be
in the exact CORS allowlist. The custom header forces a CORS preflight and is not a
secret or an authentication credential. Unapproved origins and approved origins
without the header receive a generic 419 response.

The refresh cookie defaults to `SameSite=Lax`. `SameSite=None` is supported only
with `Secure=true`. Production configuration always forces the Secure attribute.
The documented production frontend and API subdomains are same-site; use `None`
only after an explicitly reviewed cross-site deployment requires it.

## Environment

Local HTTP defaults:

```dotenv
AKAY_AUTH_ACCESS_TOKEN_MINUTES=15
AKAY_AUTH_REFRESH_TOKEN_MINUTES=480
AKAY_AUTH_REFRESH_IDLE_MINUTES=120
AKAY_AUTH_COOKIE_SECURE=false
AKAY_AUTH_COOKIE_SAME_SITE=lax
AKAY_AUTH_COOKIE_DOMAIN=
```

Production HTTPS uses the same finite lifetimes with
`AKAY_AUTH_COOKIE_SECURE=true`. Leave the domain empty for a host-only API cookie.
Set a domain only after reviewing the exact subdomain topology. Configure exact
HTTPS `FRONTEND_URL` and `AKAY_ALLOWED_ORIGINS` values, trusted proxy addresses,
and forwarded HTTPS handling. Wildcard origins are prohibited.

## Browser behavior

Protected routes remain in `restoring` state until refresh succeeds or returns a
definitive unauthenticated response. Network failures show a retry state rather
than redirecting. A successful login returns to a safe requested route within the
authenticated role prefix. Session expiry clears protected TanStack Query data,
broadcasts logout to other tabs, and shows the generic sign-in message.

Full refresh does not preserve unsaved React form state. Official server-side
Health Record Drafts remain the supported resumable clinical-data mechanism.
