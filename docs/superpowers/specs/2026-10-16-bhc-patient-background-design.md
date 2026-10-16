# BHC Patient Background and consultation history

## Approval and scope

Eric approved the consolidated design and requested execution on October 16, 2026 after the one-question-at-a-time interview. This specification records that approved behavior. BHC first; preserve RHU consultation behavior and existing uncommitted FSN implementation. No production database migration, merge, or push is part of execution.

Amended later on October 16, 2026 after Eric's review: same-tab return flow with a post-save Continue Consultation modal and fallback banner (replacing the new-tab link), the explicit field mapping table, and Obstetric placement in the Prenatal Care panel.

## Problem and evidence

`PatientHistoryPanel` currently mixes registration demographics, Informant, Similar Illness in the Family, and longitudinal medical/social history. `PersonalSocialSection` includes Education and Past Occupations although Current Occupation already belongs to registration. `PatientBackgroundTab` is read-only. Background audit entries currently exist only inside finalized health records. Consultation drafts can contain staged background updates and an active History step. Prenatal forms navigate to that step for obstetric history.

The approved workflow separates patient information, longitudinal clinical history, and current visit answers. This changes ownership/editing locations, not clinical questions or diagnostic authority. Existing ITR fields and Eric's workflow interview are the evidence; do not invent additional clinical intake requirements.

## User behavior

- Patient Information/registration owns Education (existing level and completion choices) and Current Occupation. Remove Past Occupations input; retain saved historical values.
- Patient Background has explicit Edit, Save, and Cancel for medical, family, social/lifestyle and existing eligible obstetric sections. It works without an active consultation. Keep RHU-confirmed conditions read-only.
- A manually opened Patient History reference is available from patient Overview and during BHC consultation. It starts closed, is read-only, and contains Past Medical History (RHU conditions, current conditions, allergies, hospitalizations/surgeries), Family Conditions, Smoking, Alcohol, Diet, Sexual History and Household Environment. It excludes demographics, Informant, Similar Illness, Education, Current Occupation, Past Occupations and Obstetric & Menstrual History (see Obstetric placement).
- On desktop the reference must allow users to continue entering consultation data while open (non-modal panel with independent scrolling). On narrow screens it may use an accessible dismissible sheet. Accessible button/title/close control and responsive bounds are required. Use existing shadcn/ui and Tailwind patterns.
- Missing information says Not recorded; absence is not a negative clinical answer. Fetch errors must not look like empty history.
- Remove the separate Patient History consultation step for BHC. General Data no longer appears there. Informant and existing per-visit Similar Illness in the Family are in Patient Interview with inline validation; preserve their finalization/review/history serialization.
- Preserve the active consultation draft when navigating to edit background, using the same-tab return flow below (this replaces the earlier new-tab approach). The reference refreshes from the saved patient query.

### Where each current History step part goes

| Current History step part | New place | In floating reference |
|---|---|---|
| I. General Data: name, age/sex/civil status, residence, birthday | Removed from consultation; patient header and Patient Information already show it | No |
| General Data: current Occupation | Patient registration / Patient Information (already there) | No |
| General Data: Informant (per visit) | Patient Interview step | No |
| Past Medical: RHU conditions (locked), current conditions, allergies, hospitalizations & surgeries | Patient Background (editable; RHU rows stay locked) | Yes, read-only |
| Family: Family Conditions | Patient Background (editable) | Yes, read-only |
| Family: Similar Illness in the Family (per visit) | Patient Interview step | No |
| Personal/Social: Education level and completion | Patient registration and Patient Information (new demographic fields) | No |
| Personal/Social: Past Occupations | Input removed; saved values stay visible in historical records and audit | No |
| Personal/Social: Smoking, Alcohol, Diet, Sexual History, Household Environment | Patient Background (editable) | Yes, read-only |
| V. Obstetric & Menstrual History (eligible female patients) | Patient Background (editable) | No; shown in the Prenatal Care panel |

### Return to the consultation after editing

1. The floating reference shows an **Edit in Patient Background** button only to users with `clinical.background.update`; others get a view-only reference.
2. Pressing it saves the consultation draft with the existing Leave & Resume Later save logic, then navigates in the same tab to `/bhc/patients/{id}?tab=background`. The Leave Consultation modal does not appear because the draft is already saved. If the save fails, the user stays in the consultation and sees the error.
3. In Patient Background the user edits and saves any section. When the patient has an open BHC consultation draft, a successful save opens a **Background saved** modal: "[Section] was updated. Your consultation is still open." with **Stay on Background** and **Continue Consultation** (primary). Without an open draft, a success toast is shown instead. Saving again later shows the modal again.
4. **Continue Consultation** uses the existing draft resume path (`usePatientConsultation` / `startPath`) and returns to the step saved in the draft.
5. While the patient has an open draft, Patient Background also shows a **Consultation in progress · Continue Consultation** banner. This covers Cancel, Stay on Background, refresh, or arriving from elsewhere. The banner depends on the draft, not on navigation state.
6. Leaving Patient Background with a section still in edit mode and unsaved asks for confirmation first, so the edit is not lost.
7. The profile header keeps its existing Resume Consultation label.

