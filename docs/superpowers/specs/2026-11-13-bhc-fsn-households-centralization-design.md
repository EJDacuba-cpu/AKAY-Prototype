# BHC FSN Centralization in Households — Design

**Date:** 2026-11-13  
**Branch:** `Eric-Manually-Fixer`  
**Decision:** Approach 1 — gate BHC Patient Registration household/FSN UI the same way RHU already does; keep shared household implementation; centralize all editable FSN and membership workflows in the Households module.

## Goal

BHC Patient Registration (Add and Edit) works without Family Serial Number (FSN) or household assignment. All FSN creation, automatic/manual allocation, FSN editing, searching, and household membership management live exclusively in Households. Existing patients can be attached as members without creating duplicate patient records.

## Non-goals

- Do not rearrange or redesign unrelated patient registration fields or validations.
- Do not modify RHU registration beyond preserving its already-disabled household path.
- Do not change FSN format (`FSN-YYYY-NNNN`) or allocator logic.
- Do not remove FSN database fields or disable Edit Family FSN correction.
- Do not create patients inside Add Existing Member.
- Do not change clinical / medical workflows, Patient IDs, or destroy legacy drafts/rows.
- Do not commit, push, merge, deploy, or touch unrelated working-tree files.

## Root cause

Backend already treats `household` as optional for BHC `POST`/`PATCH /api/patients`. FSN dependency is **frontend-enforced**:

- `BhcPatientRegistration` sets `householdEnabled = role !== 'rhu'` (true for BHC).
- `RegistrationForm` requires a household connection via `validateConnection`.
- Save merges a structured `household` command (or risks `household: null`).
- `toPayload()` always serializes `family_serial_number` (often as `null` when the form omits the field), which is unsafe for editing household members once registration stops sending FSN.

## Architecture

| Concern | Owner |
|--------|--------|
| Patient demographics & registration fields | Patients → Add/Edit Patient |
| FSN create (auto/manual), FSN edit, membership attach/transfer | Households |
| FSN display | Patient Profile (read-only) |

```text
Add/Edit Patient  --(no household/FSN commands)-->  POST/PATCH /api/patients
Add Family        --(head + new FSN)-------------->  POST /api/bhc/households
Edit Family       --(FSN/address/head)------------>  PATCH /api/bhc/households/{id}
Add Existing Member / Transfer -------------------->  PATCH /api/patients/{id}  (household-only)
                                                      └─ Households::attach()
```

## Section 1 — BHC Patient Registration & Edit

### Behavior

1. Disable household/FSN controls for BHC Add and Edit by setting registration `householdEnabled` to `false` (same gate RHU uses). Do **not** delete `FamilyRegistryField` or shared household helpers.
2. Remove only household-required validation that blocks save without FSN. Preserve infant/mother, address, and all other non-FSN validations and field positions.
3. New BHC patient: no household attach → `household_id`, `family_serial_number`, `relationship_to_household_head` remain null.
4. Edit: never clear or change existing membership, FSN, or relationship. Omit household/FSN assignment keys from the request body.
5. Patient Profile continues to show assigned FSN (and relationship when household-locked) as read-only.
6. RHU registration remains unchanged (`householdEnabled` already false).

### Hard payload omission (acceptance criterion)

Do not rely only on `householdEnabled=false`.

| Layer | Requirement |
|-------|-------------|
| `buildPatientPayload()` | Do not include `familySerialNumber` when household is disabled. |
| `BhcPatientRegistration.save()` | Do not attach `household` or `head_replacement` for registration/edit. Never send `household: null`. |
| `toPayload()` | Include `family_serial_number` **only** when the input object explicitly owns that field (same pattern as education / parent links). Never invent `null` FSN from missing keys. Omit `household` / `head_replacement` unless a valid `kind` command is present. |
| Edit already-assigned patient | Membership/FSN/relationship unchanged; backend `attach()` not called. |

`omitParentLinks()` stays limited to its current parent-link omit behavior; it is not used to invent household commands.

### Draft safety

- Restore non-household registration fields.
- When household is disabled for registration, ignore legacy `connection`, `headReplacement`, `householdVersion`, staged FSN, and flat `payload.household` on restore — do not re-stage or submit them.
- Do not fail save because obsolete household draft keys exist.
- Do not delete server drafts or patient records.
- Preserve draft ownership / device-key recovery.

## Section 2 — Households

### Add Family (preserve)

- Search registered patients as household head; adult eligibility; block multi-member current heads until Edit Family reassigns.
- Household address fields.
- Automatic and manual FSN; uniqueness; BHC facility scoping.
- `POST /api/bhc/households` → `Households::attach(kind: new)`.

### Edit Family (preserve — FSN remains editable)

- Authorized BHC staff may correct FSN.
- Uniqueness, version/conflict handling, audit, and sync of FSN/address across all members via `PATCH /api/bhc/households/{id}`.
- Head rotation + per-member relationships unchanged.
- FSN format/allocator unchanged.

### Add Existing Member (new — replaces Register Member)

On Household Details, replace **Register Member** with **Add Existing Member** (modal). Never create a patient.

