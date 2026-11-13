# BHC FSN Centralization in Households — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove FSN/household assignment from BHC Add/Edit Patient while centralizing FSN create/edit and existing-patient membership in Households (Add Existing Member), without changing unrelated registration fields or RHU registration.

**Architecture:** Approach 1 — set registration `householdEnabled` false for BHC (same gate as RHU); hard-omit household/FSN commands from registration payloads; extend candidates search permissions + name/ID matching; replace Register Member with Add Existing Member modal using household-only `PATCH` → `Households::attach()`.

**Tech Stack:** Laravel API (`HouseholdController`, `Households`, `PatientController`), React + TanStack Query (`BhcFamilies`, `AddPatient`, `BhcPatientRegistration`), existing `changeHouseholdPayload` / `TransferHouseholdModal` patterns.

## Global Constraints

- Work only on `Eric-Manually-Fixer` inside `AKAY-Prototype/`.
- Strict scope: FSN and household membership workflow only.
- Do not modify, remove, rename, relocate, or redesign unrelated patient registration fields.
- Do not modify RHU registration behavior.
- Do not change Patient IDs, FSN format, clinical workflows, or destroy drafts/records.
- Do not introduce patient creation inside Add Existing Member.
- No destructive database migrations.
- No unrelated refactoring.
- **Do not commit, push, merge, or deploy** unless the user explicitly asks later.
- Preserve unrelated working-tree changes currently present on the branch.

**Spec:** `docs/superpowers/specs/2026-11-13-bhc-fsn-households-centralization-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/Http/Controllers/Api/HouseholdController.php` | Candidates permission + search matching |
| `backend/tests/Feature/BhcHouseholdsTest.php` (and/or new focused test) | Candidates permission, search, BHC create without household |
| `backend/tests/Feature/FamilyPermissionsTest.php` | Permission matrix if needed |
| `frontend/src/utils/patientRegistrationPayload.js` | `toPayload` omit FSN unless explicit; draft restore ignores household when gated |
| `frontend/src/pages/bhc/BhcPatientRegistration.jsx` | `householdEnabled = false` for registration; no household merge on save |
| `frontend/src/pages/bhc/AddPatient.jsx` | No household UI/validation when disabled; payload omit; draft restore inert household |
| `frontend/src/pages/bhc/BhcFamilies.jsx` | CTA + `BhcAddMember` redirect; wire modal |
| `frontend/src/components/features/families/AddExistingMemberModal.jsx` | **Create** — search, select, review, attach |
| `frontend/src/utils/addExistingMember.js` (optional) | Pure helpers: eligibility, stale checks, payload |
| `frontend/src/services/householdService.js` | Unchanged API path; verify candidates client |
| Tests: `patientRegistrationPayload` / `RegistrationRegression` / modal unit / backend Feature | Coverage |
| Patient Profile `RegistrationSections.jsx` | **Do not change** read-only FSN display (verify only) |

---

### Task 1: Hard-omit household/FSN from registration payloads

**Files:**
- Modify: `frontend/src/utils/patientRegistrationPayload.js`
- Modify: `frontend/src/utils/patientRegistrationPayload.test.js` (create if missing; else extend)
- Modify: `frontend/src/pages/bhc/AddPatient.jsx` (`buildPatientPayload` only as needed)
- Modify: `frontend/src/pages/bhc/BhcPatientRegistration.jsx`

**Interfaces:**
- Produces: `toPayload(patient)` includes `family_serial_number` only when `Object.hasOwn(patient, 'familySerialNumber')` or `Object.hasOwn(patient, 'family_serial_number')` and value is intentionally set; never defaults missing keys to `null` FSN. Includes `household` / `head_replacement` only for valid commands.
- Produces: BHC registration `save()` never sets `household` / `head_replacement`.
- Consumes: `householdEnabled` false path in form.

- [ ] **Step 1: Write failing tests for omit-if-absent FSN**

```js
import { toPayload } from './patientRegistrationPayload';

test('toPayload omits family_serial_number when form did not send the field', () => {
  const body = toPayload({ firstName: 'Ana', lastName: 'Cruz', sex: 'Female' });
  expect(body).not.toHaveProperty('family_serial_number');
  expect(body).not.toHaveProperty('household');
  expect(body).not.toHaveProperty('head_replacement');
});

test('toPayload keeps explicit family_serial_number when provided', () => {
  const body = toPayload({ firstName: 'Ana', lastName: 'Cruz', sex: 'Female', familySerialNumber: 'FSN-2026-0001' });
  expect(body.family_serial_number).toBe('FSN-2026-0001');
});
```

