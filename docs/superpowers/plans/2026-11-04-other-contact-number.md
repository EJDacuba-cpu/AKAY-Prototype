# Other Contact Number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Relocate Guardian contact into Contact as optional Other Contact Number.

**Architecture:** Reuse guardianContactNumber and guardian_contact_number. Change shared registration/profile rendering and section field classification, preserving full-form saves and existing server/cache behavior.

**Tech Stack:** React, shadcn/ui Input, Tailwind, existing Laravel and TanStack Query.

**Spec:** docs/superpowers/specs/2026-11-04-other-contact-number-design.md

## Global Constraints

- Eric approved the design and explicitly requested implementation; proceed inline without another approval gate.
- Preserve parent names, guardian name/relationship, saved phone values and existing optional phone validation.
- Use Other Contact Number and helper text Contact number of a mother, father, or guardian.
- No schema, API, stored procedure or cache changes. Shared BHC/RHU surfaces stay consistent.
- Preserve unrelated workspace edits; leave changes available for review without committing mixed work.

## Review Focus

- Existing phone values must display in Contact and disappear from Guardian only as a display location.
- Explicitly clearing the number must continue to serialize null.
- An unrelated family edit must preserve the loaded number.
- Section error grouping and visible inline errors must match the input location.
- Longer stored numbers must remain editable without new formatting restrictions.

## Task 1: Relocate the existing field

**Files:** frontend/src/pages/bhc/AddPatient.jsx; frontend/src/components/features/patients/profile/RegistrationSections.jsx; frontend/src/utils/patientProfile.js; frontend/src/utils/householdData.js (API error mapping).

**Interfaces:** Existing form.guardianContactNumber, onChange, fieldErrors and patient aliases; existing toPayload serializes the unchanged API field.

- [x] Remove only guardianContactNumber from the registration Guardian Information list. Insert a labeled shadcn Input of type tel below the main Contact Number, with helper text and inline error output. Keep its existing unrestricted string value behavior.
- [x] Move the shared profile input and display row into Contact & Address after the main number; retain the helper text and existing EditField error pattern. Ensure vertical placement below the main input within the responsive grid.
- [x] Move guardianContactNumber from REGISTRATION_SECTION_FIELDS.family to .contact. Preserve serialization and full-form saves.
- [x] Run existing profile, registration payload and server-rendered profile tests: node --test src/utils/patientProfile.test.js src/utils/patientRegistrationPayload.test.js src/components/features/patients/profile/RegistrationSections.test.js (cwd frontend). Expected: zero failures.
- [x] Verify with a temporary server-rendered inspection that the alternate number is in Contact only, its contact editor shows one input, family editor has none, the inline error is visible, persisted values round-trip, and explicit clears serialize null. No permanent tests for this reversible UI relocation.
- [x] Run npm run build, scoped ESLint and git diff --check. Inspect available browser surfaces; report inability to do live visual QA if none are connected.
- [x] Review the scoped diff against the approved spec and record verification in work state. Leave changes uncommitted in the authorized workspace.

## Execution notes

- Ruling: use the current workspace for this bounded change, preserving unrelated edits; no worktree move or commit is needed for delivery.
- Ruling: existing verification plus temporary behavior inspection replaces new tests, following the session instruction against tests for reversible low-impact changes.
- Ruling: add the missing guardian_contact_number -> guardianContactNumber error mapping; a reproduced backend-shaped error otherwise cannot reach the approved inline error display.
- Pre-flight: one task, no inter-task interfaces.
