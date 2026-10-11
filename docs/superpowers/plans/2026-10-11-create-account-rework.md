# Create Account Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `professional_designation` and the preset/override system with five staff roles. Rebuild the admin Create/Edit Account flow as Facility → Personal Details → Role & Access → Review.

**Architecture:** A new backend class `App\Services\StaffRoles` holds every role rule: roles, tiers, defaults, available duties and licensed flags. Validation uses it, and `GET /staff-roles` serves it to the frontend. The frontend keeps no copy of the role rules. Its helpers take the API data as an argument. The existing `users.role` column keeps its meaning as the facility tier (`admin` / `bhw` / `rhu_staff`).

**Tech Stack:** Laravel 12 (PHPUnit, sqlite in-memory for tests, Postgres in production), React 19 + Vite + Tailwind, `node --test` for frontend unit tests.

**Spec:** `docs/superpowers/specs/2026-10-11-create-account-rework-design.md`

## Global Constraints
- All UI copy is English.
- Role keys: `midwife`, `bhw`, `encoder`, `nurse`, `doctor`. Labels: Midwife, BHW, Encoder, Nurse, Doctor. Admin accounts are labelled **Municipal Health Officer**.
- Facility card labels are exactly: "Barangay Health Center", "Rural Health Unit", "Municipal Health Officer". Cards show no counts and no role names.
- Contact number regex (server): `/^09\d{9}$/`.
- Review confirmation copy (accounts): "I have reviewed all access listed above and authorize this account to perform them."
- Review confirmation copy (staff assignments): "I have reviewed all duties listed above and authorize this assignment."
- Audit copy: `Licensed duties granted to a non-licensed role ({Label}): {comma-separated keys}.`
- The **Added**, **Removed** and **Licensed** chips, and the directory's `Custom (+a, −r)`, are computed against the **role defaults**.
- RHU duties are provisional. Do not change any RHU screen.
- Do not rename `bhw` / `rhu_staff` values. That is a separate project.

## Review Focus
1. A status-only `PATCH /users/{id}` (activate or deactivate from the directory) on an old account with no `staff_role` or `contact_number` must still succeed. Test: Task 2.
2. Editing an account with the password left blank (no confirmation sent) must save. Test: Task 2.
3. A contact number typed as `0917 123 4567` or `0917-123-4567` is accepted. The client strips spaces and dashes before validating and sending. Test: Task 3 (`normalizeContactNumber`).
4. In edit mode, changing to another facility of the same tier keeps the role and duties. Changing tier clears them. Test: Task 3 (`applyFacilityChange`).
5. Switching role when the checklist still equals the current role's defaults happens without a prompt. If the admin edited the checklist, it asks first. Test: Task 3 (`needsReplaceConfirm`).

---

### Task 1: `StaffRoles` service

**Files:**
- Create: `backend/app/Services/StaffRoles.php`
- Test: `backend/tests/Unit/Services/StaffRolesTest.php`

**Interfaces:**
- Produces (all `public static`):
  - `ROLES` const: `key => ['label' => string, 'tier' => User::ROLE_BHW|User::ROLE_RHU_STAFF, 'licensed' => bool, 'defaults' => string[]]`
  - `AVAILABLE` const: `tier => string[]`
  - `keys(): array`
  - `label(?string $role): ?string`
  - `allowedAt(string $role, ?string $tier): bool`
  - `defaults(?string $role): array`
  - `available(?string $tier): array` (`[]` for admin or unknown)
  - `isLicensed(?string $role): bool`
  - `licensedGrants(?string $role, array $permissions): array` returns `ActionPermissions::LICENSED ∩ $permissions` when the role is not licensed, otherwise `[]`
  - `fromDesignation(?string $designation): ?string` returns `lower(trim)` when it is a key, otherwise `null`
  - `forApi(): array` returns `['roles' => [['key','label','tier','licensed','defaults'], …], 'available' => AVAILABLE]` (roles in the order midwife, bhw, encoder, nurse, doctor)