- [ ] **Step 2: Run test — expect FAIL** (current code always sets `family_serial_number: null`)

Run: `cd frontend && npm test -- --run patientRegistrationPayload`

- [ ] **Step 3: Implement omit-if-absent in `toPayload`**

Replace unconditional `family_serial_number: optional(...)` with the education-style pattern:

```js
const fsnKeys = ['familySerialNumber', 'family_serial_number'];
if (fsnKeys.some((key) => Object.hasOwn(patient, key) && patient[key] !== undefined)) {
  payload.family_serial_number = optional(...fsnKeys);
}
if (hasHouseholdCommand) delete payload.family_serial_number;
```

Keep `household` / `head_replacement` only when present with valid kind / replacement object (existing guard).

- [ ] **Step 4: Gate BHC registration household**

In `BhcPatientRegistration.jsx` `RegistrationSource`:

```js
// FSN and membership are managed only in Households. Shared FamilyRegistryField stays for dormant gating.
const householdEnabled = false;
```

Ensure `save()` when `!householdEnabled` spreads patient data only — never `household: null`.

In `AddPatient.jsx` `buildPatientPayload()`, keep:

```js
...(householdEnabled ? { familySerialNumber: form.familySerialNumber || null } : {}),
```

When disabled, do not add FSN keys at all.

- [ ] **Step 5: Draft restore ignores household when disabled**

In `RegistrationForm` restore path: if `!householdEnabled`, restore form fields but force `householdConnection = null`, `headReplacement = null`, do not call `onRecoveryHouseholdChange` with a household id, and do not set `householdReviewPending` from legacy connection.

Optionally harden `restoreRegistrationDraft` consumers rather than deleting snapshot keys (back-compat).

- [ ] **Step 6: Re-run payload/draft tests — expect PASS**

- [ ] **Step 7: Do not commit** (user constraint)

---

### Task 2: Remove FSN UI/validation from BHC Add/Edit Patient (gate only)

**Files:**
- Modify: `frontend/src/pages/bhc/AddPatient.jsx` (validation + success/confirm copy already gated — verify)
- Modify: `frontend/src/pages/bhc/RegistrationRegression.test.js`
- Verify: `frontend/src/components/features/patients/profile/RegistrationSections.jsx` unchanged for read-only FSN

**Interfaces:**
- Consumes: `householdEnabled === false` from Task 1.
- Produces: Save succeeds without connection; unrelated validators unchanged.

- [ ] **Step 1: Extend regression tests**

```js
test('BHC registration save does not require household when householdEnabled is false', async () => {
  // Render RegistrationForm with householdEnabled={false}, live, minimal valid adult (or infant+mother) fields
  // Submit → savePatient called with data that has no household / familySerialNumber
});
```

Cover infant mother rules still failing without mother info and passing with mother info, without FSN.

- [ ] **Step 2: Confirm UI**

With `householdEnabled={false}`: no `FamilyRegistryField`; no household review modal; confirm copy is “Save this patient's details?”; success modal does not require FSN.

Do **not** rearrange other sections.

- [ ] **Step 3: Run frontend registration tests**

Run: `cd frontend && npm test -- --run RegistrationRegression FamilyRegistryField patientRegistrationPayload`

- [ ] **Step 4: Do not commit**

---

### Task 3: Backend candidates permission + search improvements

**Files:**
- Modify: `backend/app/Http/Controllers/Api/HouseholdController.php` (`candidates`)
- Modify: `backend/tests/Feature/BhcHouseholdsTest.php`
- Modify: `backend/tests/Feature/FamilyPermissionsTest.php` (if it asserts manage-only for candidates)

**Interfaces:**
- Produces: `candidates` allowed when `ActionPermissions::allows($user, 'patients.register') || ActionPermissions::allows($user, 'families.manage')`.
- Produces: search matches first/middle/last (LOWER LIKE), concatenated full name, and exact `id` when numeric.
- Produces: response still `PatientIdentity::householdResponse($patient, true)` (includes birthdate + nested household).

- [ ] **Step 1: Write failing permission + search tests**

```php
public function test_candidates_are_readable_with_patients_register(): void
{
    $this->staff($local, ['patients.register']);
    $this->getJson('/api/bhc/households/candidates?search=')
        ->assertOk();
}

public function test_candidates_match_partial_full_name_and_patient_id(): void
{
    // seed patient Maria Santos id=N
    $this->staff($local, ['patients.register']);
    $this->getJson('/api/bhc/households/candidates?search=maria san')
        ->assertOk()
        ->assertJsonPath('data.0.id', $patient->id);
    $this->getJson('/api/bhc/households/candidates?search='.$patient->id)
        ->assertOk()
        ->assertJsonPath('data.0.id', $patient->id);
}
```

