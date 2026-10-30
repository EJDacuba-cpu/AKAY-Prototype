# Clinic Ledger medicine details implementation plan

> Use executing-plans inline. The supplied approved UI/UX brief is the design authority; do not add another approval round for the same scope.

**Goal:** Shared BHC/RHU clinic inventory with dedicated Medicine Details and focused stock forms.
**Architecture:** Frontend route adapters and shared components reuse current medicine APIs, ledger queries and permissions.
**Tech stack:** React, React Router, TanStack Query, shadcn/ui, Tailwind.
**Spec:** `../specs/2026-10-28-clinic-ledger-medicine-details-design.md`.

## Global constraints
- No backend stock/business changes, migrations or new permissions.
- Exactly five row actions; no expandable rows or Details/History modals.
- Stock writes and destructive item management retain inventory.manage and server facility authorization.
- Use existing Clinic Ledger tokens, pill controls, responsive sheet/table layout and inline validation.

## Review focus
- Direct Details URLs must not reuse another facility's cached medicine.
- Expired available stock can still be deducted/quarantined; expired quarantined stock cannot be released.
- Background refetch must not reset an entered quantity/reason or change its operation key.
- List quantity breakdown appears only for differing recorded/available totals.
- Only one history surface and one stock-action form; stock commit refreshes all affected queries.

## Tasks
1. [x] Add failing helper/component tests for route/actions/FEFO/quantity display and permission gates.
2. [x] Extend shared stock form for quarantine/release/disposal and reuse existing APIs through one action dialog.
3. [x] Implement shared Details page, paginated history, protected management and both routes/breadcrumbs.
4. [x] Replace duplicate inventory surfaces with shared Clinic Ledger list and five actions; remove obsolete expandable/modals code.
5. [x] Update affected tests, run focused checks/build, fresh review and bounded UI verification attempt; document the remaining authenticated browser check.

## Ledger
- Initial worktree: feature checkout; clean except unrelated `.claude/settings.local.json`, which is preserved.
- Existing baseline: medicine frontend45 passing. Full-suite unrelated failures documented in expiry-groups report; backend stock logic is outside this task.
- History default: link to Details `#history` after optional clarification opportunity; adapt if Eric supplies a preference.
- Pre-review checks: medicine55 passed; changed-file lint and production build passed.
- Review fix: preserve form identity/entries/key across Manila midnight, with scope-specific calendar placeholders. Metadata edit snapshot is retained through refetch.
- Review ruling: nested expiry groups are already eager-loaded by the backend relation; the alleged absence is not established. Added a safe frontend ID lookup and fallback regardless, without modifying the API.
- Disk-space blocker resolved after Eric freed capacity. Final verification: medicine56 passed, breadcrumbs13 passed, changed-file ESLint passed, production build passed (existing large-chunk warning), diff whitespace check passed.
- Browser limitation: CUA exposed no enabled apps/browsers and the bounded headless preview produced no screenshots. Authenticated desktop/mobile interaction remains a manual check; SSR coverage is not presented as browser verification. Reproduction commands and limits are in `../reports/2026-10-28-clinic-ledger-medicine-details.md`.
