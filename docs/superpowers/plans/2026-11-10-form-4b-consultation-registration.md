# Form 4B Consultation Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Modified Option A — DS-TB Form 4B registers inside RHU consultation only when initiating treatment at RHU (atomic with finalize), with read-only details and Option D delayed registration.

**Architecture:** Extend the existing local TB case stack (`TbCaseRegistrationService`, `tbRegistration.js`, `TbCaseRegistrationPanel`, `tb_treatment_cases` migrations). Add `treatmentDecision` on `tbManagement`, dynamic `FORM_4B_STEP`, draft-safe `tbCaseRegistration` payload, and hook case create into `HealthRecordController@store`’s transaction. Repurpose details to read-only + delayed modal.

**Tech Stack:** React/Vite frontend, Laravel/PHP API, PostgreSQL (SQLite in tests), existing Sanctum + ActionPermissions + TbClinicalAuthority.

**Spec:** [`docs/superpowers/specs/2026-11-10-form-4b-consultation-registration-design.md`](../specs/2026-11-10-form-4b-consultation-registration-design.md)

## Global Constraints

- Branch: `Eric-Manually-Fixer` only.
- Foundation commit: local `e490dec` (ahead of origin). **Reuse** its TB services/migrations/components; **do not** recreate or replace them.
- **No** `git clean`, reset, commit, push, merge, or deployment at any task. Replace every “Commit” step with: verify tests, leave changes unstaged/staged only as the engineer prefers, **do not commit**.
- Preserve all files from `e490dec` and any later working-tree edits unrelated to this feature.
- Internal registration ≠ NTP/ITIS notification.
- No invented NTP `referredBy` category mappings; no hardcoded Bulacan.
- Focused tests only (named below); do not run unrelated full-suite noise unless diagnosing a break you caused.

---

## File map

| File | Responsibility |
|------|----------------|
| `frontend/src/utils/tbAssessment.js` + `rhuTbCaseManagement.js` | Decision helpers, derived `openTreatmentCard`, validation errors |
| `frontend/src/utils/consultationSteps.js` | `FORM_4B_STEP` constant + dynamic step after care plan |
| `RhuDiagnosisCarePlanSection.jsx` | Treatment decision + disposition UI |
| `RhuConsultationWorkspace.jsx` | Render Form 4B step, draft fields, finalize payload, review gate |
| `TbTreatmentCardForm.jsx` | Harden `mode="registration"` section visibility |
| `TbCaseRegistrationPanel.jsx` | Embeddable registration UI + delayed modal mode |
| `RHURecordDetails.jsx` | Read-only + Option D entry |
| `tbRegistration.js` | Screening source labels, delayed start date validation |
| `TbAssessment.php` | Server decision/draft rules |
| `HealthRecordDraftPayloadService.php` | Draft whitelist for decision + `tbCaseRegistration` |
| `HealthRecordRequest.php` / store path | Accept Form 4B on finalize when initiating |
| `HealthRecordController.php` | Atomic register inside existing transaction |
| `TbCaseRegistrationService.php` | Shared `registerForSource`, screening prefill, delayed eligibility |
| `TbCaseRegistrationRequest.php` | `treatment_start_date` for Option D |

---

### Task 1: Treatment decision model + TbAssessment rules

**Files:**
- Modify: `backend/app/Services/TbAssessment.php`
- Modify: `frontend/src/utils/tbAssessment.js`
- Modify: `frontend/src/utils/rhuTbCaseManagement.js`
- Test: `backend/tests/Feature/TbAssessmentTest.php`
- Test: `frontend/src/utils/tbAssessment.test.js`, `frontend/src/utils/rhuTbCaseManagement.test.js`

**Interfaces:**
- Consumes: existing `diagnosisType` / `drugResistance` / `openTreatmentCard`
- Produces: `treatmentDecision` ∈ `initiate_at_rhu|not_yet_initiated|refer_elsewhere|""`; `dispositionReason`; `dispositionPlan`; `openTreatmentCard === (treatmentDecision === 'initiate_at_rhu')`

