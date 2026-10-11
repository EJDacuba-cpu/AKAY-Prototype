# Create Account Rework — Design

**Date:** 2026-10-11
**Status:** Draft, awaiting review
**Branch:** `Rework-Patch-AKAY-1.0`
**Scope:** Project 1 of 4 in the account and access roadmap (see "Out of scope").

Goal: make the admin Create/Edit Account flow fill its first screen, and remove the duplicate questions between "Professional designation" and "Access & Permissions". The admin picks where the account works, enters personal details, then picks one **role**. The role pre-ticks a full checklist of AKAY duties, which the admin may freely change.

All UI text is English.

---

## A. Decisions

| # | Decision |
|---|---|
| D1 | Five staff roles: **Midwife**, **BHW**, **Encoder** (BHC accounts) and **Nurse**, **Doctor** (RHU accounts). Admin accounts have no staff role. |
| D2 | Inventory is a **duty**, not a role. Any role can be given inventory duties. |
| D3 | `professional_designation` is removed completely (column, UI, code). It is replaced by a new `staff_role` column. Current data is test data only. |
| D4 | The existing `users.role` column keeps its values (`admin`, `bhw`, `rhu_staff`) and meaning: the **facility tier**. Renaming those values is a separate cleanup project done right after this one. |
| D5 | The admin may grant **any duty** that works at the account's facility, including licensed duties (finalize, correct records, submit referrals, confirm conditions) for BHW or Encoder. There are no per-override acknowledgements. |
| D6 | One general confirmation at Review: *"I have reviewed all access listed above and authorize this account to perform them."* |
| D7 | The checklist only shows duties that work at the chosen facility type. It has no locked rows and no access preview. |
| D8 | The contact number is required, in PH mobile format: `09` followed by 9 digits. |
| D9 | Encoder is BHC-only for now. RHU consultation is planned but not yet built. Role-to-facility rules are data-driven, so Encoder can later be opened to RHU by changing data rather than restructuring code. |
| D9a | Focus is the Create/Edit Account flow and the BHC roles. RHU roles keep today's duties unchanged (provisional, section B3). |
| D9b | Role rules have one copy only, in the backend, served to the frontend by `GET /staff-roles`. |
| D10 | The Nurse-only rule in Staff Assignments stays. It now reads `staff_role = 'nurse'`. |

---

## B. Data model

### B1. Migration
One migration on `users`:
1. Add `staff_role` as a nullable string with a check constraint: `staff_role IN ('midwife','bhw','encoder','nurse','doctor')`.
2. Add `contact_number` as a nullable `string(11)`. It is nullable at the database level so existing rows survive. The application requires it on create and update (section C2).
3. Backfill: `staff_role = lower(trim(professional_designation))` where that value is in the five roles. Every other value (Logistics, MHO, Other, blank) becomes `NULL`.
4. Drop `professional_designation`.

`down()` re-adds `professional_designation`, copies `staff_role` back with title case, and drops the two new columns.

### B2. Role definitions (single source of truth)
These live **only** in a backend class `App\Services\StaffRoles`. The frontend never keeps its own copy: it loads them from `GET /staff-roles` (section C5), so there is nothing to keep in sync.

| `staff_role` | Label | Facility tiers | Licensed | Default duties |
|---|---|---|---|---|
| `midwife` | Midwife | `bhw` | yes | patients.register, consultations.encode, consultations.finalize, clinical.history, records.correct, followups.manage, referrals.submit, inventory.view, items.dispense, reports.view |
| `bhw` | BHW | `bhw` | no | patients.register |
| `encoder` | Encoder | `bhw` | no | patients.register, consultations.encode, inventory.view |
| `nurse` | Nurse | `rhu_staff` | yes | patients.register, clinical.history, rhu.manage, conditions.confirm, inventory.view, reports.view |
| `doctor` | Doctor | `rhu_staff` | yes | same as nurse |

### B3. Duties available per facility tier
Only these duties may be granted. Anything else is rejected with a 422.

| Tier | Available duties |
|---|---|
| `bhw` (BHC) | patients.register, consultations.encode, consultations.finalize, clinical.history, records.correct, followups.manage, referrals.submit, inventory.view, inventory.manage, items.dispense, reports.view |
| `rhu_staff` (RHU, provisional) | patients.register, clinical.history, inventory.view, reports.view, rhu.manage, conditions.confirm |

**RHU is provisional.** The RHU module is not finished, so this project does no RHU work. The Nurse and Doctor defaults and the RHU available duties are copied from what RHU accounts get today (the current `rhu` preset), and no RHU screens are checked or changed. Nurse and Doctor accounts must still be creatable, because Staff Assignments depends on them. Revisit this table when the RHU module is finished.

The existing prerequisite rules (`REQUIRES`) stay unchanged. For example, finalizing requires `clinical.history`, and managing stock requires `inventory.view`.

---

## C. Backend

