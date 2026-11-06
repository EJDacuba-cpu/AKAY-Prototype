# BHC Reports navigation and period filter implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add supported BHC report categories to the sidebar and consistent explicit date Apply controls across every category.

**Architecture:** Preserve the shared category report engine and authorized query sources. A dedicated period filter component owns its draft; BHCReports owns the applied resolved range. Sidebar links reuse the type query parameter and normalize legacy category aliases.

**Tech Stack:** React, Tailwind, shadcn/ui Button, existing DatePickerField, TanStack Query, existing report utilities.

**Spec:** docs/superpowers/specs/2026-11-05-bhc-reports-navigation-period-filter-design.md

## Global constraints

- Eric approved the written design and explicitly requested execution. Implement inline without another approval gate.
- Default All Categories; supported REPORT_CATEGORIES only. No invented category-specific clinical filters, RHU/Admin changes, backend/schema/query-key changes, or duplicate report engines.
- Every category's Weekly/Monthly/Custom selection remains a draft until Apply. Preserve existing Sunday/current-month and blank-To single-day semantics, consistent printing and inline errors.
- Preserve prior registration/Follow-ups and unrelated workspace changes. Leave reviewable changes uncommitted in the current non-main workspace.

## Review focus

- Alias and missing type query parameters must highlight the same report category that is rendered.
- A locked Reports item must never expose clickable children.
- Active Reports can collapse, and collapsed desktop rail can reveal children.
- Invalid Custom draft and Reset changes cannot change the applied totals/range.
- Category navigation must preserve the common applied reporting range; all categories use the same date controls.

## Task 1: Sidebar category navigation

**Files:** frontend/src/components/layout/sidebar/sidebarData.js, DesktopSidebar.jsx, FullSidebarNav.jsx; frontend/src/components/layout/DashboardLayout.jsx; a focused sidebar navigation utility if needed.

**Interfaces:** REPORT_CATEGORIES + normalizeReportCategory; existing menu item children, parent locked flag, router location/navigate callbacks.

- [x] Build BHC Reports children from actual categories, with All Categories first and canonical query links; retain existing legacy exports used elsewhere without activating unsupported entries.
- [x] Add query-aware category matching while preserving unrelated active-route matching.
- [x] Open default All Categories when Reports is opened from another module; expand the collapsed desktop rail. Allow active groups to close. Preserve permission guards and mobile child-navigation close behavior.
- [x] Verify all categories, missing/legacy/invalid aliases, other routes, locked menu and desktop/mobile markup with temporary checks; run existing access/breadcrumb/report regressions.

## Task 2: Shared applied date controls

**Files:** frontend/src/components/features/reports/BhcReportPeriodFilter.jsx, optional focused period draft utility, frontend/src/pages/bhc/BHCReports.jsx.

**Interfaces:** component receives applied selection/range and onApply; pure validation/resolution reuses resolveReportPeriod; report and PrintReport receive the applied period object.

- [x] Add always-visible draft preset buttons and editable From/To, inline validation, Apply and Reset changes. Editing dates selects Custom. No Filter trigger, per Eric's implementation-time amendments.
- [x] Store the common applied selection and resolved period independently from draft state. Remove the duplicate legacy category period controls; preserve report calculations. Categories now live in the sidebar.
- [x] Give category views appropriate report titles. Keep period labels, cards, charts, summary and printing on the applied period until Apply succeeds.
- [x] Verify fixed-date ranges, invalid drafts, blank To, reset-to-applied behavior, visible preset markup and report totals using temporary behavior checks plus existing report tests. No permanent implementation-mirroring tests for this bounded UI change.

## Task 3: Review and delivery

- [x] Live selection: soft gray controls (6912e72f, variant 1) and plain Showing summary below controls (5893ccf4, variant 1). Remove instruction copy, bake accepted styles into report-period-controls.css and remove all preview code. Both sessions completed; helper stopped, existing Vite site still answers.
- [x] Final verification after live acceptance: production build and scoped ESLint pass; 15 existing report/pagination tests pass. Temporary SSR checks all three presets have enabled date triggers and an applied summary after dates; validation rejects future/reversed ranges, blank-To resolves to one day, CSS has responsive container queries and no preview markers. Existing build bundle-size warning remains. Automated browser interaction/screenshot checks unavailable; user reviewed and accepted the live overlay previews.

- [x] Run frontend build, scoped lint and scoped diff checks. Inspect available browser surfaces and report unavailable live verification honestly.
- [x] Request one focused read-only final review as required by executing-plans; fix material findings and verify affected behavior.
- [x] Record results in work state and mark this plan complete. Deliver concise Taglish explanation, focused diff excerpts, checks and limitations.

## Rulings and execution notes

- Current workspace is authorized and contains earlier accepted changes; preserve them rather than creating an isolated copy that omits the user's working state.
- Use canonical claude-mem work state as the execution ledger. Existing checks and temporary behavior assertions replace permanent low-impact UI tests per session instructions.
- Pre-flight: Task 1 produces query-driven category navigation consumed by Task 2's existing BHCReports category selection; preserve that query contract.
- Amendment: Eric explicitly removed the Filter-button design during implementation. Always show Weekly/Monthly/Custom and retain Apply; no additional approval required.
- Review fix: carry openSidebarGroup through router state so a route/layout remount preserves the opened desktop rail/mobile drawer.
- Follow-up amendment: Eric requested consistent controls for every category. Replace the legacy category bar with the shared component and applied range; keep From/To slots mounted/disabled outside Custom, constrain long date labels, reserve inline-error space, and verify stable markup across presets. No additional clinical filters or backend work.
- Follow-up verification: build and scoped lint pass; 38 existing regressions pass. Temporary rendering checks confirm identical grid markup across Weekly/Monthly/short and long Custom dates, permanent disabled/non-disabled slots, validation spacing, and compiled grid/truncation rules. Layout detector [] and scoped diff check clean. No connected browser for live visual QA.
- Verification: 38 existing report/access/breadcrumb checks pass; scoped lint clean; production build passed with existing bundle-size warning; temporary fixed-date, invalid-range, aggregation, query-alias, sidebar SSR/permissions/open-intent, and always-visible-controls checks pass; layout detector [] and scoped diff check clean. Browser inventory empty, so live visual/interaction verification unavailable.
