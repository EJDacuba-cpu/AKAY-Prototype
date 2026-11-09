# System skeleton accuracy implementation plan

Spec: docs/audits/2026-11-07-system-skeleton-audit.md, approved by Eric in chat.

Goal: Full, accurate initial page-content skeletons; preserve usable content during same-entity refetch, search/filter and pagination. No fake waits or loading for ready cached content. Preserve app navigation, role gates and backend workflows.

Architecture: Shared decorative primitives and module-specific React compositions. Extend the existing PageSkeletonLoader API; TanStack Query or existing fetch lifecycle remains the source of pending/error/settled state. No Laravel, schema, stored procedure, new API, polling or job changes.

Shared interface:
- PageSkeletonLoader({skeleton, message, bodyOnly=false, options={}}).
- PageStateWrapper, PageLoadingFallback, SoftLoadingArea/Overlay forward optional skeletonOptions as options. bodyOnly means nested region: omit page heading/toolbar, never synthesize another page.
- Existing exports (TableSkeleton with rows/columns, DashboardSkeleton etc.) remain compatible.
- New named profiles: admin-dashboard, bhc-dashboard, rhu-dashboard, accounts, audit, patients, referrals, queue, access-requests, assignments, assignment-form, account-form, medicine-details, dispensing, admin-reports, tcl, family-directory, family-details, family-form, doctor-calendar, notifications, referral-slip, referral-form, feedback-form, profile-referrals. Existing variants remain valid.
- Options may specify rows, columns, rowHeight, headHeight, minWidth, mobileCards, desktopBreakpoint, role, view, category, cardCount, chartCount. Default compositions must reflect current page structure. No caller should fake data to drive rendering.

Tasks:
1. Root: shared component/variant/configuration updates; meaningful RED/GREEN structural and loading-state tests; token and reduced-motion handling; wrapper scope/keyboard semantics.
2. Admin/custom owner: Admin pages and password-access components; Families, DoctorSchedule, Notifications custom skeletons. Own only those consumer files. Use the shared interface, preserve cache/refetch behavior and existing permissions.
3. Clinical owner: remaining BHC/RHU/shared clinical consumers, profile nested panels, medicine, reports and referral pages. Fix dispensing hasData bug with pending/error/empty regression checks. Own only these consumers, not shared loaders or Admin/custom files.
4. Root integrates consumer work; verify profile coverage and full/nested ownership, fix disagreements. Independent read-only review then one fix pass.
5. Final scoped lint, meaningful regressions, production build, detector pass and full frontend suite. Browser unavailable in audit; use actual React SSR structural/transition evidence and disclose unverified pixel/focus/touch behavior.

Work on current Eric-Manually-Fixer checkout as requested. Preserve existing FacilityFormModal.jsx change and .claude/settings.local.json. No commit, merge or push. Canonical task/decision ledger: claude-mem work_state system-skeleton-implementation.