### C1. `ActionPermissions.php`
- **Remove:** `PRESETS`, `CLINICAL_DESIGNATIONS`, `isClinical`, `scope`, `overrides`, `overrideTier`.
- **Keep:** `ALL`, `REQUIRES`, `LICENSED`, `missingRequirements`, `allows`, `ensure`, `bhcRecipients`.
- `home()` fallback for `permissions === null` uses the role defaults when `staff_role` is set. Otherwise it keeps today's tier fallback (BHC → encoder defaults, RHU → nurse defaults).
- `SENSITIVE` and `RHU_ONLY` are removed if nothing else reads them. Their job moves to `StaffRoles` (available duties per tier).

### C2. `UserRequest.php`
- Remove `professional_designation`, `acknowledged_overrides` and `acknowledged_overrides.*`.
- Add:
  - `staff_role`: `nullable`, in the five roles. Required unless `role` is `admin`. It must be one of the roles allowed for the request's `role` tier, otherwise 422 *"A Nurse account must be based at a Rural Health Unit."* (message names the role and tier).
  - Admin accounts: `staff_role` must be null.
  - `contact_number`: required, matching `/^09\d{9}$/`. On update it uses `sometimes` together with `required`.
  - `password`: add `confirmed` (expects `password_confirmation`).
- `permissions.*` must be in the tier's available duties (B3). Error: *"{duty} is not available to {BHC|RHU} accounts."*
- Keep `permissions_confirmed` (`required_with:permissions`, `accepted`). It now carries the single Review checkbox.
- Keep the existing admin, facility and prerequisite rules.

### C3. `UserController.php`
- `securityContextChanged` treats `staff_role` as a security field, in place of `professional_designation`.
- `accessAudit()` logs added and removed duties as today. When a non-licensed role holds licensed duties, it appends: *"Licensed duties granted to a non-licensed role (Encoder): consultations.finalize, referrals.submit."*

### C4. Other readers
- `NurseAssignmentPolicy` and `StaffAssignmentController::eligible` filter on `staff_role = 'nurse'`.
- `AuthController` returns `staff_role` and `contact_number` in place of `professional_designation`.

### C5. `GET /staff-roles` (admin only)
- Registered in the `role:admin` route group. Returns the `StaffRoles` data:
  ```json
  { "data": {
      "roles": [{ "key": "midwife", "label": "Midwife", "tier": "bhw", "licensed": true, "defaults": ["patients.register", "..."] }],
      "available": { "bhw": ["patients.register", "..."], "rhu_staff": ["..."] }
  } }
  ```
- `StaffRoles` exposes the same data to `UserRequest` validation, so the screen and the server always use one copy.
- Duty labels, notes, groups and `REQUIRES` stay in the existing frontend `PERMISSION_CATALOG`. Only role rules move to the API.
- `User` fillable: replace `professional_designation` with `staff_role` and `contact_number`.

---

## D. Frontend: Create and Edit Account (`pages/admin/AddUser.jsx`)

Steps for staff accounts: **Facility → Personal Details → Role & Access → Review & Create**.
Steps for admin accounts: **Facility → Personal Details → Review & Create**.

The page loads `GET /staff-roles` together with the facility lists. If that request fails, the page shows the error and blocks Continue, as it does today when facilities fail to load.

### D1. Facility
- Heading: "Where will this account work?"
- Three cards, each with an icon and a name only (no counts, no role names): **Barangay Health Center**, **Rural Health Unit**, **Municipal Health Officer**.
- When a BHC or RHU card is picked, a searchable select appears in the same step: "Which Barangay Health Center?" or "Which Rural Health Unit?". It lists active facilities of that type only.
- Municipal Health Officer: show "Municipal Health Officer accounts are not tied to a facility." Saving uses `role = admin`.
- Validation: a staff account needs a facility.

### D2. Personal Details
- Full name, Email, Contact number (placeholder `09XX XXX XXXX`), Password, Confirm password. Password fields have a show/hide toggle.
- Edit mode: the password fields are optional, with the helper text "Leave blank to keep the current password."
- Client checks mirror the server: valid email, `09` plus 9 digits, at least 8 characters, and the two passwords match.

### D3. Role & Access
- **Role:** cards for the roles allowed at the chosen tier (BHC: Midwife, BHW, Encoder. RHU: Nurse, Doctor). Picking a role ticks its default duties.
- **Access:** header "Access · {n} of {available} selected" and a "Reset to role defaults" action. Duties are grouped by module in cards: two columns on desktop, one column on phone. Each row shows the label and its one-line note from `PERMISSION_CATALOG`.
- Only duties available at the tier are shown (B3).
- Chips (informational only):
  - **Added**: ticked but not in the role defaults.
  - **Licensed**: a licensed duty ticked for a non-licensed role.
- Prerequisite behavior is unchanged: ticking a duty also ticks what it requires, and unticking a requirement unticks the duties that depend on it.
- Switching role after the admin has changed the checklist asks first: "Replace current access with {Role} defaults?" with Cancel and Replace.
- Validation: a role is required, and at least one duty must be selected.
- **Removed from this step:** `PresetPicker`, `AccessPreview` and the "Additional Permissions · overrides" section of `PermissionMatrix`.

