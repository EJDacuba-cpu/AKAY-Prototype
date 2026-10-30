# AKAY Current Technical Stack

## Purpose

This file records the **current technical stack as evidenced by the repository**, not the original planned stack in the capstone paper.

Package presence does not automatically prove a feature is actively used. Usage should still be verified in source code during audits.

---

## Frontend

Source of truth: `frontend/package.json`

### Core

- React `19.2.x`
- React DOM `19.2.x`
- Vite `8.x`
- React Router `7.15.x`
- TanStack Query `5.101.x`
- Tailwind CSS `4.3.x`

### UI / presentation dependencies currently installed

- `lucide-react`
- `react-hot-toast`
- `chart.js`
- `react-chartjs-2`
- Public Sans variable font
- Source Serif 4 variable font
- IBM Plex Mono

### QR support currently installed

- `html5-qrcode`
- `qrcode`

### Frontend checks/scripts currently declared

- Vite development server
- production build
- ESLint
- environment test
- patient/program utility test
- referral-gate utility test

The frontend test surface appears limited from `package.json`; a broader test audit is still required.

---

## Backend

Source of truth: `backend/composer.json`

### Runtime / framework

- PHP `^8.3`
- Laravel `^13.7`
- Laravel Sanctum `^4.3`

### Backend packages currently declared

- `barryvdh/laravel-dompdf`
- Laravel Tinker

### Development / testing

- PHPUnit `12.5.x`
- Laravel Pint
- Mockery
- Faker
- Collision
- Laravel Pail

---

## Database

Repository configuration indicates PostgreSQL support and the checked-in `.env.example` currently sets:

- `DB_CONNECTION=pgsql`
- PostgreSQL port `5432`
- placeholder Supabase database host/user/password values
- SSL mode `require`

The project documentation describes **PostgreSQL hosted through Supabase**, with Laravel connecting to PostgreSQL directly.

Important distinction:

- Supabase is currently treated as database hosting.
- Authentication is implemented through the Laravel backend/Sanctum model, not assumed to be Supabase Auth.

This must be verified against deployed/local environment configuration during the architecture audit. Never expose real environment secrets.

---

## Authentication / API Security Signals Visible in the Repository

Current backend routes show use of controls including:

- Laravel Sanctum authentication;
- access-token middleware;
- active-account middleware;
- role middleware;
- assigned-facility middleware;
- rate limiting on selected endpoints;
- sensitive-response no-store middleware;
- session-request validation on auth flows.

The `.env.example` also exposes configuration for:

- allowed origins;
- trusted hosts/proxies;
- security headers;
- CSP mode;
- HTTPS redirect;
- HSTS;
- token expiration/refresh behavior;
- auth cookie security attributes;
- rate limits.

These controls being present does **not** mean they are correct or complete. Security behavior must be audited end-to-end before being considered validated.

---

## Current API Surface — High-Level Only

`backend/routes/api.php` currently contains routes for areas including:

- authentication and password reset;
- notifications;
- patients;
- health records;
- referrals;
- QR/tracking lookup;
- feedback;
- medicines and transactions;
- RHU provider availability/roster;
- RHU patient volume;
- incoming referrals;
- BHW and RHU reports;
- health-record drafts;
- referral routing/holds;
- follow-up tasks;
- user/facility administration;
- audit logs.

This list describes route presence only. It does not confirm correctness, completeness, security, UI usage, or business validity.

---

## Known Technical Unknowns

The following must be established by repository audit rather than guessed:

- exact frontend folder/component architecture;
- exact backend controller/service/domain architecture;
- current database schema and migration health;
- whether all routes are used by the frontend;
- stale endpoints and dead code;
- duplicated business logic;
- authorization correctness at controller/policy/query level;
- facility-level data isolation;
- N+1 / inefficient queries;
- stale migrations or deployment assumptions;
- actual test coverage;
- production deployment topology;
- logging and backup behavior;
- whether all installed frontend dependencies are still needed;
- whether historical docs match current implementation.

---

## Rule for Future Stack Changes

Do not change frameworks, major versions, authentication strategy, database technology, or core libraries as incidental cleanup.

Any stack-level change requires:

1. identified problem;
2. alternatives;
3. migration impact;
4. security impact;
5. compatibility impact;
6. testing plan;
7. explicit developer approval.