Assert response still lacks medical_background / philhealth / guardian_contact.

- [ ] **Step 2: Run — expect FAIL on register-only permission**

Run: `cd backend && php artisan test --filter=test_candidates`

- [ ] **Step 3: Implement permission**

```php
abort_unless(
    ActionPermissions::allows($request->user(), 'patients.register')
        || ActionPermissions::allows($request->user(), 'families.manage'),
    403
);
```

Replace the current manage-only `ensure`.

- [ ] **Step 4: Implement search**

Within the existing `if ($search = trim(...))` block:

- Keep LOWER LIKE on `first_name`, `middle_name`, `last_name`, `family_serial_number`.
- Add concatenated full-name match, e.g. `LOWER(TRIM(CONCAT_WS(' ', first_name, middle_name, last_name))) LIKE ?`.
- If `ctype_digit($search)`, also `orWhere('id', (int) $search)`.

Do not broaden response fields.

- [ ] **Step 5: Run BhcHouseholds + FamilyPermissions focused tests — expect PASS**

Run: `cd backend && php artisan test --filter=BhcHouseholdsTest|FamilyPermissionsTest`

- [ ] **Step 6: Do not commit**

---

### Task 4: Add Existing Member modal + Household Details CTA

**Files:**
- Create: `frontend/src/components/features/families/AddExistingMemberModal.jsx`
- Create: `frontend/src/components/features/families/AddExistingMemberModal.test.js` (and/or pure helper tests)
- Optional create: `frontend/src/utils/addExistingMember.js`
- Modify: `frontend/src/pages/bhc/BhcFamilies.jsx` (`BhcFamilyDetails`, `BhcAddMember`)
- Reuse: `changeHouseholdPayload`, `changePatientHousehold`, `getHouseholdCandidates`, `getHouseholdById`, `getPatientById` (or candidates row), `RELATIONSHIP_LABELS`, `validateConnection`, head-departure helpers from `familyRegistry.js`

**Interfaces:**
- Consumes: `household` (destination with `id`, `version`, `serialNumber`, `headPatientId`, `members`), `role`, `onClose`.
- Produces: household-only PATCH body via `changeHouseholdPayload({ kind:'existing', householdId, relationship }, registry, replacement|null)`.
- Never calls `createPatient`.

- [ ] **Step 1: Pure helper tests (eligibility / stale)**

```js
test('blocks patient already in destination household', () => {
  expect(addMemberBlockReason(patientInDest, dest)).toMatch(/already/i);
});

test('requires head replacement when leaving as multi-member head', () => {
  // or returns block directing to Edit Family
});
```

- [ ] **Step 2: Implement modal UX**

Steps inside modal (mirror `TransferHouseholdModal` layout patterns):

1. Search input + Search button → `getHouseholdCandidates(query, role)`.
2. List results: name, id, birthdate, current FSN / “No household assigned”. Buttons select explicitly.
3. Relationship `<Select>` from `RELATIONSHIP_LABELS` / `isAcceptedLabel`.
4. Review panel: patient identity, source FSN → destination FSN, relationship, note that address will sync from household.
5. Confirm:
   - Re-fetch destination `getHouseholdById(household.id, role)` — version must match.
   - Re-fetch patient (or compare candidates/`getPatientById`) — `household_id` / membership must match the reviewed source (null or same source id).
   - If stale → message to close/retry; do not PATCH.
   - If head departure needs replacement → either collect via existing review UI or block with Edit Family message.
   - Else `changePatientHousehold(patientId, changeHouseholdPayload(...))`.
6. Invalidate household + patients query keys; toast success; `onClose`.

- [ ] **Step 3: Wire Household Details**

Replace Register Member link:

```jsx
{access.can('patients.register') && (
  <Button type="button" variant="brand" onClick={() => setAddingMember(true)}>
    <Plus size={17}/>Add Existing Member
  </Button>
)}
{addingMember && (
  <AddExistingMemberModal role={role} household={item} onClose={() => setAddingMember(false)} />
)}
```

- [ ] **Step 4: Fix legacy route**

```js
export function BhcAddMember({ role = 'bhc' } = {}) {
  const { householdId } = useParams();
  return <Navigate replace to={`/${role}/families/${householdId}?addMember=1`} />;
}
```