**Workflow**

1. Search registered BHC patients.
2. Explicitly select one result (never auto-attach on name match).
3. Show identity + current household/FSN (or “No household assigned”).
4. Select relationship to this household’s head (existing labels/semantics).
5. Review source → destination FSN, relationship, address sync.
6. Confirm → household-only `PATCH /api/patients/{id}` via `changeHouseholdPayload` → `Households::attach(kind: existing)`.

**Candidate search (acceptance criterion)**

- Authorize `GET /api/bhc/households/candidates` for users with **`patients.register` OR `families.manage`** (read-only search alignment with membership attach). Preserve existing `families.manage` access.
- Keep BHC facility scoping and minimum necessary identity fields (`PatientIdentity::householdResponse`); no clinical/PhilHealth/guardian secrets.
- Do not grant additional write permissions. Household create/update remain `families.manage`; attach remains `patients.register`.
- Search: case-insensitive partial/full name across first, middle, last, and concatenated full name; exact patient ID when query is numeric.
- UI shows name, patient ID, birthdate, current FSN/household before selection.

**Transfer / stale membership (acceptance criterion)**

| State | Behavior |
|-------|----------|
| No household | Assign to destination + relationship; address sync via `attach()`. |
| Already in this household | Block with clear message. |
| Already in another household | Controlled transfer: review source and destination FSNs, relationship, address change. |
| Head of multi-member source | Preserve head-replacement and archival rules; collect replacement via existing review pattern, or block with “Assign a new head in Edit Family first” when replacement cannot be completed safely in-modal. |
| Before commit | Re-fetch patient and destination household; reject if patient identity/source membership changed or destination `version` stale (409/refresh messaging). |

**Relationship integrity**

- Do not auto-create parent/guardian graph links merely because of membership.
- Keep existing explicit confirmation rules; Add Existing Member PATCH aligns with Transfer (no new parent-link side effects beyond current `confirmLink` PATCH rules).

**Routing**

- Details CTA: **Add Existing Member**.
- Legacy `/{role}/families/:householdId/members/new` (`BhcAddMember`): redirect to Household Details with optional `?addMember=1` to open the modal.
- `patients/add?household=` becomes inert once registration household is disabled.

### Unchanged Household surfaces

Members list, family tree, Transfer Household modal, directory search, Patient Profile read-only FSN.

## Section 3 — Data preservation

Never change patient IDs. Household assignment updates only household-related fields and address fields already synchronized by `Households::attach()` / Edit Family. Preserve demographics, parent/guardian information, clinical records, consultations, referrals, monitoring requests, follow-ups, existing membership/FSN, and relationship semantics. No destructive migrations.

## Testing

See implementation plan for file-level cases. Required scenarios:

1. Register BHC patient without FSN.  
2. Register infant without FSN; mother-information rules preserved.  
3. Edit patient with FSN — membership unchanged; no household/FSN commands in body.  
4. Edit patient without FSN.  
5–8. Add Family; auto FSN; manual FSN; duplicate FSN rejected.  
9–11. Add Existing Member; no duplicate patient; correct relationship.  
12–13. Controlled transfer; invalid head transfer blocked.  
14. Address sync preserved.  
15. Legacy draft restores demographics without applying household.  
16. Candidates searchable with `patients.register`; BHC-only; min data.  
17. Family tree / members / details still work.  
18. RHU registration unchanged.  
+ Payload audit: Add/Edit omit `household`, `family_serial_number`, `head_replacement`.  
+ Candidates: partial/full name + ID; explicit selection only.  
+ Stale source membership / destination version rejected.

Verification: focused frontend tests, focused backend Feature tests, production frontend build.

## Remaining risks / blockers before implementation

| Item | Notes |
|------|--------|
| Branch dirt | Unrelated modified files on `Eric-Manually-Fixer` must not be staged or overwritten. |
| `toPayload` FSN null | Must fix omit-if-absent before/with registration gate or member Edit breaks (422). |
| Head-replacement in Add Member modal | Prefer full review when feasible; otherwise block and direct to Edit Family — server rules still enforce. |
| Full-name SQL matching | May need iteration for multi-space / suffix edge cases. |
| Address on registration Edit | After removing household UI, address may be editable; backend household address/FSN guards remain the safety net; structural address changes stay Edit Family. |
| No live PG concurrency | `HouseholdFsnPostgresConcurrencyTest` may skip without `AKAY_TEST_PG_URL`. |

## Acceptance

- BHC Add/Edit Patient has no FSN/household assignment UI and succeeds without FSN.
- Edit never clears/changes existing membership/FSN/relationship.
- FSN create/edit/search/membership centralized in Households; Edit Family FSN editing preserved.
- Add Existing Member attaches existing patients only (no duplicates).
- Candidates permission aligned with `patients.register` (+ existing `families.manage`); stale attachment rejected.
- Legacy drafts do not silently re-apply household; non-household fields preserved.
- RHU registration and unrelated registration fields unchanged.
- No commit/push/merge/deploy in this workstream unless the user later requests it.
