# System skeleton implementation and verification

Date: 2026-11-07. Branch: `Eric-Manually-Fixer`. Approved source audit: `2026-11-07-system-skeleton-audit.md`. Changes remain uncommitted.

## Diagnosis and implementation

The original loaders reused generic layouts across unrelated screens, omitted visible page controls, and sometimes confused unavailable initial data with successful empty results. This implementation keeps the shared notification and clinical workflows intact while making initial loading follow each page's actual content composition.

- Shared shadcn-style primitive: `frontend/src/components/ui/skeleton.jsx`. Decorative shapes use existing neutral tokens and motion-safe pulse with reduced-motion support.
- Shared compositions: `frontend/src/components/common/loading/SkeletonLayouts.jsx`; table contracts: `skeletonProfiles.js`; explicit registry: `skeletonVariant.js`. The registry supports 39 names, including compatibility aliases.
- Existing `SkeletonLoaders.jsx` exports remain available. `TopLoadingBar` was extracted without changing its progress behavior.
- `PageStateWrapper`, `PageLoadingFallback`, and `SoftLoadingArea` forward optional skeleton options. Full initial content includes heading, subtitle, controls and body shapes. Nested regions omit duplicate page headings; health-record filters have their own nested toolbar.
- Pending replacement content is hidden and inert. Settled content retains its original direct-child DOM structure, preserving the clinical directory's flex sizing and independent scrolling selectors.

## Coverage

| Area | Loading composition |
| --- | --- |
| Admin/BHC/RHU dashboards | Separate role-specific welcome, KPI, chart and activity arrangements |
| Accounts, audit, access requests, assignments | Actual table column contracts, row heights and mobile presentation; assignment/account forms separately represented |
| Facilities | Search/filter/type tabs and responsive facility-card grid |
| Patients and monitoring requests | Patient card directory versus monitoring list; shared current anatomy/clinical overview for BHC and RHU |
| Records and referrals | Record detail sections, referral detail/arrival/waiting modes, referral slip, nested history tables and compact referral lists |
| Medicine | Five-column inventory, medicine detail/ledger/history, four-column dispensing without invented pagination |
| Reports | Admin analytics, clinical category counts, RHU overview trend arrangement, summary tables and TCL |
| Families | Directory table, relationship tree/list modes, edit form and permission-dependent action shapes |
| Forms and schedules | Referral/feedback forms, account steps, doctor calendar, follow-up list/week/month |
| Notifications | Inbox/sidebar/toolbar composition; nested first Trash load without replacing already loaded page controls |

## State rules and repaired regressions

1. Initial uncached and newly selected entities show a content skeleton. Ready cached results render immediately. Enabled queries use pending status so an offline paused request cannot masquerade as successful empty data.
2. Successful empty arrays count as loaded data. Background refresh retains the current content and uses an Updating indicator; ordinary refresh errors do not erase a previously loaded frame.
3. Initial failures show existing recoverable errors. AddUser create/edit can retry failed lookups; referral and monitoring connection failures are distinct from not-found results.
4. Authorization failures (401/403) suppress retained restricted content. Aggregated clinical queries prioritize authorization errors before ordinary failures.
5. Dispensing no longer passes unconditional `hasData`; its initial loading and errors can now reach the shared boundary.
6. Notification cache readiness is separate from staleness and scoped to the current identity. Inbox and Trash track successful loading independently, including successful empty results. No notification event, recipient, deduplication, resolution or delivery workflow was changed.

TanStack Query and existing fetch state own data readiness. React owns placeholder presentation. No Laravel controller, Supabase stored procedure, API, table, polling, scheduled job or dependency change was needed. Existing RHU Barangay form revision was preserved.

## Verification

- Final complete frontend suite: **1,698 passed, 0 failed, 0 skipped** (`node --test --test-concurrency=2 --test-reporter=spec`, all `src`/`config` `.test.js` files).
- Real React SSR regressions cover pending/error/successful-empty/cached refresh/offline paused dispensing, nested records/referrals, monitoring request query selection, account load recovery, access-list retention/auth denial, notification readiness/session isolation, and shared accessible/decorative structures.
- Tests were observed failing before the corresponding behavior fixes, then passing.
- Scoped ESLint across changed/new JavaScript and JSX: **0 errors**. One existing `FollowUps.jsx` effect dependency warning (`cleanTaskQuery`) remains.
- Production build: **passed**, 3,052 modules transformed. Existing large bundle warning remains (main JS about 3.32 MB before gzip).
- `git diff --check`: passed.
- Impeccable layout detector: no deterministic findings (`[]`). This is static evidence only.
- Independent read-only review found and drove fixes for wrapper layout, RHU anatomy composition, first Trash readiness, account loading, cached empty results, authorization gates and paused initial queries.

## Verification limits

No usable browser surface was available: Chrome DevTools could not locate Chrome and computer-use reported no browser surfaces. Actual desktop/mobile screenshots, pixel alignment, CLS, keyboard focus movement and touch behavior remain unverified. SSR checks validate rendered structure and state decisions, not browser layout. No live patient data or backend mutation was used. No commit, merge, push or deployment was performed.
