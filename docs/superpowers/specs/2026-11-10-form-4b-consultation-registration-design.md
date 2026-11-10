# Form 4B in RHU Consultation — Modified Option A (Design Spec)

**Status:** Awaiting approval before implementation  
**Date:** 2026-11-10  
**Branch:** `Eric-Manually-Fixer`  
**Supersedes (placement only):** post-finalize-only Form 4B registration in [`2026-11-09-tb-case-workflow-design.md`](./2026-11-09-tb-case-workflow-design.md) for DS-TB **initiate-at-RHU**. Shared case identity, physician authority, and “internal registration ≠ NTP/ITIS” remain in force.

## 1. Goal

Move DS-TB Form 4B registration into the active RHU consultation when the physician chooses **Initiate DS-TB Treatment at RHU**, save consultation + internal case **atomically**, keep `/rhu/health-records/:id` **strictly read-only**, and provide **Option D** delayed registration (separate modal/route) when treatment was deferred or referred elsewhere.

## 2. Foundation baseline (do not recreate)

### 2.1 Git reality (verified 2026-11-10)

| Fact | Value |
|------|--------|
| Remote `origin/Eric-Manually-Fixer` | Does **not** yet contain the TB case stack (until push; **do not push**) |
| Local HEAD | `e490dec` — *feat(tb-assessment): enhance TB assessment features…* — **1 commit ahead** of origin |
| Working tree | Clean at time of this spec; foundation files are **in that local commit** |
| Constraint | Preserve that commit and all files; **no** `git clean`, reset, commit, push, merge, or deploy during implementation of this feature |

### 2.2 Reuse these components (extend only)

| Layer | Paths |
|-------|--------|
| Registration service | `backend/app/Services/TbCaseRegistrationService.php` |
| API | `TbCaseRegistrationController`, `TbCaseRegistrationRequest`, routes `GET/POST health-records/{id}/tb-registration` |
| Model / numbering | `TbTreatmentCase`, `TbCaseNumberAllocator` |
| Migrations | `2026_11_10_000001` … `000007` (see §6) |
| Frontend helpers | `frontend/src/utils/tbRegistration.js`, `frontend/src/services/tbCaseService.js` |
| UI | `TbCaseRegistrationPanel.jsx`, `TbTreatmentCardForm.jsx` (`mode="registration"` already local), details mount in `RHURecordDetails.jsx` |
| Conflict helpers | Active case / endorsement checks already in `TbCaseRegistrationService::blocked()` and `TbCaseEndorsementService` |

**Forbidden:** inventing a second registration service, parallel table, or duplicate payload/idempotency helpers.

## 3. Exact UI step sequence

### 3.1 RHU consultation wizard (`/rhu/health-records/add`)

Unchanged prefix: Interview → (programs as today) → **Diagnosis & Care Plan** (`NEXT_STEP`).

On a recognized TB diagnosis in care plan:

1. **Diagnosis type** → if `tb_disease`, show **Drug Susceptibility Classification**.
2. If `tb_disease` + `drug_susceptible` and patient is eligible for a **new** DS-TB case (no active case / blocking legacy / active endorsement linkage): show **Treatment Decision**:
   - `initiate_at_rhu` — Initiate DS-TB Treatment at RHU  
   - `not_yet_initiated` — Treatment Not Yet Initiated  
   - `refer_elsewhere` — Refer to Another Treatment Facility  
3. If deferred or refer: show required **disposition reason** + **clinical disposition / follow-up or referral plan**; **do not** insert Form 4B step.
4. If `initiate_at_rhu`: insert dedicated step **`FORM_4B_STEP`** (`form-4b`) **immediately after** Diagnosis & Care Plan and **before** Review & Finalize.
5. **Review & Finalize**: if initiate and Form 4B invalid/incomplete → block finalize, navigate to `FORM_4B_STEP`, show field errors.
6. Legacy **`TB_INTAKE_STEP`** remains only for `includeTb` (existing legacy `tb_data` card). Never overload it for new registration.

