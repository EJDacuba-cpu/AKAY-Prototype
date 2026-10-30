# RHU consultation visual alignment implementation plan

**Goal:** Match the RHU consultation wizard to BHC while preserving RHU behavior.

**Architecture:** Reuse consultation-ehr.css layout roles and shared shadcn controls. RHU state and API logic stay in their existing modules.

**Tech stack:** React, Tailwind, shadcn/ui.

1. Add shared pinned stage, header, scrollable form, conditional panel and footer structure in RhuConsultationWorkspace.jsx; use Card for local clinical sheets.
2. Extend consultation-ehr.css only for explicit sheets and RHU service form surfaces; retain existing BHC selectors and breakpoints.
3. Verify JSX with production build and scoped ESLint; run existing RHU consultation and wizard regression tests, inspect the diff, and report browser verification availability.

Execution authorized by Eric's “go ahead”; no further planning approval needed. No merge, commit, push, migration or production writes.