- [ ] **Step 1: Write failing backend tests** for DS-TB requiring `treatmentDecision`; initiate allowing `openTreatmentCard` when accompanied by Form 4B on finalize (finalize Form 4B wire comes in Task 4 — for pure `TbAssessment::validate` on diagnoses array, assert initiate without disposition is OK and deferred without reason fails; assert infection clears decision).

- [ ] **Step 2: Run** `php artisan test --filter=TbAssessmentTest` — expect FAIL on new assertions.

- [ ] **Step 3: Implement** `TbAssessment::rules/validate/normalizeDraft` per spec §7. Replace blanket `openTreatmentCard` rejection with decision-aware rules. `normalizeDraft` retains initiate fields when DS-TB eligible.

- [ ] **Step 4: Implement frontend helpers** (`tbManagementFor` clears incompatible decision; `rhuTbAssessmentErrors` requires decision + disposition).

- [ ] **Step 5: Run** backend filter + `node --test src/utils/tbAssessment.test.js src/utils/rhuTbCaseManagement.test.js` (from `frontend`). Expect PASS.

- [ ] **Step 6: Do not commit.**

---

### Task 2: Care-plan UI + dynamic FORM_4B_STEP

**Files:**
- Modify: `frontend/src/utils/consultationSteps.js`
- Modify: `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx`
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx` (step list + navigation only; full Form 4B body in Task 3)
- Test: `frontend/src/utils/consultationSteps` tests if present; else `RhuConsultationWorkspace.test.js`

**Interfaces:**
- Produces: `export const FORM_4B_STEP = "form-4b"`
- Step insertion when any diagnosis has `treatmentDecision === 'initiate_at_rhu'`
- Order: `NEXT_STEP` → `FORM_4B_STEP` (conditional) → `REVIEW_STEP`; `TB_INTAKE_STEP` unchanged when `includeTb`

- [ ] **Step 1: Failing tests** — step sequence includes `form-4b` only for initiate; deferred excludes it; `TB_INTAKE_STEP` still independent.

- [ ] **Step 2: Implement** step helpers + care-plan radios/disposition fields; remove “register separately after finalization” copy for initiate path.

- [ ] **Step 3: Wire** `goToStepKey(FORM_4B_STEP)` from Review when initiate and Form 4B errors present (can stub errors helper until Task 3).

- [ ] **Step 4: Run focused frontend tests.** Expect PASS.

- [ ] **Step 5: Do not commit.**

---

### Task 3: Form 4B step UI + registration mode hardening + drafts

**Files:**
- Modify: `TbTreatmentCardForm.jsx`
- Modify: `TbCaseRegistrationPanel.jsx` (extract presentational registration form usable without owning the page)
- Modify: `RhuConsultationWorkspace.jsx` — render Form 4B step; persist `tbCaseRegistration` in draft payload
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php`
- Test: `tbRegistration.test.js`, draft payload unit/feature tests, workspace tests

**Interfaces:**
- Produces draft field `tbCaseRegistration: { registration_key, reporting_year, case_number, card_data, screeningDateSource, confirmed }`
- Stable `registration_key`: create once per consultation draft identity; reuse on resume; regenerate only when card fingerprint intentionally changes (same pattern as `tbRegistrationAttempt`)

- [ ] **Step 1: Failing tests** — registration mode hides outcome/DOTS/AE; draft round-trip keeps decision + card + key; changing decision away from initiate clears `tbCaseRegistration` from working state.

- [ ] **Step 2: Harden** `mode="registration"` visibility; ensure PDF download disabled until case id exists.

- [ ] **Step 3: Embed** registration fields on `FORM_4B_STEP` with visit/referral prefill labels (client-side from visit props; server remains authoritative on save).

- [ ] **Step 4: Extend** `HealthRecordDraftPayloadService` whitelist/validation for `treatmentDecision`, disposition fields, `tbCaseRegistration.*`.

- [ ] **Step 5: Run** focused draft + frontend tests. Expect PASS.

- [ ] **Step 6: Do not commit.**

---

### Task 4: Atomic finalize + shared registerForSource