DR-TB / TB Infection / undetermined resistance: no treatment decision for Form 4B; no `FORM_4B_STEP`; existing DR-TB / TPT pathways unchanged.

### 3.2 Form 4B step content

- Reuse `TbTreatmentCardForm` with `mode="registration"`.
- Show registration-relevant sections only (case-finding, locked diagnosis/resistance/facility, classification, comorbidities, supporter, phases, regimen rows, RHU lab references).
- **Exclude:** Treatment Outcome, Dose Calendar / DOTS, Serious Adverse Events.
- Prefill screening/facility (§8); physician may correct documented screening fields.
- Require physician confirmation of reviewed evidence before finalize (same spirit as `confirmed` on delayed register).

### 3.3 Health Record Details (`/rhu/health-records/:id`)

Strictly read-only consultation surface:

| State | UI |
|-------|-----|
| Case registered | Read-only Form 4B summary + Print/Download case PDF |
| Deferred / refer, no case | Disposition reason + plan; no fake “registered” card |
| Eligible delayed register | Physician CTA **Register DS-TB Treatment** → **separate modal or route** (Option D) |
| DR-TB / infection | Existing panels only; no DS-TB Form 4B registration |

Remove inline editable registration from the details page body.

### 3.4 Option D — delayed registration

- Separate authorized flow; creates `tb_treatment_cases` linked to `source_health_record_id`.
- **Does not** mutate finalized consultation JSON / snapshots.
- Requires: eligibility re-check, current `source_revision`, evidence review confirmation, **treatment start date** (do not default to consultation date), existing card validation.
- After success, details shows read-only Form 4B + Print.

## 4. Data model (consultation-side)

Extend `diagnoses[].tbManagement` (JSON on health record / draft):

```text
diagnosisType, drugResistance,
treatmentDecision: initiate_at_rhu | not_yet_initiated | refer_elsewhere | "" ,
dispositionReason: string,
dispositionPlan: string,
openTreatmentCard: boolean  // derived: true iff initiate_at_rhu
```

Draft-only companion object (not written into immutable clinical `tb_data`):

```text
tbCaseRegistration: {
  registration_key: uuid,       // stable across draft resumes for this consultation
  reporting_year: number,
  case_number: string|null,
  card_data: { ...editable whitelist... },
  source_revision: string|null, // optional until post-finalize delayed path
  screeningDateSource: bhc_screening | referral_fallback | rhu_visit | "" ,
  confirmed: boolean
}
```

Delayed-only request addition: `treatment_start_date` (`Y-m-d`), required on Option D; stored into case `card_data.phases.intensiveStart` when empty, or as audited registration metadata without rewriting historical consultation fields.

## 5. Backend transaction design

### 5.1 Atomic finalize + register (initiate)

`POST /api/health-records` (RHU ITR) existing outer `DB::transaction`:

1. Lock draft / visit as today.  
2. Create finalized `health_records` + `tb_assessment_authority` attestation.  
3. Close visit queue entry (existing completed path) **only if** the remainder of the transaction succeeds.  
4. If `treatmentDecision === initiate_at_rhu`:
   - Validate Form 4B payload (same rules as `TbCaseRegistrationRequest` card rules).  
   - Call **extracted** `TbCaseRegistrationService` register-for-source (shared with delayed POST), reusing `blocked()`, snapshot/revision, number allocator, `registration_key` / hash retry, audit.  
   - On failure: throw → **rollback entire transaction** (no health record, visit not completed, draft remains).  
5. If deferred/refer: require disposition fields; **prohibit** Form 4B payload; no case row.  
6. Response: health record + optional `tb_treatment_case` summary.

### 5.2 Idempotency and duplicates

| Mechanism | Behavior |
|-----------|----------|
| Health record `idempotency_key` + hash | Hash **includes** Form 4B payload / `registration_key`. Replay returns same record **and** linked case when registration was part of the submission. |
| Case `registration_key` + `registration_hash` | Identical retry returns existing case; changed body under same key → 409. |
| `source_health_record_id` UNIQUE | One case per consultation. |
| Partial unique active patient | One `status=active` case per patient. |
| `blocked()` | Physician finalization, single DS-TB assessment, no active case/endorsement, no blocking legacy card. |

