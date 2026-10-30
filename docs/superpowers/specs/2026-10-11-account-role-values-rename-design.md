# Account Role Values Rename — Design

**Date:** 2026-10-11
**Status:** Draft, awaiting review
**Branch:** `Rework-Patch-AKAY-1.0`
**Scope:** Project 2 of the account and access roadmap (after the Create Account rework).

Goal: make `users.role` say what it means. The column holds the **account type**: an MHO (admin), BHC or RHU account. Today the BHC value is `bhw`, which wrongly suggests Barangay Health Worker and now collides with the real `staff_role = 'bhw'`. The RHU value is `rhu_staff`. After this change an account reads `role = bhc, staff_role = midwife`.

**Behavior does not change.** Only names change.

---

## A. Decisions

| # | Decision |
|---|---|
| D1 | Values: `bhw` → `bhc`, `rhu_staff` → `rhu`. `admin` is unchanged. |
| D2 | Full rename. Every code name that uses "bhw" to mean a BHC account is renamed: constants, methods, middleware arguments, route paths and account-type messages. The frontend role mapping is removed. |
| D3 | The column keeps its name, `role`. Renaming the column is out of scope. |
| D4 | One cut-over. A single new migration converts data and Postgres functions; the code is renamed in the same branch. There is no period that accepts both old and new values. Data is test-only. |
| D5 | Old migrations are not edited. A `migrate:fresh` still runs them as written, then the new migration converts the result, so a fresh database and an upgraded one end up the same. |
| D6 | "BHW" that means the health worker is untouched: `staff_role = 'bhw'`, the "BHW" role label, and prose where "the BHW" is a person. |
| D7 | Test variable names such as `$bhwA` are not renamed. Test values, constants, method names and routes are. |

---

## B. Database

New migration `backend/database/migrations/2026_10_11_000002_rename_account_role_values.php`.

### B1. `up()`
1. `UPDATE users SET role = 'bhc' WHERE role = 'bhw'`
2. `UPDATE users SET role = 'rhu' WHERE role = 'rhu_staff'`
3. On `pgsql` only, rewrite every function in schema `public` whose definition contains a role comparison against an old value:
   - Find the functions: `pg_proc` joined to `pg_namespace` (`nspname = 'public'`, `prokind = 'f'`), where `pg_get_functiondef(oid)` matches the role pattern below.
   - For each one, take `pg_get_functiondef(oid)` (a full `CREATE OR REPLACE FUNCTION …`), apply `rewriteUp()`, and execute it. `CREATE OR REPLACE` keeps the function's grants, owner and settings.

### B2. The rewrite (public methods on the migration object, so tests can call them)
- `rewriteUp(string $sql): string` replaces `'bhw'` with `'bhc'` and `'rhu_staff'` with `'rhu'`, **only** when the literal is the right-hand side of an equality on an identifier named `role` or `p_role`, optionally table-qualified. Pattern: `/\b((?:[a-z_][a-z0-9_]*\.)?(?:p_)?role\s*=\s*)'(bhw|rhu_staff)'/i`.
- `rewriteDown(string $sql): string` is the reverse, with the same left-hand side: `'bhc'` → `'bhw'` and `'rhu'` → `'rhu_staff'`.
- What must not change:
  - `staff_role = 'bhw'`. `staff_role` does not match, because the pattern requires `role` or `p_role` at a word boundary, optionally after `table.`.
  - `facility_type = 'bhc'` and `p_facility_type = 'bhc'`. Their identifier is not `role`.
  - The `users_staff_role_check` constraint. It is a constraint, not a function.

The only role comparisons in today's functions are `p_role = '…'` and `u.role = '…'`, across 13 functions in `2026_06_14_000001_create_akay_stored_functions` and the inventory functions in `2026_07_21_000002`, `2026_07_28_000003` and `2026_09_23_000003` / `2026_10_11_000001`.

### B3. `down()`
- On `pgsql`, find functions matching `role = 'bhc'` or `role = 'rhu'` with the same pattern, apply `rewriteDown()`, and execute.
- Then `UPDATE users SET role = 'bhw' WHERE role = 'bhc'` and `… 'rhu_staff' WHERE role = 'rhu'`.

### B4. Side effects (accepted)
- **One re-login for BHC and RHU users.** Token names carry `securityContextHash`, which includes `role`, so existing tokens fail `matchesSecurityContext` and are revoked. Admin tokens are unaffected.
- **Cache keys include the role** (`AkayCacheService::scope`). Old entries are simply never read again and expire. Running `php artisan cache:clear` after migrating is optional.

---

## C. Backend

### C1. `App\Models\User`
- `ROLE_BHW = 'bhw'` → `ROLE_BHC = 'bhc'`, and `ROLE_RHU_STAFF = 'rhu_staff'` → `ROLE_RHU = 'rhu'`.
- `isBhw()` → `isBhc()`, and `isRhuStaff()` → `isRhu()`. Update every call site.
- `workflowRole()` keeps its behavior. The working-facility type (`'bhc'` / `'rhu'`) now equals the role value, so the method may map the type directly.

### C2. Routes (`routes/api.php`)
- `role:bhw` → `role:bhc`, `role:rhu_staff` → `role:rhu`, and `role:rhu_staff,admin` → `role:rhu,admin`.
- `/reports/bhw` → `/reports/bhc`, with `ReportController::bhw()` → `bhc()`. Update any frontend caller.