### Obstetric placement

Obstetric & Menstrual History stays one patient-level history (RHU ITR Section V), reused across visits. It is edited only in Patient Background. During a consultation it appears only in the Prenatal Care panel (Add Prenatal Care to This Visit), as the existing read-only summary. The panel's **Review / Update History** button, which today jumps to the removed History step, becomes **Edit in Patient Background** and follows the same return flow; Continue Consultation returns to the prenatal step. Per-visit prenatal data (Gravida/Para/TPAL, risk factors and other prenatal form fields) is unchanged. The existing sex-verification guard and Patient Information link stay. No enrollment redesign.

## Authorization and persistence

Laravel authorizes assigned facility access and a new admin-selectable `clinical.background.update` capability in addition to `clinical.history` reading. No new automatic role grants. Use the existing server capability catalogue and admin forms. BHC-only independent update endpoint; RHU keeps existing paths.

`PATCH /api/patients/{patient}/background` accepts `{background_update: {sections, base_revisions}}`, reuses existing field validation/normalization and per-section revision conflict detection, and returns `{data: patient}` using the existing authorized patient serialization. Validation is 422 and stale revisions 409 with existing conflicts shape. Require at least one actual section; never accept arbitrary clinical JSON/actor/source/facility stamps from the browser.

The transaction locks the patient row, applies submitted sections, increments changed revisions, and appends durable background audit entries with before/after, section, revision, actor, timestamp and BHC. Source is `patient_background`; no fake health record is created. Audit append and patient update succeed or fail together. Existing `/background-history` merges new entries with historical consultation entries, scoped to the authorized facility, newest first. Older entries/health records stay intact. A no-op does not invent a change entry.

Add nullable patient `education_level` and `education_completed` fields. A one-time additive migration backfills existing compatible values from `medical_background.personalSocial.education`; old JSON is retained as historical data. Explicitly cleared patient education must stay cleared, not reappear from fallback JSON. Patient registration APIs validate/persist these fields; profile and normalizers expose them. Clinical access restrictions must not hide these demographic fields.

BHC background writes preserve removed nested Education/Past Occupations values rather than silently deleting or overwriting them from stale section snapshots. Existing RHU behavior remains supported. This applies to direct saves and legacy BHC consultation writes. Registration edits do not recreate historical occupations.

## Compatibility and recovery

Keep historical health record rendering and audit differences readable, including old Education/Past Occupations values. Restrict their removal to current BHC editing/reference surfaces.

Legacy BHC drafts with `formStep: history` reopen Interview. Staged `backgroundUpdate` must not disappear: display a recoverable legacy-draft editor/summary with explicit save/discard handling and conflict feedback. Existing saved clinical draft edits may either remain staged for their original consultation finalization or be explicitly moved through independent save, but never silently save or discard them. Removed Education/Past Occupations draft values must remain visible as recoverable text; current registration data must not be overwritten by them. New BHC consultations do not create fresh staged background edits. Preserve RHU staged history flow.

## Architecture

- Laravel owns permissions, payload validation, normalization, orchestration, facility scoping, and audit generation.
- PostgreSQL stores additive demographic columns and immutable background audit rows; existing transactions/row locks and revision checks provide atomicity. No new stored procedure is needed because this is a single-patient edit with existing transactional logic, not serial allocation or multi-row computation.
- TanStack Query uses the existing patient detail key as saved background authority and the existing background-history key for audit. Successful saves update/invalidate both plus relevant patient lists. Opening/canceling edits never mutates cached patient data. Capture revisions when editing starts; background refetch must not reset dirty forms. On conflict keep the user's draft and offer explicit reload, never blind retry with current revisions.

## Acceptance and limits

Prove BHC/facility/permission boundaries, independent transactional audit, stale revision rejection/no partial writes, removed nested-field preservation, Education backfill and explicit clear, RHU compatibility, consultation navigation/error routing, save-draft-then-navigate (including a failed draft save that keeps the user in the consultation), Background saved modal and banner shown only with an open draft and returning to the saved step, the prenatal Edit in Patient Background path, old-draft recovery, and per-visit payload retention. Run focused backend/frontend tests, changed-file lint, production build and scoped regressions. Report pre-existing failures separately. Browser visual inspection depends on an available browser surface; actual PostgreSQL deployment is separate from isolated automated tests.