### 5.3 Delayed path

Unchanged endpoint `POST …/tb-registration`, plus eligibility: source must be DS-TB; prefer allowing when `treatmentDecision` is `not_yet_initiated` or `refer_elsewhere` (and unregistered). Still never PATCH the health record.

### 5.4 Permissions / security

| Action | Who |
|--------|-----|
| Draft treatment decision + Form 4B fields | RHU staff who can encode/draft (existing draft ACL) |
| Finalize consultation with TB assessment | RHU physician + existing finalize/confirm duties |
| Register case (atomic or delayed) | `TbClinicalAuthority::canConfirm` + `consultations.finalize` + `clinical.history` + same RHU facility scope |
| Read case / PDF | Facility-scoped clinical history (existing) |

Audit: existing `AuditLogger` on case create; log screening corrections / delayed initiation note in the create audit message or structured audit payload.

Internal case registration **does not** set any NTP/ITIS “notified” status.

## 6. Migration dependencies

Apply in filename order (already in local commit `e490dec`):

| Migration | Depends on | Needed for this feature |
|-----------|------------|-------------------------|
| `2026_11_10_000001_create_tb_treatment_cases` | `health_records`, `patients`, `rural_health_units`, `users` | **Required** — case table + counters + source identity unique |
| `2026_11_10_000002_add_tb_registration_identity` | `000001` | **Required** — `registration_key` / hash |
| `2026_11_10_000003_add_tb_assessment_authority` | `health_records` | **Required** — physician attestation |
| `2026_11_10_000004_create_tb_case_endorsements` | `000001` | **Required for conflict rules** (`blocked` / active linked case) |
| `2026_11_10_000005` … `000007` | prior TB migrations | Preserve; do not break. Not primary write path for this feature |

**This increment:** no replacement migrations; **no** new parallel schema for registration. Optional RHU `province_huc` column is **out of scope** unless already present — leave Province/HUC empty with facility address as UI hint (no hardcoded Bulacan).

Compatibility with the TB file set in `e490dec` (~full case/endorsement/monitoring/DR stack): extend registration + consultation only; do not rewrite endorsement/monitoring/DR modules except shared eligibility calls.

## 7. Validation rules

### 7.1 `TbAssessment` (finalize)

- DS-TB without `treatmentDecision` → 422.  
- `initiate_at_rhu` → `openTreatmentCard` true; Form 4B payload required and valid; disposition fields empty/ignored.  
- `not_yet_initiated` / `refer_elsewhere` → disposition reason + plan required; Form 4B payload prohibited; `openTreatmentCard` false.  
- Non-DS-TB → `treatmentDecision` / Form 4B prohibited; clear incompatible fields.  
- Replace blanket “Register Form 4B separately…” rejection with the rules above.

### 7.2 Draft normalize

- Eligible initiate drafts **retain** decision, `openTreatmentCard`, and `tbCaseRegistration` (including stable `registration_key`).  
- Incompatible type/resistance clears decision, open flag, and registration draft object.  
- Draft save never creates a case.

### 7.3 Form 4B card (client + server)

Reuse `tbRegistrationErrors` / `TbCaseRegistrationRequest` whitelist and regimen rules. Registration mode must not accept outcome/DOTS/AE fields (already prohibited arrays on server).

### 7.4 Screening

- `dateOfScreening` defaulted from trusted source when available; UI shows `screeningDateSource` label.  
- `referredBy` NTP category: **do not invent** clinical mappings; show BHC name / “RHU walk-in” as display context; physician selects category unless a product-approved mapping already exists in code comments/tests.  
- Reporting year = Manila year of registration event.  
- Diagnosing facility = RHU name (server-owned).

## 8. Auto-population