Values (from spec B2/B3):
- midwife / BHC / licensed: `patients.register, consultations.encode, consultations.finalize, clinical.history, records.correct, followups.manage, referrals.submit, inventory.view, items.dispense, reports.view`
- bhw / BHC / not licensed: `patients.register`
- encoder / BHC / not licensed: `patients.register, consultations.encode, inventory.view`
- nurse and doctor / RHU / licensed: `patients.register, clinical.history, rhu.manage, conditions.confirm, inventory.view, reports.view`
- AVAILABLE `bhw`: `patients.register, consultations.encode, consultations.finalize, clinical.history, records.correct, followups.manage, referrals.submit, inventory.view, inventory.manage, items.dispense, reports.view`
- AVAILABLE `rhu_staff`: `patients.register, clinical.history, inventory.view, reports.view, rhu.manage, conditions.confirm`

- [ ] **Step 1: Write failing tests** in `StaffRolesTest` (extends `PHPUnit\Framework\TestCase` or `Tests\TestCase`, with no DB):
  - `test_every_default_is_available_at_its_tier_and_carries_its_prerequisites`: for each role, `array_diff(defaults, available(tier)) === []` and `ActionPermissions::missingRequirements(defaults) === []`.
  - `test_allowed_at`: `allowedAt('nurse','bhw')` false, `allowedAt('midwife','rhu_staff')` false, `allowedAt('encoder','rhu_staff')` false, `allowedAt('encoder','bhw')` true, `allowedAt('doctor','rhu_staff')` true.
  - `test_licensed_grants`: `licensedGrants('encoder', ['patients.register','consultations.finalize','clinical.history'])` returns `['consultations.finalize']`. `licensedGrants('midwife', ['consultations.finalize'])` returns `[]`.
  - `test_from_designation`: `' Nurse '` → `'nurse'`, `'BHW'` → `'bhw'`, `'Logistics'`, `'MHO'`, `'Other'`, `''` and `null` → `null`.
  - `test_for_api_shape`: the keys are `['roles','available']`, the first role is `['key'=>'midwife','label'=>'Midwife','tier'=>'bhw','licensed'=>true, 'defaults'=>[…10]]`, and the role count is 5.