### C3. Account-type wording
- `UserRequest`:
  - "A BHC assignment is required for BHC accounts."
  - "BHC accounts cannot also be assigned to an RHU."
  - "An RHU assignment is required for RHU accounts."
  - "RHU accounts cannot also be assigned to a BHC."
- `ReportController`: audit text "Generated BHC report."
- Comments that describe the role constant, for example in `SyncFollowUpTasks`, say "BHC account".

### C4. Literals and filters
- The two `'bhw'` literals in `AuditLogController`, and anything else `grep -rnE "'bhw'|'rhu_staff'" backend/app backend/routes backend/config` finds outside `staff_role` handling.
- `UserController::index` `?role=` filter: the values are now `admin|bhc|rhu`.

### C5. Behavior that follows from the constants
These read the role through the renamed constants and methods. Only the names at their call sites change (C1); their logic does not. `AuthController` (login check, home path), `EnsureUserIsActive`, `UserSessionRevocationService`, `AkayCacheService`, `ActionPermissions::home`, `StaffRoles` (tiers and `AVAILABLE` keys, so `GET /staff-roles` returns tiers `bhc` / `rhu`), `UserRequest` `Rule::in`, `NurseAssignmentPolicy` and `StaffAssignmentController`.

Every stored-function caller passes `$user->role` or `workflowRole()` as `p_role`. These now carry the new values, matching the rewritten functions.

---

## D. Frontend

- `services/apiClient.js`: delete `mapRoleForFrontend` and `mapRoleForBackend`. `normalizeUser` uses `user.role` as is (`admin|bhc|rhu`). Routing (`/bhc/...`, `/rhu/...`) is unchanged.
- `services/adminAccountsService.js`, in `normalizeAccount`:
  - `role`: `'bhc'` → "BHC", `'rhu'` → "RHU", `'admin'` → "Admin". The directory badge map keys stay the same.
  - `accountRole` is the backend value as is. The `bhc_worker` alias is removed.
  - `accountRoleLabel`: "Barangay Health Center", "Rural Health Unit" or "Municipal Health Officer".
  - `position` fallback: the staff role label when `staff_role` is set (Midwife, BHW, Encoder, Nurse, Doctor), otherwise "BHC staff" or "RHU staff", or "Municipal Health Officer" for admin. An explicit `account.position` still wins. `getRhuDoctors` (filters `position === "Doctor"`) keeps working for doctors.
  - Delete the unused `toBackendPayload`, `createAdminAccount` and `updateAdminAccount`. They have no callers and no longer match the API.
- `utils/staffRoles.js`: `TIERS = { bhc: "bhc", rhu: "rhu", admin: "admin" }`.
- `pages/admin/AuditLogs.jsx` and `pages/admin/PasswordResetRequests.jsx`: replace the `'bhw'` and `'rhu_staff'` filter values and labels.
- Tests: `utils/staffRoles.fixture.js` tiers and `available` keys become `bhc` / `rhu`. Update the `'bhw'` and `'rhu_staff'` tier values in `staffRoles.test.js`, `accountSetup.test.js` and `accountForm.test.js`. Leave `staff_role: "bhw"` as is.

---

## E. Testing

**Backend (PHPUnit; sqlite in-memory)**
- New `tests/Feature/AccountRoleRenameMigrationTest.php`:
  - Data: roll the new migration back with `down()`, insert users with `bhw`, `rhu_staff` and `admin`, run `up()`, and expect `bhc`, `rhu` and `admin`. Run `down()` again and expect the original values.
  - `rewriteUp`:
    - rewrites `p_role = 'bhw'`, `u.role = 'rhu_staff'` and `ROLE='bhw'` (case and spacing tolerant).
    - leaves `staff_role = 'bhw'`, `p_facility_type = 'bhc'` and `facility_type = 'rhu'` unchanged.
  - `rewriteDown`: the mirror cases, plus leaving `p_facility_type = 'bhc'` unchanged.
- Update every test using the old constants, methods, values, middleware or `/reports/bhw`.
- Gate: the full suite (`php -d memory_limit=2G vendor/bin/phpunit`) has **no new failures** against the current baseline of 131 pre-existing failures, which are out of scope.
- Search gate: `grep -rnE "ROLE_BHW|ROLE_RHU_STAFF|isBhw|isRhuStaff|role:bhw|role:rhu_staff|reports/bhw|'rhu_staff'" backend/app backend/routes backend/tests frontend/src` returns nothing. `grep -rn "'bhw'"` in the same paths finds only `staff_role` handling, the `StaffRoles` `bhw` role key, and tests about the BHW staff role.

**Frontend**
- `npm run test:access`, `npm run lint` and `npm run build` all pass.

**Manual (scratch sqlite database, isolated ports)**
- Log in as admin, create a BHC Midwife and an RHU Nurse, then log in as each: the BHC account lands on `/bhc/dashboard` and the RHU account on `/rhu/dashboard`.
- The Account Directory shows the right badges and labels.
- Staff Assignments lists the RHU nurse.

**Manual (Postgres dev database, done by the user)**
- Run `php artisan migrate`, then confirm a BHC account can dispense and view inventory, which exercises the rewritten inventory functions.

---

## F. Rollout
1. Run `php artisan migrate`, or `migrate:fresh --seed` for a clean start.
2. Optionally run `php artisan cache:clear`.
3. BHC and RHU users sign in again.

## Out of scope
- Renaming the `role` column.
- The 131 pre-existing backend test failures.
- Locked UI and admin delegation (later roadmap projects).