### D4. Review & Create / Review & Save
- A summary of the details: facility, name, email, contact number, role, and credentials (password hidden).
- Staff accounts: duties grouped by module, with **Added**, **Removed** (edit mode, compared with the saved access) and **Licensed** chips.
- One checkbox (D6). The submit button stays disabled until it is ticked.
- Admin accounts: details only. The checkbox still applies.

### D5. Edit mode
- The same steps, prefilled.
- Changing the facility type (BHC ↔ RHU, or staff ↔ Municipal Health Officer) asks first: "Changing the facility type will clear this account's role and access. Continue?" After confirming, the role and duties are cleared.
- Changing to another facility of the **same** type keeps the role and duties.
- An old account with no `staff_role` must pick a role before saving. The Role & Access step blocks Continue until a role is chosen.

### D6. Shared review component
`PermissionReviewSummary` and `PermissionReviewDialog` drop the override and critical callouts and the extra checkboxes, keeping only the single confirmation. `StaffAssignments.jsx` (Nurse → BHC duty assignment) uses the simplified dialog. Its confirm text there reads *"I have reviewed all duties listed above and authorize this assignment."*

---

## E. Frontend: Account Directory (`pages/admin/UserManagement.jsx`)
- The directory also loads `GET /staff-roles`, so labels and default comparisons come from the same API data.
- Rewrite `accessSummary` in `utils/accountSetup.js` to take the staff-roles data as an argument:
  - Admin: "Municipal Health Officer".
  - Staff whose duties match the role defaults: the role label, e.g. "Midwife".
  - Staff whose duties differ: "Midwife · Custom (+1, −2)", counting duties added and removed against the defaults.
  - Staff with no role: "Role not set".
- Show the contact number in the account details.

---

## F. Code removed
- `components/features/access/PresetPicker.jsx`.
- `components/features/access/AccessPreview.jsx`, if nothing else imports it. `ModuleGate`, `RestrictedArea` and `LockedPlaceholder` stay, because they are used elsewhere and are needed for the Locked UI project.
- In `utils/accessPolicy.js`: `designationScope`, `overrideTier`, `isClinicalDesignation`, `facilityNote`, preset helpers, and the override parts of `reviewPermissions`.
- In `utils/actionPermissions.js`: `PERMISSION_PRESETS`, `CLINICAL_DESIGNATIONS`, `SENSITIVE_PERMISSIONS`, `RHU_ONLY_PERMISSIONS`, as long as nothing else uses them.
- `suggestedPreset` and `compatiblePermissions` in `utils/accountSetup.js`.
- Every `professional_designation` reference in frontend and backend, including tests.

---

## G. Testing

**Backend (PHPUnit feature tests)**
- Migration backfill: Midwife, Nurse, Doctor, Encoder and BHW map to `staff_role`. Logistics, MHO, Other and blank map to NULL. The column is dropped.
- `UserRequest`:
  - A role/tier mismatch is rejected (Nurse at a BHC, Midwife at an RHU, Encoder at an RHU).
  - Admin with a `staff_role` is rejected.
  - A bad contact number is rejected (`0917123456`, `+639171234567`, `08171234567`).
  - A password confirmation mismatch is rejected.
  - A duty unavailable at the tier is rejected (`rhu.manage` on a BHC account, `consultations.encode` on an RHU account).
  - A licensed duty on an Encoder is accepted without any acknowledgement field.
  - A missing `permissions_confirmed` is rejected.
- Audit log: contains the licensed-duty line for an Encoder with `consultations.finalize`, and has no such line for a Midwife.
- Staff Assignments: only `staff_role = nurse` RHU accounts are eligible.
- Update or delete the tests that rely on designations and overrides: `PermissionOverrideTest`, `ApprovedFacilityPermissionsTest`, `AccountFacilityRevisionTest`, `PatientCreationPermissionsTest`, `RhuConditionConfirmationTest`, `RhuProviderAvailabilityTest`, `HouseholdParentLinkTest`. These should set `staff_role` where they set a designation.

**Frontend (Vitest)**
- Helpers are tested with a small sample of staff-roles data passed in as an argument (no network).
- Access helpers: role switch resets to defaults, Added, Removed and Licensed chip logic, and `accessSummary` labels.
- Rewrite `accessPolicy.test.js` and `accountSetup.test.js` for the new rules.

**Manual check:** create one account of each kind (Midwife, BHW, Encoder, Nurse, Doctor, Municipal Health Officer). Edit one account to change facility type. Assign an RHU nurse to a BHC.

---

## Out of scope (later projects, in order)
1. **Naming cleanup:** rename `users.role` values `bhw` → `bhc` and `rhu_staff` → `rhu` everywhere, including Postgres stored functions.
2. **Locked UI:** sidebar items stay clickable with a lock icon and open a "No access" page. Locked section cards inside modules render placeholders and never contain CSS-blurred real data. This builds on the existing `ModuleGate`.
3. **Admin delegation:** granting account-management duties to trusted staff. Not confirmed; needs its own brainstorming first.
4. Opening Encoder (and RHU consultation duties) to RHU accounts once RHU consultation exists.