**Files:**
- Modify: `backend/app/Services/TbCaseRegistrationService.php`
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (and any RHU ITR validation path)
- Test: `backend/tests/Feature/TbCaseRegistrationTest.php`, `backend/tests/Feature/RhuItrConsultationTest.php` (new cases)

**Interfaces:**
- Produces: `TbCaseRegistrationService::registerForSource(Request|User context, HealthRecord $source, array $data, bool $useOuterTransaction = false): array{case, created}`
- Existing `register()` becomes a thin wrapper calling `registerForSource`
- Store transaction: after record create, if initiate → `registerForSource`; failure rolls back record + visit close

**Screening prefill in preview/register:**
- Set `caseFinding.dateOfScreening` + return `screening_date_source` in preview JSON
- Diagnosing facility = RHU name; reporting year = Manila year
- Do not auto-set `referredBy` category unless already product-defined; include `referral_source_label` for UI

- [ ] **Step 1: Write failing feature tests** covering acceptance items 1–2, 6, 8–10 from the spec (atomic success, missing fields 422 with no record, simulated register failure rolls back, idempotent replay returns case, nurse 403).

- [ ] **Step 2: Run filters** — expect FAIL.

- [ ] **Step 3: Implement** `registerForSource` + store hook + request validation for `tbCaseRegistration` when initiate; prohibit payload when deferred/refer; include Form 4B in idempotency hash.

- [ ] **Step 4: Run** `php artisan test --filter=TbCaseRegistrationTest` and targeted new RhuItr tests. Expect PASS.

- [ ] **Step 5: Do not commit.**

---

### Task 5: Deferred / refer finalize + Option D delayed modal

**Files:**
- Modify: `TbCaseRegistrationService::blocked` / preview eligibility for deferred sources
- Modify: `TbCaseRegistrationRequest.php` — `treatment_start_date` required for delayed path (e.g. when request has `delayed_initiation: true` or always optional on atomic, required when `treatment_start_date` key expected)
- Modify: `RHURecordDetails.jsx`
- Modify: `TbCaseRegistrationPanel.jsx` — modal/route host; remove inline editable body from details
- Test: feature tests for defer/refer/no case; delayed register; details does not PATCH record; frontend panel tests

- [ ] **Step 1: Failing tests** — deferred finalize stores disposition, zero cases; Option D creates one case with treatment start date; second submit idempotent; details GET unchanged diagnoses JSON after register.

- [ ] **Step 2: Implement** read-only details + Register CTA → modal using existing preview/register APIs.

- [ ] **Step 3: Run** focused backend + frontend tests. Expect PASS.

- [ ] **Step 4: Do not commit.**

---

### Task 6: End-to-end acceptance sweep

**Files:** tests only (fix gaps found)

- [ ] **Step 1: Run matrix**

```bash
# backend (from AKAY-Prototype/backend)
php artisan test --filter=TbCaseRegistrationTest
php artisan test --filter=TbAssessmentTest
php artisan test --filter=RhuItrConsultationTest
php artisan test --filter=HealthRecordDraftPayloadServiceTest

# frontend (from AKAY-Prototype/frontend)
npm test -- --test-name-pattern="tbAssessment|rhuTbCaseManagement|tbRegistration|RhuConsultation|TbCaseRegistration|TbTreatment"
```

- [ ] **Step 2: Manually verify checklist** against spec §10 (BHC, walk-in, initiate, defer, refer, draft resume, rollback, retry, permissions, read-only print).

- [ ] **Step 3: Write concise implementation report** (behavior verified, files changed, lifecycle, test results, NTP/policy leftovers). **Do not commit.**

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| UI sequence care plan → decision → Form 4B → review | 2, 3 |
| Deferred/refer without Form 4B | 1, 5 |
| Atomic save + rollback + idempotency + permissions | 4 |
| Option D delayed modal | 5 |
| Read-only details + print | 5 |
| Auto-populate + labeled fallbacks | 3, 4 |
| Draft recovery + stable key | 3 |
| Migration/stack reuse, no recreate | Global + Tasks 4–5 |
| Focused acceptance tests | 4, 5, 6 |
| No commit/push | Global Constraints |

No placeholder tasks. Commit steps intentionally replaced with “Do not commit.”
