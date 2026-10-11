# Account Role Values Rename — Implementation Plan (as executed)

> **Record, not a forward plan.** On the user's request this plan was written *after* implementation, as a record of what was done, in the order it was done. Every step is checked because it ran. Verification results are the real outputs.

**Goal:** Rename the account-type values in `users.role` from `bhw` to `bhc` and from `rhu_staff` to `rhu`, everywhere, without changing behavior.

**Architecture:** One cut-over. A single migration converts `users.role` and rewrites only the role comparisons inside Postgres functions. Code is renamed mechanically (constants, methods, middleware, routes), with manual edits for meaning-dependent spots. The frontend drops its role mapping, because the API values now match its route roles.

**Tech Stack:** Laravel 12 (PHPUnit, sqlite in-memory for tests, Postgres in dev/prod), React 19 + Vite, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-11-account-role-values-rename-design.md`

**Commits:** `3f1ac14` (spec), `cbc6231` (backend), `201619d` (frontend).

## Global Constraints
- `users.role` values become `admin | bhc | rhu`. The column name stays `role`.
- `staff_role = 'bhw'` (Barangay Health Worker), the "BHW" label, and prose where "BHW" means the person are untouched.
- Facility-type literals (`'bhc'`, `'rhu'` in `facility_type`, `p_facility_type`) are untouched.
- Old migrations are not edited.
- Test variable and test method names (`$bhwA`, `test_rhu_staff_...`) are not renamed.

---

### Task 0: Baseline
- [x] Ran the full backend suite before any change: `php -d memory_limit=2G vendor/bin/phpunit`.
  Result: **796 tests, 644 pass, 131 failing.** All 131 failures are pre-existing and out of scope. The list is kept for comparison.

### Task 1: Rename migration (TDD)

**Files:**
- Create: `backend/database/migrations/2026_10_11_000002_rename_account_role_values.php`
- Test: `backend/tests/Feature/AccountRoleRenameMigrationTest.php`

- [x] **Wrote the failing tests:**
  - `test_role_values_are_renamed_and_restored`: `down()`, insert `bhw` / `rhu_staff` / `admin` users, `up()` gives `bhc` / `rhu` / `admin`, and `down()` restores the original values.
  - `test_rewrite_up_changes_only_role_comparisons`: rewrites `p_role = 'bhw'`, `p_role='rhu_staff'`, `u.role = 'bhw'`, `u.role  =  'rhu_staff'` and `ROLE='bhw'`. Leaves `u.staff_role = 'bhw'`, `staff_role='bhw'`, `p_facility_type = 'bhc'` and `facility_type = 'rhu'` unchanged.
  - `test_rewrite_down_mirrors_up_and_leaves_facility_types_alone`
- [x] **RED:** 3/3 failed (migration file missing).
- [x] **Implemented the migration:**
  - `up()` updates `users.role`. On pgsql only, it scans `pg_proc` (schema `public`, `prokind = 'f'`), and for each `pg_get_functiondef` that matches the role pattern, executes the rewritten definition.
  - `down()` reverses this: functions first, then data.
  - The rewrite pattern is `/\b((?:[a-z_][a-z0-9_]*\.)?(?:p_)?role\s*=\s*)'(old)'/i`. It matches `role` or `p_role`, optionally table-qualified. It never matches `staff_role` or `*facility_type`.
  - `rewriteUp()` and `rewriteDown()` are public methods on the migration object, so the tests can call them.
- [x] **GREEN:** 3/3 pass.

### Task 2: Backend rename (mechanical pass)
- [x] Confirmed no migration or seeder uses `User::ROLE_*`, `isBhw` or `isRhuStaff`, so renaming the constants cannot change a historical migration.
- [x] Ran a guarded PHP script over `app/`, `routes/` and `tests/`. It skips `StaffRoleMigrationTest.php` and `AccountRoleRenameMigrationTest.php`, and aborts if a file would become empty.
  - `ROLE_BHW` → `ROLE_BHC`, `ROLE_RHU_STAFF` → `ROLE_RHU`
  - `isBhw(` → `isBhc(`, `isRhuStaff(` → `isRhu(`
  - `role:bhw` → `role:bhc`, `role:rhu_staff` → `role:rhu`
  - `'rhu_staff'` → `'rhu'`, and `'role' => 'bhw'` → `'role' => 'bhc'`

  Result: 105 files changed.

### Task 3: Backend rename (manual pass)
- [x] `User`: `ROLE_BHC = 'bhc'`. `workflowRole()` returns `workingFacility['type']` directly, since the type and the role now share values.
- [x] `AuditLogController::mapRoleFilter` accepts `admin | bhc | rhu` as is.
- [x] Route `/reports/bhw` → `/reports/bhc`, and `ReportController::bhw()` → `bhc()`. The audit text is now "Generated BHC report."
- [x] `UserRequest` messages now read "BHC accounts" and "RHU accounts".
- [x] `SyncFollowUpTasks`: the comment and the warning now say "BHC account(s)".
- [x] Tests that use tier values: the `PatientCreationPermissionsTest` data provider and `StaffRolesTest` (`allowedAt(…, 'bhc')`, `'tier' => 'bhc'`, available keys `['bhc', 'rhu']`). `StaffRoles::fromDesignation('BHW')` and `isLicensed('bhw')` stay, because they are about the staff role.
- [x] Second guarded pass (12 files):
  - `resolveForBhw` → `resolveForBhc`, `resolveReceivingRhuForBhw` → `resolveReceivingRhuForBhc`, `ensureBhw` → `ensureBhc`
  - test URLs `/api/reports/bhw` → `/api/reports/bhc`
  - JSON path `data.available.rhu_staff` → `data.available.rhu`
- [x] Grep gate over `app routes config tests` (excluding the two historical-migration tests): no `ROLE_BHW`, `ROLE_RHU_STAFF`, `isBhw`, `isRhuStaff`, `role:bhw`, `role:rhu_staff`, `reports/bhw`, `'rhu_staff'`, `ForBhw` or `ensureBhw`. What remains is test method names that describe people (`test_rhu_staff_…`) and one historical migration file name. Both are allowed by the constraints.

### Task 4: Frontend (TDD on the helpers)
- [x] **Tests and fixture first.** In `staffRoles.fixture.js`, tiers and `available` keys became `bhc` / `rhu`. In `staffRoles.test.js`, `accountForm.test.js` and `accountSetup.test.js`, tier values became `bhc` / `rhu`. The staff-role key `bhw` is kept.
- [x] **RED:** `npm run test:access` gave 28 pass, 2 fail (the tests that depend on `TIERS`).
- [x] **Code:**
  - `staffRoles.js`: `TIERS = { bhc: "bhc", rhu: "rhu", admin: "admin" }`.
  - `apiClient.js`: removed `mapRoleForFrontend` and `mapRoleForBackend`. `normalizeUser` uses `user.role` as is.
  - `adminAccountsService.js`:
    - New `ACCOUNT_TYPES` map for the badge, the type label and the staff fallback. `position` falls back to the staff-role label, then to "BHC staff" / "RHU staff" / "Municipal Health Officer".
    - Removed the unused `toBackendPayload`, `normalizeFacilityId`, `createAdminAccount` and `updateAdminAccount`.
  - `AuditLogs.jsx` and `PasswordResetRequests.jsx` use the new values, with labels "Barangay Health Center", "Rural Health Unit" and "Municipal Health Officer".
  - `FacilityPickerModal.jsx`: the `TITLES` keys are now `bhc` / `rhu`. The grep gate caught this; without the fix the picker title would have disappeared.
- [x] **GREEN:** `npm run test:access` 30/30. `npx eslint src` gives 0 errors (1 pre-existing warning in `RHUAddHealthRecords.jsx`). `npm run build` succeeds.
- [x] Remaining `bhw` hits in `frontend/src`: the BHW staff-role icon key, the staff-role key in fixtures and tests, and the Family Planning record field `bhw` (the worker's name). All are allowed.

### Task 5: Full verification
- [x] **First full run: 799 tests, 1 new failure.**
  - `SecureServerCacheTest::test_cache_keys_hash_sensitive_filters…` asserted the cache key contains `:bhw:bhc:`. The key now contains `:bhc:bhc:`, the cache-key change the spec expects (B4).
  - Updated the expectation. The test passes.
- [x] **Second full run: 799 tests, 647 pass, 131 failing. That is 0 new against the baseline.**
- [x] **Manual check on a scratch sqlite database** (isolated ports 8011 / 5183; the user's servers were not touched):
  - `php artisan migrate` ran `2026_10_11_000002` and converted the test midwife to `role = bhc, staff_role = midwife`.
  - Logged in as that BHC account. It landed on `/bhc/dashboard` with "Working at: Pitpitan Health Center", and there were no console errors.
  - Network: every API call returned 200 except `GET /api/rhu-patient-volumes`, which returned 403. That endpoint requires the `rhu.manage` duty (`EnforceActionPermissions`) and does not depend on role values. The midwife never had that duty, so the 403 is pre-existing and not caused by this change.
- [x] Committed the backend (`cbc6231`) and the frontend (`201619d`) separately.

---

## Rulings made during execution
- **Plan written after implementation.** The user asked for this. Cost if wrong: there was no plan review before coding. This record and the final review stand in for it.
- **Historical-migration tests keep `bhw` / `rhu_staff`.** `StaffRoleMigrationTest` exercises the 2026-10-11 staff-role migration in its own world, where the values were still old. Cost if wrong: none; that migration is frozen.
- **`resolveForBhw` / `ensureBhw` were renamed too.** The spec's "full rename" covers any code name where "bhw" means a BHC account. Cost if wrong: a cosmetic rename only.
- **Directory `position` fallback** uses a staff-role label formatted inline (`bhw` → "BHW", otherwise capitalized). It is display only and does not copy role rules. Cost if wrong: a label differs from the API's `label` for a future role.

## Not verified here
- The Postgres function rewrite on a real Postgres database. sqlite has no functions. The user should run `php artisan migrate` on the dev database, then check that a BHC account can view inventory and dispense, and that an RHU account can see incoming referrals.
- An RHU account login in the browser. Only the BHC login was checked manually; RHU access is covered by the backend feature tests.