In details, `useSearchParams`: if `addMember=1` and `patients.register`, open modal once and clear param.

- [ ] **Step 5: Run modal + families-related frontend tests**

- [ ] **Step 6: Do not commit**

---

### Task 5: Backend coverage for registration-without-FSN + attach without duplicate

**Files:**
- Modify/extend: `backend/tests/Feature/BhcHouseholdsTest.php`
- Modify/extend: `backend/tests/Feature/ChangeHouseholdCommandTest.php`
- Optionally: `backend/tests/Feature/PatientEducationTest.php` (already proves create without household — keep green)
- Modify/extend: `backend/tests/Feature/HouseholdMemberAddressGuardTest.php` if edit-without-FSN-key needs assertion

- [ ] **Step 1: Tests**

```php
public function test_bhc_can_register_patient_without_household_or_fsn(): void
{
    $this->staff(null, ['patients.register']);
    $this->postJson('/api/patients', [/* minimal valid BHC patient, no household key */])
        ->assertCreated()
        ->assertJsonPath('data.household_id', null)
        ->assertJsonPath('data.family_serial_number', null);
}

public function test_patch_without_household_preserves_membership(): void
{
    // create household member, PATCH name only (no household, no family_serial_number key)
    // assert household_id and family_serial_number unchanged
}

public function test_attach_existing_patient_to_household_does_not_create_patient(): void
{
    $before = Patient::count();
    // PATCH household kind existing
    $this->assertSame($before, Patient::count());
}
```

Stale destination version → 409 (existing coverage — verify still passes).

- [ ] **Step 2: Implement only if any assertion fails due to product bugs** (backend attach already exists; prefer frontend + permission tasks)

- [ ] **Step 3: Run**

`cd backend && php artisan test --filter=BhcHouseholdsTest|ChangeHouseholdCommandTest|HouseholdMemberAddressGuardTest|PatientEducationTest|ParentGuardianWorkflowTest|RhuHouseholdsTest|RhuWalkInRegistrationTest`

- [ ] **Step 4: Do not commit**

---

### Task 6: Verification matrix + production build

**Files:** none beyond fixes for failures

- [ ] **Step 1: Run frontend production build**

`cd frontend && npm run build`

- [ ] **Step 2: Manual/automated checklist (record pass/fail)**

| # | Scenario | Pass? |
|---|----------|-------|
| 1 | Register BHC patient without FSN | |
| 2 | Infant without FSN; mother rules intact | |
| 3 | Edit patient with FSN; membership unchanged; body omits household/FSN | |
| 4 | Edit patient without FSN | |
| 5 | Add Family eligible adult | |
| 6 | Automatic FSN | |
| 7 | Manual FSN | |
| 8 | Duplicate FSN rejected | |
| 9 | Add Existing Member | |
| 10 | No duplicate patient | |
| 11 | Correct relationship | |
| 12 | Transfer from other household | |
| 13 | Invalid head transfer blocked | |
| 14 | Address sync | |
| 15 | Legacy draft ignores household | |
| 16 | `patients.register` candidates + BHC scope | |
| 17 | Family tree / members / details | |
| 18 | RHU registration unchanged | |
| + | Payload audit omit keys | |
| + | Stale source/destination rejected | |

- [ ] **Step 3: Report remaining risks** (PG concurrency skip, head-replacement UX path chosen, unrelated dirty files untouched)

- [ ] **Step 4: Do not commit**

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Remove FSN from BHC Add/Edit via gate | 1–2 |
| Hard omit payload commands | 1 |
| Draft ignore household | 1 |
| Candidates `patients.register` + search | 3 |
| Add Existing Member, no duplicates | 4–5 |
| Transfer / stale revalidation | 4–5 |
| Preserve Add/Edit Family FSN | (no change; verified in 6) |
| Profile read-only FSN | verify only Task 2 |
| RHU unchanged | 5–6 |
| Tests + build | 5–6 |
| No commit / unrelated files | Global Constraints |

## Placeholder scan

No TBD implementation steps. Head-replacement UX has an explicit allowed fallback (block → Edit Family) matching the approved design.

## Remaining blockers before coding

1. **User final approval** of this plan document.  
2. Unrelated dirty files on branch — implementers must avoid staging them.  
3. Confirm preferred head-replacement UX fallback is acceptable if full in-modal replacement is too large for one task (design already allows block → Edit Family).

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-13-bhc-fsn-households-centralization.md`.

**After you approve this plan**, choose execution mode:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

**Do not start code changes until you explicitly approve.**
