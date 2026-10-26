# BHC Health Record Details Presentation Plan

**Goal:** Implement Eric's approved focused revision, including historical-only Legacy Recorded Information on screen and print.

**Architecture:** Keep fetching in the existing TanStack Query route. Share read-only presentation readers and a compact details component between screen and print. No controller, stored procedure, schema, saving, referral-transition, or task-fulfillment changes.

**Approach:** Refine existing workspace and print modules rather than replace the record page. Reuse reporting readers and explicit episode relationships; do not infer clinical confirmation or manufacture tasks from legacy statuses.

**Tech Stack:** Existing React, shadcn/ui accordion, Tailwind, Node test runner/Vite SSR.

## Tasks
- [x] Add regression cases and verify failures for current versus legacy data, task schedule authority, reporting groups, sparse vitals, and related records.
- [x] Add shared presentation readers/components; retain explicit parent links for General Consultation.
- [x] Update workspace and print labels, vital presentation, outcomes, reporting, and historical information.
- [x] Run relevant render/helper/reporting/scheduling tests, targeted lint, production build, and review diff.

## Review focus
- Normalization must not turn the synthetic Routine Monitoring fallback into a saved legacy value.
- Tasks are scoped to the current source record; fulfilled/cancelled tasks must suppress stale saved dates.
- Modern explicit empty reporting selections must not revive legacy classifications.
- Related visits use episode/parent IDs only, sort chronologically, and remain navigable.
- Missing or zero-sentinel measurements must not become clinical observations; existing saved values remain untouched.

## Verification and limitations
- 113 relevant tests passed (details SSR, reporting readers, workflow compatibility, schedules, services, and program helpers).
- Targeted ESLint and production Vite build passed; build reports its large-chunk warning.
- Independent review found four compatibility issues; regression tests and fixes resolve them.
- Browser inventory was empty; responsive visual inspection and actual print pagination remain unverified. Temporary preview files and server were removed/stopped.
- Zero measurements without provenance are omitted for display; saved values remain unchanged. Saved schedules without task data explicitly show task status unavailable.