- [ ] **Step 2: Run them and confirm they fail.** Run `cd backend && php artisan test tests/Unit/Services/StaffRolesTest.php`. Expected: FAIL (class not found).
- [ ] **Step 3: Implement `StaffRoles`.** Add a class comment: "Single source of staff-role rules. The frontend reads these through GET /staff-roles. RHU entries are provisional until the RHU module is finished."
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(accounts): add StaffRoles rules`.

---

### Task 2: Backend switch from designation to `staff_role`

**Files:**
- Create: `backend/database/migrations/2026_10_11_000001_replace_professional_designation_with_staff_role.php`
- Modify:
  - `backend/app/Models/User.php` (fillable)
  - `backend/app/Services/ActionPermissions.php`
  - `backend/app/Services/NurseAssignmentPolicy.php`
  - `backend/app/Http/Controllers/Api/StaffAssignmentController.php:23`
  - `backend/app/Http/Controllers/Api/AuthController.php:174`
  - `backend/app/Http/Requests/UserRequest.php`
  - `backend/app/Http/Controllers/Api/UserController.php`
  - `backend/routes/api.php` (admin group)
- Create: `backend/app/Http/Controllers/Api/StaffRoleController.php`
- Test: `backend/tests/Feature/StaffRoleAccountTest.php` (new). Update every test that uses `professional_designation`, `acknowledged_overrides` or `ActionPermissions::PRESETS`: `PermissionOverrideTest`, `ApprovedFacilityPermissionsTest`, `AccountFacilityRevisionTest`, `PatientCreationPermissionsTest`, `RhuConditionConfirmationTest`, `RhuProviderAvailabilityTest`, `HouseholdParentLinkTest`, plus any others `grep -rln "professional_designation\|acknowledged_overrides\|PRESETS\[" backend/tests` finds.

**Interfaces:**
- Consumes: `StaffRoles::*` (Task 1).
- Produces:
  - Columns `users.staff_role` (nullable string) and `users.contact_number` (nullable `string(11)`).
  - `GET /api/staff-roles` (admin only), which returns `{"data": StaffRoles::forApi()}`.
  - The user JSON (index, show, login payload) includes `staff_role` and `contact_number`.
  - `POST/PATCH /api/users` accepts `staff_role`, `contact_number`, `password_confirmation`, and `permissions_confirmed`. It rejects nothing extra for `acknowledged_overrides`: the field is simply not in the rules and is dropped by `validated()`.

- [ ] **Step 1: Write failing tests** in `StaffRoleAccountTest` (`RefreshDatabase`, admin acting through `Sanctum::actingAs($admin, ['*'])`, one active RHU and one active BHC, following the `PermissionOverrideTest::setUp` pattern). Base valid payload: `name`, `email`, `contact_number '09171234567'`, `password` and `password_confirmation 'password123'`, `role 'bhw'`, `staff_role 'encoder'`, `barangay_health_center_id`, `permissions` = `StaffRoles::defaults('encoder')`, `permissions_confirmed true`.
  - `test_creates_encoder_with_defaults`: 201. The DB row has `staff_role='encoder'` and `contact_number='09171234567'`.
  - `test_rejects_role_tier_mismatch`: nurse + `bhw` → 422 on `staff_role`. Midwife + `rhu_staff` (with the RHU id) → 422. Encoder + `rhu_staff` → 422.
  - `test_staff_role_required_for_staff_and_prohibited_for_admin`: missing `staff_role` with `bhw` → 422. Admin payload with `staff_role 'midwife'` → 422.
  - `test_contact_number_format`: `0917123456`, `+639171234567` and `08171234567` each → 422 on `contact_number`.
  - `test_password_confirmation_must_match`: 422 on `password`.
  - `test_duty_unavailable_at_tier_rejected`: `bhw` account with `rhu.manage` → 422 `permissions` with message containing `rhu.manage is not available to BHC accounts.` RHU nurse with `consultations.encode` → 422 containing `not available to RHU accounts.`
  - `test_licensed_duty_on_encoder_needs_no_acknowledgement_and_is_audited`: encoder + `clinical.history, consultations.finalize` → 201. The latest `AuditLog` description contains `Licensed duties granted to a non-licensed role (Encoder): consultations.finalize.`
  - `test_midwife_licensed_duties_not_flagged`: midwife defaults → 201. The audit description does not contain `Licensed duties granted`.
  - `test_permissions_confirmed_required`: omit `permissions_confirmed` → 422.
  - `test_status_only_patch_on_legacy_account_succeeds` (Review Focus 1): a user created directly with `role 'bhw'`, no `staff_role`, no `contact_number` → `PATCH {status:'inactive'}` → 200.
  - `test_edit_without_password_keeps_password` (Review Focus 2): PATCH with full details, `password` `''` and no confirmation → 200, and the old password still verifies (`Hash::check`).
  - `test_legacy_account_must_pick_role_when_access_changes`: PATCH `permissions` on a `staff_role`-null BHC account → 422 `staff_role`.
  - `test_staff_roles_endpoint`: admin GET `/api/staff-roles` → 200, and `data.roles.0.key` is `midwife`. A BHC user → 403.
  - `test_nurse_assignment_eligibility_uses_staff_role`: an RHU user with `staff_role 'nurse'` appears in `GET /api/staff-assignments/eligible-nurses`. One with `staff_role 'doctor'` does not.
  - `test_designation_backfill_mapping`: assert `StaffRoles::fromDesignation` covers the migration's mapping. The migration must call it rather than repeat the mapping.
- [ ] **Step 2: Run them and confirm they fail.** Run `cd backend && php artisan test tests/Feature/StaffRoleAccountTest.php`. Expected: FAIL.
- [ ] **Step 3: Write the migration.**
  - `up()`:
    - Add both columns.
    - Backfill each row with `StaffRoles::fromDesignation($row->professional_designation)` in chunks.
    - On `pgsql` only:
      - `ALTER TABLE public.users ADD CONSTRAINT users_staff_role_check CHECK (staff_role IS NULL OR staff_role IN ('midwife','bhw','encoder','nurse','doctor'))`.
      - Recreate `public.akay_inventory_actor_has_facility`. Copy `inventoryFacilityFunction(true)` from `2026_09_23_000003_separate_assignments_and_referral_destinations.php` verbatim, but replace `lower(trim(u.professional_designation)) = 'nurse'` with `u.staff_role = 'nurse'`.
    - Then drop `professional_designation`.
  - `down()`: the reverse of `up()`:
    - Re-add `professional_designation` and fill it with `ucfirst(staff_role)` (`bhw` → `BHW`).
    - On pgsql, restore the function with the designation line and drop the constraint.
    - Drop both new columns.
- [ ] **Step 4: Update `User` fillable.** Remove `professional_designation` and add `staff_role` and `contact_number`.
- [ ] **Step 5: Update `ActionPermissions`.**
  - Delete `PRESETS`, `SENSITIVE`, `RHU_ONLY`, `CLINICAL_DESIGNATIONS`, `isClinical`, `scope`, `overrides` and `overrideTier`. First run `grep -rn` across `backend/app` to confirm they have no other readers.
  - Change the `home()` null-permissions fallback to `StaffRoles::defaults($user->staff_role)` when `staff_role` is set. Otherwise keep the tier fallback: BHC → `StaffRoles::defaults('encoder')`, RHU → `StaffRoles::defaults('nurse')`.
- [ ] **Step 6: Update the other readers.**
  - `NurseAssignmentPolicy::eligible` and `StaffAssignmentController::eligible` use `staff_role = 'nurse'`. In the controller, replace the `whereRaw` with `->where('staff_role', 'nurse')` and select `staff_role` in place of `professional_designation`.
  - `AuthController` payload returns `staff_role` and `contact_number`.
- [ ] **Step 7: Update `UserRequest`.**
  - Rules:
    - Remove `professional_designation` and `acknowledged_overrides(.*)`.
    - `staff_role` → `['nullable', Rule::in(StaffRoles::keys())]`.
    - `contact_number` → `[$isUpdate ? 'sometimes' : 'required', 'required', 'regex:/^09\d{9}$/']`.
    - `password` → add `'confirmed'`.
  - After-validator:
    - Effective `$staffRole` = `input('staff_role', existing?->staff_role)`. `$role` and `$permissions` keep their current fallbacks.
    - If `$role === admin && $staffRole !== null` → error on `staff_role`: "Municipal Health Officer accounts do not have a staff role."
    - If `$role !== admin && $this->hasAny(['permissions','staff_role','role'])`:
      - A null `$staffRole` → "Select a role for this account."
      - `! StaffRoles::allowedAt($staffRole, $role)` → "A {Label} account must be based at a {Barangay Health Center|Rural Health Unit}."
      - For each permission not in `StaffRoles::available($role)` → "{key} is not available to {BHC|RHU} accounts."
    - Delete the override-acknowledgement block.
- [ ] **Step 8: Update `UserController`.**
  - Remove `acknowledged_overrides` handling.
  - Unset `password_confirmation` before `create`/`update`.
  - `securityContextChanged` checks `staff_role` in place of `professional_designation`.
  - `accessAudit(User $user, array $previous)` keeps the added/removed parts. When `StaffRoles::licensedGrants($user->staff_role, $current)` is non-empty, it appends `Licensed duties granted to a non-licensed role ({StaffRoles::label}): {implode(', ')}.`
- [ ] **Step 9: Add `StaffRoleController::index`.** It returns `response()->json(['data' => StaffRoles::forApi()])`. Register `Route::get('/staff-roles', [StaffRoleController::class, 'index']);` inside the `role:admin` group.
- [ ] **Step 10: Run the new tests.** Expected: PASS.
- [ ] **Step 11: Update the legacy tests.**
  - Replace `'professional_designation' => 'X'` with `'staff_role' => '<key>'`, using `StaffRoles::fromDesignation('X')`, or `'encoder'` for Logistics/Other.
  - Replace `ActionPermissions::PRESETS['encoder'|'clinical'|'rhu'|'inventory']` with `StaffRoles::defaults('encoder'|'midwife'|'nurse')`, or with the explicit list `['inventory.view','inventory.manage']`.
  - API payloads gain `contact_number` and `password_confirmation`, and drop `acknowledged_overrides`.
  - In `PermissionOverrideTest`, delete the tests that assert override acknowledgement (that behavior is removed on purpose). Keep the ones that prove a granted duty unlocks endpoints.
- [ ] **Step 12: Run the full backend suite.** Run `cd backend && php artisan test`. Expected: all PASS, with no references left from `grep -rn "professional_designation\|acknowledged_overrides" backend/app backend/routes backend/tests`. The old migrations are allowed to keep their references.
- [ ] **Step 13: Commit** `feat(accounts): replace professional designation with staff role`.

---

### Task 3: Frontend role helpers and access policy

**Files:**
- Create: `frontend/src/utils/staffRoles.js`, `frontend/src/utils/staffRoles.test.js`, `frontend/src/services/staffRolesService.js`
- Modify: `frontend/src/utils/accessPolicy.js`, `frontend/src/utils/accessPolicy.test.js`, `frontend/src/utils/accountSetup.js`, `frontend/src/utils/accountSetup.test.js`, `frontend/src/utils/actionPermissions.js`, `frontend/package.json` (`test:access` script adds `src/utils/staffRoles.test.js`)

**Interfaces:**
- Consumes: the `GET /staff-roles` shape (Task 2): `rolesData = { roles: [{key,label,tier,licensed,defaults}], available: {bhw: [], rhu_staff: []} }`.
- Produces:
  - `services/staffRolesService.js`: `getStaffRoles(): Promise<rolesData>` (`unwrapData(await apiRequest("/staff-roles"))`).
  - `utils/staffRoles.js`:
    - `TIERS = { bhc: "bhw", rhu: "rhu_staff", admin: "admin" }`
    - `roleFor(rolesData, key) -> role | undefined`
    - `rolesForTier(rolesData, tier) -> role[]`
    - `availableDuties(rolesData, tier) -> string[]` (in `ALL_PERMISSIONS` order)
    - `roleDefaults(rolesData, key) -> string[]`
    - `licensedGrants(rolesData, key, permissions) -> string[]`
    - `needsReplaceConfirm(rolesData, currentKey, permissions) -> boolean`: false when `currentKey` is empty or the permissions set-equal the current defaults
    - `normalizeContactNumber(value) -> string`: strips spaces and `-`
    - `isValidContactNumber(value) -> boolean`: `/^09\d{9}$/` after normalizing
    - `applyFacilityChange(form, tier, facilityId) -> form`: sets `role` and the facility ids. When `tier !== form.role`, it also clears `staff_role` and `permissions`.
  - `utils/accessPolicy.js` keeps `withRequirements(permissions)`. `setPermission(permissions, key, on) -> string[]` is simplified to take no presets. `reviewPermissions({ permissions, defaults, licensedRole }) -> { rows: [{key,label,note,group,added,licensed}], removed: string[] }`. Everything else is deleted.
  - `utils/accountSetup.js`: `accessSummary(user, rolesData) -> { label, custom: boolean, licensed: boolean }`. `compatiblePermissions`, `suggestedPreset` and `accessProfile` are deleted.
  - `utils/actionPermissions.js`:
    - Delete `PERMISSION_PRESETS`, `CLINICAL_DESIGNATIONS`, `SENSITIVE_PERMISSIONS` and `RHU_ONLY_PERMISSIONS`.
    - `ALL_PERMISSIONS` becomes an explicit list, in the backend `ActionPermissions::ALL` order.
    - Add `NURSE_ASSIGNMENT_DUTIES`, mirroring `NurseAssignmentPolicy::DUTIES`.
    - Keep `LICENSED_PERMISSIONS`, `PERMISSION_CATALOG`, `PERMISSION_GROUPS` and `can`.

- [ ] **Step 1: Write failing tests** in `staffRoles.test.js`, with a local `rolesData` fixture copied from the Task 1 values:
  - `rolesForTier(data,"bhw")` keys equal `["midwife","bhw","encoder"]`, and `"rhu_staff"` keys equal `["nurse","doctor"]`.
  - `licensedGrants(data,"encoder",["consultations.finalize","patients.register"])` returns `["consultations.finalize"]`, and the midwife case returns `[]`.
  - `needsReplaceConfirm(data,"encoder", encoderDefaults)` is false, `needsReplaceConfirm(data,"encoder",[...encoderDefaults,"inventory.manage"])` is true, and `needsReplaceConfirm(data,"",[])` is false.
  - `normalizeContactNumber("0917 123-4567")` returns `"09171234567"`. `isValidContactNumber("0917 123 4567")` is true, and `"+639171234567"` and `"0817123456"` are false.
  - `applyFacilityChange({role:"bhw",staff_role:"midwife",permissions:["patients.register"],barangay_health_center_id:1,rural_health_unit_id:null},"bhw",2)` keeps the role and permissions and sets the BHC id to 2. The same form with `"rhu_staff",5` clears `staff_role` and `permissions`, sets `rural_health_unit_id:5` and `barangay_health_center_id:null`. `"admin",null` clears both ids.
  - The `accessPolicy.test.js` rewrite covers:
    - `setPermission([], "consultations.finalize", true)` includes `clinical.history`.
    - Unticking `clinical.history` drops `consultations.finalize`.
    - In the `reviewPermissions` result for encoder defaults + `inventory.manage` + `consultations.finalize` (licensedRole false), `inventory.manage` is `added:true, licensed:false`, `consultations.finalize` is `added:true, licensed:true`, and the midwife version has `licensed:false`. `removed` lists defaults that are not granted.
  - The `accountSetup.test.js` rewrite covers `accessSummary`:
    - admin → `"Municipal Health Officer"`
    - midwife with defaults → `"Midwife"` and `custom:false`
    - midwife with one default removed and `inventory.manage` added → `"Midwife · Custom (+1, −1)"`
    - no `staff_role` → `"Role not set"`
    - encoder with `consultations.finalize` → `licensed:true`
    - `permissions: null` → treated as defaults
- [ ] **Step 2: Run them and confirm they fail.** Run `cd frontend && npm run test:access`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, the service, and the trimmed `accessPolicy`, `accountSetup` and `actionPermissions`.
- [ ] **Step 4: Run them again.** Run `npm run test:access`. Expected: PASS. (`dashboardAccess.test.js` must still pass.)
- [ ] **Step 5: Commit** `feat(accounts): role helpers driven by staff-roles API`.

---

### Task 4: Access components (checklist and single-confirmation review)

**Files:**
- Modify: `frontend/src/components/features/access/PermissionMatrix.jsx`, `PermissionReviewSummary.jsx`, `PermissionReviewDialog.jsx`, `frontend/src/pages/admin/StaffAssignments.jsx`
- Delete: `frontend/src/components/features/access/PresetPicker.jsx`. Delete `AccessPreview.jsx` if `grep -rn AccessPreview frontend/src` shows only `AddUser.jsx`. Check `AccessChips.jsx`: keep `SourceChip` if it is reused for the new chips, and drop `TierChip`.

**Interfaces:**
- Consumes: `reviewPermissions`, `setPermission` and `LICENSED_PERMISSIONS` (Task 3).
- Produces:
  - `<PermissionMatrix permissions available defaults licensedRole onChange(key,on) onReset />`. It renders the header "Access · {n} of {available.length} selected" and a "Reset to role defaults" button that calls `onReset`. It shows only the `available` duties, grouped by `PERMISSION_GROUPS` in cards (`sm:grid-cols-2`, one column on phone). Each row has a checkbox, the label and the `note`, plus chips: **Added** (checked and not in `defaults`) and **Licensed** (checked, licensed, and `!licensedRole`). The "Also ticks …" prerequisite hint stays. There is no override section.
  - `<PermissionReviewSummary review details confirmed onConfirm(bool) confirmationLabel />`. It shows a details `<dl>`, then the duties grouped by module with Added and Licensed chips, then the struck-through Removed rows, then **one** checkbox labelled `confirmationLabel`. It exports `ACCOUNT_CONFIRMATION` and `ASSIGNMENT_CONFIRMATION` (copy in Global Constraints). `requiredConfirmations` and `confirmationsComplete` are deleted.
  - `PermissionReviewDialog` holds `const [confirmed, setConfirmed] = useState(false)` and disables confirm until it is true. It forwards `confirmationLabel`.

- [ ] **Step 1: Rewrite the three components** to the interfaces above.
- [ ] **Step 2: Update `StaffAssignments.jsx`.**
  - `duties = NURSE_ASSIGNMENT_DUTIES`.
  - The "Use suggested clinical duties" button sets `NURSE_ASSIGNMENT_DUTIES`.
  - `review = reviewPermissions({ permissions: form.permissions, defaults: NURSE_ASSIGNMENT_DUTIES, licensedRole: true })`.
  - Pass `confirmationLabel={ASSIGNMENT_CONFIRMATION}`.
  - Remove the `professional_designation` read.
- [ ] **Step 3: Delete** the unused components. Run `cd frontend && npm run lint`. Expected: no errors from `components/features/access` or `StaffAssignments.jsx`. (`AddUser.jsx` errors are expected until Task 5. If lint blocks, run Step 4 after Task 5.)
- [ ] **Step 4: Commit** `refactor(access): single-confirmation review and role-default checklist`.

---

### Task 5: Create and Edit Account page

**Files:**
- Modify: `frontend/src/pages/admin/AddUser.jsx` (rewrite)

**Interfaces:**
- Consumes:
  - `getStaffRoles` from Task 3, plus the Task 3 helpers (`TIERS`, `rolesForTier`, `availableDuties`, `roleDefaults`, `needsReplaceConfirm`, `normalizeContactNumber`, `isValidContactNumber`, `applyFacilityChange`) and `withRequirements`, `setPermission`, `reviewPermissions`.
  - `PermissionMatrix`, `PermissionReviewSummary`, `ACCOUNT_CONFIRMATION` (Task 4).
  - `ConfirmationModal` (`components/common/modals/ConfirmationModal.jsx`).
- Produces: the request body for `POST/PATCH /users`:
  ```
  { name, email, contact_number, password?, password_confirmation?, role, staff_role (null for admin),
    permissions ([] for admin), permissions_confirmed: true, barangay_health_center_id, rural_health_unit_id }
  ```
  Omit `password` and `password_confirmation` when the password is blank in edit mode.

- [ ] **Step 1: Set up state and loading.**
  - Form: `{ name, email, contact_number, password, password_confirmation, role: "", staff_role: "", permissions: [], barangay_health_center_id: null, rural_health_unit_id: null }`.
  - `Promise.all([getBarangayHealthCenters(), getRuralHealthUnits(), getStaffRoles(), id ? apiRequest(`/users/${id}`) : null])`.
  - Edit prefill: `permissions = withRequirements(u.permissions ?? roleDefaults(data, u.staff_role))`. Keep the `originalTier` for the tier-change prompt.
  - A load error shows in the existing alert and blocks Continue.
- [ ] **Step 2: Build the steps.**
  - `steps = role === "admin" ? ["Facility","Personal Details", reviewLabel] : ["Facility","Personal Details","Role & Access", reviewLabel]`, where `reviewLabel = id ? "Review & Save" : "Review & Create"`.
  - **Facility:**
    - Heading "Where will this account work?" with three cards (spec D1 labels, icon + name only, `aria-pressed`). Use the lucide icons `House`, `Hospital` and `ShieldCheck`.
    - After a BHC/RHU pick, show the facility `Select` (active facilities of that tier only, label "Which Barangay Health Center?" / "Which Rural Health Unit?"). For Municipal Health Officer, show the note "Municipal Health Officer accounts are not tied to a facility."
    - Picking a card or a facility goes through `applyFacilityChange`.
    - In edit mode, if the tier would change and `originalTier` was set, open `ConfirmationModal` (title "Change facility type?", description "Changing the facility type will clear this account's role and access. Continue?", confirmText "Change") before applying.
  - **Personal Details:**
    - Full name, Email, Contact number (`placeholder="09XX XXX XXXX"`, `inputMode="numeric"`), Password, Confirm password.
    - Password fields have a show/hide toggle (one shared `showPassword` state, with an Eye/EyeOff button).
    - Edit mode helper: "Leave blank to keep the current password."
  - **Role & Access:**
    - Role cards from `rolesForTier` (icons: `Stethoscope` midwife, `HandHeart` bhw, `Keyboard` encoder, `Syringe` nurse, `UserRound` doctor).
    - Picking a role: if `needsReplaceConfirm`, open `ConfirmationModal` (title "Replace access?", description "Replace current access with {Label} defaults?", confirmText "Replace"). Otherwise set `staff_role` and `permissions = roleDefaults(...)` directly.
    - Below the cards, `<PermissionMatrix available={availableDuties(data, form.role)} defaults={roleDefaults(data, form.staff_role)} licensedRole={roleFor(...)?.licensed} onReset=… />`. The matrix is hidden until a role is picked.
  - **Review:** `<PermissionReviewSummary confirmationLabel={ACCOUNT_CONFIRMATION} …/>` for staff. For admin, the details plus the same single checkbox (render the `dl` and the checkbox with `review` omitted, or pass an empty review). Details rows: Facility, Name, Email, Contact number, Role (or "Municipal Health Officer"), Credentials.
- [ ] **Step 3: Write `validate()` messages.**
  - Facility: "Choose where this account will work." / "Choose the Barangay Health Center." / "Choose the Rural Health Unit."
  - Personal: "Enter the full name." / "Enter a valid email address." / "Enter a mobile number like 09171234567." / "Password must contain at least 8 characters." (create, or edit when filled) / "Passwords do not match."
  - Role & Access: "Choose a role." / "Select at least one duty."
  - Review: "Tick the confirmation before saving."
  - Send `contact_number` through `normalizeContactNumber`. Server errors keep today's `Object.values(e.errors).flat().join(" ")`.
- [ ] **Step 4: Run lint and build.** Run `cd frontend && npm run lint && npm run build`. Expected: both succeed.
- [ ] **Step 5: Check by hand** with the backend running (`php artisan serve`) and `npm run dev`, logged in as admin:
  - Create a Midwife (defaults 10 of 11), a BHW, an Encoder with `consultations.finalize` (Licensed chip shows, saves), a Nurse, a Doctor and a Municipal Health Officer.
  - Edit the Encoder to another BHC (role kept), then to an RHU (prompt, role cleared).
  - Leave the password blank on edit (saves).
- [ ] **Step 6: Commit** `feat(accounts): facility-first create account flow with role and access`.

---

### Task 6: Account Directory

**Files:**
- Modify: `frontend/src/pages/admin/UserManagement.jsx`

**Interfaces:**
- Consumes: `accessSummary(user, rolesData)` (Task 3) and `getStaffRoles` (Task 3).

- [ ] **Step 1: Load the roles.** Load `getStaffRoles()` once alongside the account list. While it is loading, or if it fails, the badge falls back to `user.staff_role || "Role not set"`.
- [ ] **Step 2: Update the table.**
  - Desktop columns: `["Account","Role & Access","Home Facility","Additional Assignments","Status","Actions"]`. The Designation column is removed.
  - The Account cell shows the email and, when present, the `contact_number` on a third line (`text-xs text-slate-500`).
  - `AccessProfileBadge` uses `accessSummary`. Tone: `licensed` → red (title "Includes licensed duties for a non-licensed role."). `custom` → amber (title "Access differs from the role defaults."). Otherwise use the existing map, with "Municipal Health Officer" purple.
  - Mobile `dl`: replace Designation/Access Profile with `["Role & Access", summary.label]` and add `["Contact", user.contact_number || "Not recorded"]`.
  - Update the comment above `AccessProfileBadge`.
- [ ] **Step 3: Run lint and build.** Run `npm run lint && npm run build`. Expected: both succeed. Open the directory: the accounts from Task 5 show "Midwife", "Encoder · Custom (+2, −0)" in red, and "Municipal Health Officer".
- [ ] **Step 4: Commit** `feat(accounts): directory shows staff role and contact number`.

---

### Task 7: Final verification

- [ ] **Step 1:** Run `cd backend && php artisan test`. Expected: all pass.
- [ ] **Step 2:** Run `cd frontend && npm run test:access && npm run lint && npm run build`. Expected: all pass.
- [ ] **Step 3:** Run `grep -rn "professional_designation\|PERMISSION_PRESETS\|acknowledged_overrides\|designationScope\|overrideTier" backend/app backend/routes backend/tests frontend/src`. Expected: no matches.
- [ ] **Step 4:** Do the manual Staff Assignments check: an RHU Nurse appears under eligible nurses, the assignment dialog shows one checkbox, and the assignment saves. (The Postgres inventory function only runs on pgsql. If a pgsql dev DB is available, run `php artisan migrate` against it and dispense as an assigned nurse.)
- [ ] **Step 5:** Commit any fixes found.
