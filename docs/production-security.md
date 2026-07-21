# AKAY Production Web Security

Phase 3D.1 prepares AKAY for deployment but does not select a host, provision TLS,
or deploy either application. Production values below are placeholders only.

## Environment matrix

| Setting | Local | Dev tunnel | Production |
| --- | --- | --- | --- |
| `APP_DEBUG` | `true` | `true` only with `APP_ENV=local` | `false` |
| CORS origins | localhost entries | exact configured HTTPS tunnel frontend | exact production frontend origins |
| API transport | HTTP allowed | HTTPS tunnel | HTTPS required |
| HSTS | off | off | explicit opt-in after TLS/proxy verification |
| CSP | report-only by default | report-only | enforced by default |
| Camera | self | self over secure tunnel | self over HTTPS |

## Backend templates

Local development:

```dotenv
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
AKAY_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AKAY_TRUSTED_HOSTS=localhost
AKAY_TRUSTED_PROXIES=
AKAY_CSP_MODE=report-only
AKAY_CSP_CONNECT_ORIGINS=
AKAY_HTTPS_REDIRECT_ENABLED=false
AKAY_HSTS_ENABLED=false
```

Development tunnels must be listed explicitly. Replace both placeholders whenever
the tunnel changes:

```dotenv
APP_ENV=local
APP_DEBUG=true
APP_URL=https://api-tunnel.example.invalid
FRONTEND_URL=https://frontend-tunnel.example.invalid
AKAY_ALLOWED_ORIGINS=http://localhost:5173,https://frontend-tunnel.example.invalid
AKAY_TRUSTED_HOSTS=api-tunnel.example.invalid
AKAY_TRUSTED_PROXIES=REMOTE_ADDR
AKAY_CSP_MODE=report-only
AKAY_CSP_CONNECT_ORIGINS=https://api-tunnel.example.invalid
AKAY_HSTS_ENABLED=false
```

`REMOTE_ADDR` trusts only the immediate peer as a proxy. Use it only when the
application server is reachable exclusively through the tunnel/proxy. Prefer an
explicit proxy IP or CIDR whenever the platform publishes one.

Production template:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.gov.ph
FRONTEND_URL=https://akay.example.gov.ph
AKAY_ALLOWED_ORIGINS=https://akay.example.gov.ph
AKAY_TRUSTED_HOSTS=api.example.gov.ph
AKAY_TRUSTED_PROXIES=10.0.0.0/24
AKAY_SECURITY_HEADERS_ENABLED=true
AKAY_CSP_MODE=enforce
AKAY_CSP_CONNECT_ORIGINS=https://api.example.gov.ph
AKAY_HTTPS_REDIRECT_ENABLED=true
AKAY_HSTS_ENABLED=true
AKAY_HSTS_MAX_AGE=31536000
AKAY_HSTS_INCLUDE_SUBDOMAINS=true
AKAY_AUTH_TOKEN_EXPIRATION_MINUTES=480
```

Do not use wildcard CORS origins or proxy values. Do not enable HTTPS redirects
until forwarded-protocol detection has been verified from a trusted proxy.
When application-level HTTPS enforcement is enabled, insecure API requests receive
a `426 HTTPS_REQUIRED` JSON response instead of a redirect, so query values and
bearer credentials are not copied into a `Location` header. Non-API web responses
use a permanent `308` redirect.

## Frontend template

```dotenv
VITE_API_BASE_URL=https://api.example.gov.ph/api
```

Only `VITE_` variables are embedded in browser code. Laravel keys, database
credentials, mail passwords, Supabase service-role keys, and other server secrets
must never be placed in frontend environment files.

The Vite development server uses `AKAY_DEV_API_PROXY_TARGET` for a same-origin
`/api` proxy. Add an exact tunnel hostname to `AKAY_VITE_ALLOWED_HOSTS` when a
development tunnel fronts Vite. These non-`VITE_` values configure Vite itself and
are not intentionally exposed to the application bundle.

## Browser response headers

The Laravel API and Vite dev/preview servers emit:

- `X-Content-Type-Options: nosniff` to prevent MIME sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` to limit cross-origin referrer data.
- `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` to prevent clickjacking.
- `Permissions-Policy` with camera limited to self and microphone, geolocation,
  payment, and USB disabled.
- `Cross-Origin-Opener-Policy: same-origin` to isolate the top-level browsing context.
- CSP in environment-selected enforced or report-only mode.
- HSTS only for securely detected production requests when explicitly enabled.

Production static hosting must reproduce the Vite preview headers on the SPA
document and assets. The enforced CSP is:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' <API_ORIGIN>; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self';
```

`style-src 'unsafe-inline'` remains because existing React components use inline
style attributes. Scripts do not allow `unsafe-inline` or `unsafe-eval`. Blob/data
image and blob media/worker sources preserve QR generation, downloads, the bundled
scanner, and notification audio. No external CDN origin is currently required.

## Deployment verification

1. Start Laravel and Vite locally; confirm login/API calls work, no redirect loop
   occurs, and HTTP responses have no HSTS.
2. Configure exact frontend/backend tunnel URLs. Confirm the trusted frontend
   passes preflight and an unknown tunnel origin receives no allow-origin header.
3. In DevTools Network, inspect the document and authenticated API responses for
   CSP, nosniff, referrer, frame, permissions, and Phase 3B no-store headers.
4. Load AKAY in an iframe from a different origin and confirm framing is refused.
5. Open the QR scanner over localhost or HTTPS, grant camera permission, scan a QR,
   and confirm microphone/geolocation are never requested.
6. Review the browser console for CSP reports/violations before enforcing the
   final production policy.
7. Trigger only the test exception route in automated tests and verify its response
   contains the generic error contract without paths, SQL details, or traces.
8. On HTTPS staging, configure trusted proxy addresses, enable HTTPS redirection,
   verify secure URL detection and absence of loops, then enable HSTS temporarily.
   Confirm HSTS appears only on HTTPS. Do not use `preload`.
9. Build once with a missing API URL and once with an absolute HTTP production URL;
   both must fail. Build with `/api` for an HTTPS same-origin deployment or an
   absolute HTTPS API URL; it must pass.
10. Verify the reverse proxy forwards `Authorization`, `Idempotency-Key`, and
    `X-Health-Record-Draft-ID` unchanged. Confirm an approved-origin OPTIONS
    request allows the three headers and that proxy access logs do not record
    authorization values or clinical request bodies.
11. Configure the production web server/CDN to send the documented frontend
    headers. Vite preview validates the policy but is not a production web server.

Actual deployment still requires final domains, TLS certificates, exact proxy
addresses, web-server headers, CSP browser verification, scheduler setup, backups,
monitoring, and the team's final HSTS decision.
