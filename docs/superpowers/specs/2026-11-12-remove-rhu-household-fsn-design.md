# Remove RHU Household / FSN — Design

**Date:** 2026-11-12  
**Branch:** `Eric-Manually-Fixer`  
**Decision:** Hard cut B — remove RHU household product surface and `/api/rhu/households*`; preserve BHC and legacy DB rows.

## Goal

RHU no longer manages households or generates FSNs. BHC Household/FSN remains fully operational. Shared patient identity and monitoring handoffs continue to work. Existing RHU household rows are not deleted.

## Non-goals

- No BHC UI/API/behavior changes.
- No dropping of `patients_household_facility_exclusive` or related constraints.
- No destructive data migration in this change set.
- No redesign of registration layout beyond removing RHU household/FSN controls.

## Architecture

Household/FSN is a shared stack with dual namespaces. Cut RHU at the product and write boundaries:

1. **Frontend:** Remove RHU Households nav and `/rhu/families*` routes. RHU registration disables household/FSN (`householdEnabled={false}`); BHC path unchanged.
2. **Backend routes:** Delete `/api/rhu/households*` group so those endpoints 404.
3. **Patient writes:** RHU `POST/PATCH /api/patients` rejects any `household` attach/create payload (422). Do not call `Households::attach` for RHU users.
4. **Permissions:** Remove `families.view` / `families.manage` from RHU staff available sets.
5. **Shared services:** Keep `HouseholdController`, `Households`, `HouseholdOwner`, allocators, and BHC `/api/bhc/households*` intact.
6. **Legacy data:** Leave existing RHU `household_id`, `family_serial_number`, heads, and relationships in place.
7. **Handoff:** Keep `MonitoringHandoffService::detachRhuHouseholdIfNeeded` so Scenario A can assign BHC without violating exclusive membership; Scenario B unchanged.

## Frontend details

- `sidebarData.js`: remove RHU `{ label: "Households", path: "/rhu/families" }`.
- `App.jsx`: stop registering RHU families routes (keep BHC).
- RHU registration (`RhuPatientRegistration` / `BhcPatientRegistration role="rhu"` / `RegistrationForm`): `householdEnabled={false}`; never send `household` payload.
- Shared components stay; gating is role-specific.
- Drafts/recovery continue for non-household fields.

## Backend details

- `routes/api.php`: remove RHU households route group.
- `PatientController` / request validation: if actor is RHU, reject household keys; never allocate RHU FSN on create/update.
- `StaffRoles` (and related permission catalogs): RHU cannot be granted `families.*`.
- Leave `allocate_rhu_household_fsn.sql` and RHU columns in DB (unused for new writes).

## Monitoring compatibility

- **Scenario A (RHU walk-in → BHC):** Register without household → Manage to BHC → BHC register-source reuses Patient ID; detach legacy RHU household if present before BHC assign.
- **Scenario B (BHC → RHU → BHC):** Original BHC household/FSN untouched; link/reuse existing patient; no duplicate.

## Testing

- Retarget `RhuHouseholdsTest` to assert inaccessible APIs.
- RHU registration without household/FSN + walk-in still works.
- BHC household/FSN suites still pass unchanged in intent.
- MonitoringHandoff tests (including detach) still pass.
- No production data mutation; no commit/push in this workstream unless explicitly requested later.

## Acceptance

- RHU has no Household/FSN management UI or APIs.
- RHU registration cannot create/attach households.
- BHC Household/FSN unchanged and verified.
- Legacy RHU household rows preserved.
- Shared Patient ID preserved; no constraint bypass.
