# Remove RHU Household / FSN Implementation Plan

> **For agentic workers:** Execute task-by-task. Do **not** commit/push unless the user explicitly asks.

**Goal:** Hard-cut RHU Household/FSN product surface and APIs while preserving BHC Household/FSN and legacy RHU household rows.

**Architecture:** Role-gate shared registration UI; remove RHU families routes/nav; delete `/api/rhu/households*`; reject RHU household patient payloads; revoke RHU `families.*` availability; keep handoff detach + all BHC paths.

**Tech Stack:** Laravel API, React frontend, existing household services.

## Global Constraints

- Do not modify BHC Household/FSN behavior or UI.
- Do not drop DB constraints or delete legacy RHU household data.
- Do not commit, push, merge, or deploy.
- Preserve monitoring handoff + shared Patient IDs.

---

### Task 1: Backend — block RHU household writes and remove RHU household routes

**Files:**
- Modify: `backend/routes/api.php`
- Modify: `backend/app/Http/Controllers/Api/PatientController.php`
- Modify: `backend/app/Http/Requests/PatientRequest.php` (or controller reject)
- Modify: `backend/app/Services/StaffRoles.php`
- Modify: `backend/tests/Feature/RhuHouseholdsTest.php`
- Modify: `backend/tests/Feature/RhuWalkInRegistrationTest.php`
- Modify: related permission tests if they assume RHU `families.*`

- [ ] Remove `rhu` from households route foreach (BHC only).
- [ ] Reject `household` / `head_replacement` for RHU on patient store/update (422); skip attach/FSN allocate for RHU.
- [ ] Remove `families.view` / `families.manage` from RHU AVAILABLE in StaffRoles.
- [ ] Retarget RhuHouseholdsTest to inaccessible APIs + reject household on RHU patient create.
- [ ] Update RhuWalkInRegistrationTest to register without household.
- [ ] Run: `php artisan test --filter=RhuHouseholdsTest|RhuWalkInRegistrationTest|FamilyPermissionsTest|MonitoringHandoffTest|BhcHouseholdsTest`

### Task 2: Frontend — remove RHU Household UI and disable registration household

**Files:**
- Modify: `frontend/src/components/layout/sidebar/sidebarData.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/bhc/BhcPatientRegistration.jsx` and/or `AddPatient.jsx` / `RhuPatientRegistration.jsx`
- Modify: `frontend/src/utils/dashboardAccess.js`, `breadcrumbs.js`, `staffRoles.fixture.js`
- Modify: `frontend/src/utils/familyAccess.test.js` and related tests

- [ ] Remove RHU Households nav item.
- [ ] Families routes only for `bhc`.
- [ ] RHU registration: `householdEnabled={false}`; omit `household` from payload.
- [ ] Tighten dashboardAccess / breadcrumbs to BHC families only; update fixtures/tests.
- [ ] Run focused frontend tests + build.

### Task 3: Verify BHC preservation + monitoring

- [ ] Confirm BHC household tests still pass.
- [ ] Confirm MonitoringHandoffTest still passes (including RHU household detach cases).
- [ ] Report remaining risks (no live PG if AKAY_TEST_PG_URL unset).