| Field | Trusted source | Fallback / label |
|-------|----------------|------------------|
| Date of Screening | Documented BHC screening date if available | Referral `referral_datetime` date labeled `referral_fallback`; walk-in → visit/consultation date labeled `rhu_visit` |
| Display “Referred from” | Linked BHC name | “RHU walk-in” |
| Reporting year | `now('Asia/Manila')->year` at register | — |
| Diagnosing facility | `RuralHealthUnit.name` | — |
| Province / HUC | RHU config if ever added | Leave blank + address hint; no hardcode |

Never fabricate laboratory results or diagnosis classifications.

## 9. Files to modify (implementation scope)

### Backend (modify)

- `backend/app/Services/TbAssessment.php` — decision rules + draft normalize  
- `backend/app/Services/TbCaseRegistrationService.php` — extract shared register; screening prefill + date source; delayed start date; eligibility for deferred sources  
- `backend/app/Http/Controllers/Api/HealthRecordController.php` — atomic register inside store transaction; response includes case; idempotency hash includes Form 4B  
- `backend/app/Http/Requests/HealthRecordRequest.php` (+ related) — accept `tbCaseRegistration` / decision fields on RHU ITR finalize  
- `backend/app/Services/HealthRecordDraftPayloadService.php` — whitelist decision + `tbCaseRegistration`  
- `backend/app/Http/Requests/TbCaseRegistrationRequest.php` — optional delayed `treatment_start_date`  
- Tests: extend `TbCaseRegistrationTest`, `RhuItrConsultationTest`, draft payload tests; add focused atomic/defer/retry cases  

### Frontend (modify)

- `frontend/src/utils/tbAssessment.js`, `rhuTbCaseManagement.js` — decision helpers / errors  
- `frontend/src/utils/consultationSteps.js` — `FORM_4B_STEP`; dynamic insertion  
- `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx` — treatment decision + disposition UI  
- `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx` — step render, draft fields, finalize payload, review gate  
- `frontend/src/components/features/health-records/TbTreatmentCardForm.jsx` — harden registration mode exclusions  
- `frontend/src/components/features/health-records/TbCaseRegistrationPanel.jsx` — support consultation embed + delayed modal; remove assumption that details page is the only host  
- `frontend/src/pages/rhu/RHURecordDetails.jsx` — read-only + Option D CTA/modal  
- `frontend/src/utils/tbRegistration.js` — screening labels / delayed start validation as needed + tests  

### Do not recreate

Controllers/services/migrations/models listed in §2.2.

## 10. Acceptance tests

1. BHC referral → DS-TB → initiate → Form 4B complete → one health record + one case; visit completed; screening label correct.  
2. RHU walk-in → same pathway; visit-date screening label.  
3. DS-TB → deferred → finalize without case; disposition on details; Option D registers one case; consultation unchanged.  
4. DS-TB → refer elsewhere → finalize with disposition; no silent case.  
5. DR-TB / TB Infection → no Form 4B step; registration API remains ineligible.  
6. Initiate with missing Form 4B fields → finalize blocked; UI returns to `FORM_4B_STEP`.  
7. Draft save/resume → decision, card fields, wizard step, same `registration_key`.  
8. Forced registration failure inside finalize → no health record; visit open; draft recoverable.  
9. Duplicate / lost-response retry → single case.  
10. Nurse cannot finalize/register; physician can.  
11. Details read-only; print works when case exists; no editable Form 4B on details body.

## 11. Out of scope

New TB management hub, Form 4C, ITIS notification, committing/pushing this feature, rewriting endorsement/DOTS/DR modules, hardcoding province Bulacan, inventing NTP `referredBy` category mappings without clinical sign-off.

## 12. Spec self-review

- No TBD/placeholder sections.  
- Consistent with Approach 1 + Option D + Modified Option A decisions.  
- Foundation = local commit `e490dec`, not remote-only HEAD.  
- Atomic rollback and draft recovery explicitly required.  
- NTP/ITIS kept separate from internal registration.
