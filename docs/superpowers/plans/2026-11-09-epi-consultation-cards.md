# EPI Consultation Cards Implementation Plan

> **For agentic workers:** Implement inline using the approved chat brief. Steps use checkbox syntax for tracking.

**Goal:** Match BHC and RHU EPI sections to the existing Interview and Physical Examination cards.

**Architecture:** Add an opt-in card section primitive alongside the existing clinical primitives, using the consultation sheet classes and shared design tokens. Use it in the shared EPI form and BHC inventory section; leave existing plain clinical sections unchanged.

**Tech Stack:** React, Tailwind CSS, Vite.

**Spec:** `docs/superpowers/specs/2026-11-09-epi-consultation-cards-design.md`

## Global Constraints

- Preserve field labels, order, visibility, callbacks, vaccine history locks, completion messages, validation, permissions, and saved payloads.
- Keep the patient profile, clinical rules, other service forms, and backend unchanged.
- No new dependencies, no new clinical logic, no automatic commit.

## Review Focus

Check long vaccine labels, conditional screening, locked history controls, the selected-vaccine inventory section, and narrow layouts. Existing EPI tests cover the underlying history and applicability rules; visual inspection covers the presentation.

### Task 1: Apply and verify shared EPI cards

**Files:** `frontend/src/components/features/health-records/fields/ClinicalFields.jsx`, `frontend/src/components/features/health-records/ImmunizationVisitFields.jsx`, `frontend/src/pages/bhc/ConsultationWorkspace.jsx`.

- [x] Add `ClinicalSectionCard({ title, subtitle, children })` with the existing consultation sheet roles, divided heading and padded content.
- [x] Use the card primitive in the shared EPI form, with 16px section spacing.
- [x] Use the same primitive for the conditional BHC vaccine inventory section, preserving every control and handler.
- [x] Run targeted lint, existing EPI tests, and the frontend build.
- [x] Inspect desktop/mobile output and review the diff for functional changes.

Execution note: The user's "go ahead" authorizes implementing the approved brief in the current workspace; no additional approval round is needed.

Verification: targeted ESLint passed; 10/10 existing EPI tracking/applicability tests passed; `npm.cmd run build` passed with the existing bundle-size advisory. Sample-data renders of the actual shared form were inspected for both facility configurations at desktop and exact 390px mobile widths; cards have the existing 16px radius, divided headers, 20px body padding, and no horizontal overflow. These are isolated form previews, not an authenticated end-to-end consultation. `git diff --check` passed. Existing unrelated workspace changes were preserved.
