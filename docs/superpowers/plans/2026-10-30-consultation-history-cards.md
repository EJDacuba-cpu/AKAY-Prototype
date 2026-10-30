# Consultation history cards implementation plan

**Goal:** Give both consultation workspaces the approved per-section read/edit behavior.

**Architecture:** Shared React history presentation and existing summaries, validation and staged background updates; shadcn Card/Button with Tailwind tokens.

1. Cover saved-data defaults, partial sections, explicit edit state, validation reopening and hidden fields with focused state tests.
2. Consolidate the inline and recorded-summary branches in PatientHistoryPanel into reusable cards. Keep field components and save ownership intact; validate Done using existing rules.
3. Key consultation history panels by patient in BHC, RHU and the shared prenatal form.
4. Run history and consultation regressions, scoped ESLint, build and diff checks. Report unavailable visual verification.

Eric approved the behavior through the interview, including partial sections and Done without an independent save. Preserve unrelated workspace changes; no commit, push or migration.
