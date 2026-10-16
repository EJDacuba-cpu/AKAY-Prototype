# BHC Patient Background implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Move longitudinal BHC history editing to Patient Background and provide a floating reference while simplifying the consultation flow.

**Architecture:** Reuse PatientBackground validation and revision locking through a separately authorized audited endpoint. Add demographic Education columns, preserve clinical/history compatibility, and use existing TanStack patient keys for all saved views.

**Tech Stack:** Laravel, PostgreSQL, React, TanStack Query, shadcn/ui, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-16-bhc-patient-background-design.md`

## Global constraints

- BHC first; preserve RHU behavior, existing FSN workspace edits, historical values, and drafts.
- Admin explicitly assigns `clinical.background.update`; no automatic role grants.
- No production migration, merge, push, or unrelated refactor. Keep implementation in current shared feature workspace.
- Read-only reference starts closed; desktop remains usable while it is open.
- Independent saves use row locks, revisions, audit, and inline errors; no new stored procedure.

## Review focus

1. Concurrent profile/consultation edits must reject stale clinical revisions and preserve hidden Education/occupations.
2. Explicit Education clearing must not revive legacy JSON values.
3. Closing/reopening panels or failed saves must not lose unsaved consultation/background data.
4. Legacy History-step drafts and prenatal shortcuts must remain usable after BHC step removal.
5. New update permission must be enforceable at API and admin UI with no facility leakage or implicit grants.

## Task 1: Backend audited background update and Education ownership

**Files:** new migration for background change entries and patient education, new PatientBackgroundController/model as needed; modify `backend/app/Services/PatientBackground.php`, `ActionPermissions.php`, `PatientRequest.php`, `Patient.php`, `PatientController.php`, `PatientBackgroundHistoryController.php`, `backend/routes/api.php`; new focused feature tests. Extend existing staff capability allowlists only where required.

**Consumes:** current facility access, clinical history gates, PatientBackground rules/apply/conflict exception.
**Produces:** PATCH `/patients/{id}/background` with `{background_update:{sections,base_revisions}}`, response `{data:patient}`; `clinical.background.update`; patient `education_level`/`education_completed`; merged background-history entries with source `patient_background`, no healthRecordId and optional standalone audit id.

- [ ] Write failing `PatientBackgroundIndependentTest` covering explicit grants, same-BHC scope, RHU denial, valid save and audit, no-op, 422, stale409/no partial audit, locked confirmed conditions, Education/past occupation preservation in direct and legacy consultation saves. Add Education registration/backfill/clear coverage.
- [ ] Run `php -d memory_limit=512M vendor/bin/phpunit --no-extensions --filter 'PatientBackgroundIndependentTest|PatientEducationTest'`; verify failures reflect missing feature.
- [ ] Implement additive schema, permission, scoped API, atomic audit and merged history. Existing apply gains optional source argument default consultation. Reuse existing conflict response contract. Strip/protect moved social keys for BHC while retaining old stored fields.
- [ ] Run new tests plus existing PatientBackgroundConsultation/PatientHistorySections/PatientHistoryRecord and permission/FSN regressions. Report baseline failures without changing unrelated tests. Run Pint on owned files; self-review diff.

## Task 2: Patient Background editor, floating reference, Education and capability UI

**Files:** modify `frontend/src/components/features/patients/PatientBackgroundTab.jsx`; add `PatientBackgroundEditor.jsx` and `PatientHistoryReference.jsx` beside it; reuse history section forms via optional flags; modify `PatientDetails.jsx`, `AddPatient.jsx`, registration payload/normalizer/service, actionPermissions/admin grant catalogue as required. New pure helper tests for background editing payloads and field filtering.

**Consumes:** Task1 API and patient columns; existing section editor forms and query keys.
**Produces:** `PatientHistoryReference({patient, background, conditions, onEditBackground})` read-only default-closed component reusable in consultation; it shows an "Edit in Patient Background" button only when `onEditBackground` is given (callers pass it only with `clinical.background.update`). Central BHC Background editing; `savePatientBackground(id,backgroundUpdate)` returns normalized patient; Education registration bindings; the Background saved modal and Consultation in progress banner (spec "Return to the consultation after editing", steps 3-7). Keep shared section component defaults RHU-compatible.

- [ ] Write failing helper tests for form payload omission/preservation of Education/Past Occupations, captured revisions, explicit Education clear, reference filtering (spec field mapping table: Obstetric excluded from the reference), no role-based implicit grant, and the pure rule for when the post-save modal vs toast and the banner appear (open BHC draft present or not).
- [ ] Implement explicit per-section Edit/Save/Cancel with revision capture, draft retention, validation/conflict feedback and cache refresh. After a successful save: with an open consultation draft for the patient (existing `usePatientConsultation`), open a **Background saved** modal ("[Section] was updated. Your consultation is still open.", buttons Stay on Background / Continue Consultation as primary, Continue uses the existing draft resume `open()`); without a draft, a success toast. Show the **Consultation in progress · Continue Consultation** banner on the Background tab while a draft exists. Guard leaving with an unsaved section in edit mode. Header Resume Consultation label unchanged. Existing RHU read-only Background remains unchanged.
- [ ] Add the reference at patient Overview (its edit button switches to the Background tab); use non-modal shadcn Popover/panel or equivalent existing accessible primitive, responsive scrolling. Render only the spec's reference fields, preserve historical audit field rendering.
- [ ] Add Education level/completion to registration and Patient Information; include payload/normalization/API errors. Remove BHC consultation duplicate fields via opt-in shared form props; no global RHU removal.
- [ ] Run focused node tests, changed-file ESLint, production build; self-review user paths and report exact component contracts for Task3.

## Task 3: BHC consultation step simplification and legacy recovery

**Files:** `frontend/src/pages/bhc/ConsultationWorkspace.jsx`, `utils/consultationSteps.js`, `utils/historyStep.js`, history forms/visit answer components as needed, corresponding tests. Do not broadly rewrite large workspace file.

**Consumes:** Task2 reference component, Task1 background API; existing shared RHU workspace calls.
**Produces:** BHC Interview -> Physical Examination flow with visit questions retained; optional `includeHistory` configuration on shared step utilities defaults true to preserve RHU; explicit legacy recovery UI and prenatal reference link.

- [x] Write failing behavior tests for no BHC History step, next/back/error routing to Interview, legacy history restoration, old draft clinical update recovery and removed-field text retention, RHU default sequence unchanged.
- [x] Implement BHC-only sequence and Interview Informant/SimilarIllness fields with review/finalization retention. Remove General Data/normal History step; new BHC visits have no staged background editing.
- [x] Integrate read-only floating reference throughout BHC workspace. Its Edit in Patient Background (only with `clinical.background.update`) saves the draft with the existing Leave & Resume Later save logic, then navigates in the same tab to `/bhc/patients/{id}?tab=background` without the Leave Consultation modal; a failed save keeps the user in the workspace with the error. The Prenatal Care panel keeps the read-only Obstetric summary; its Review / Update History becomes Edit in Patient Background with the same save-then-navigate flow (sex-verification guard kept). No new-tab links for background editing. Restore legacy draft with explicit clinical recovery UI; keep stale revision handling reachable and removed demographics recoverable.
- [x] Run focused tests, full frontend suite once, changed-file ESLint and production build. Review record/draft/error flows and fix material regressions.

## Task 4: Independent review and delivery

- [x] Review each task's scoped diff against spec; resolve material findings before dependent task execution.
- [x] Run integrated focused backend and frontend verification. Compare unexpected failures with pre-task baseline, never run migration against application database.
- [x] Document migration activation and user permissions in `docs/bhc-patient-background.md`, plus exact test evidence/limitations. Mark plan/state complete only after verified implementation; leave unrelated changes intact.
- [x] Final report in Taglish: diagnosis/architecture, focused before/after diff, tests, migrations not applied and any browser/environment limits.
