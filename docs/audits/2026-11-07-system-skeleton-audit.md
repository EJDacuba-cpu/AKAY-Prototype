# AKAY skeleton audit — 2026-11-07

Status: analysis complete; implementation proposal awaiting Eric's approval. No skeleton or loading production code edited.

## Intent and proposed standard

Eric wants accurate skeletons for every AKAY module, including heading/text lines and button/control shapes, and asked for analysis before edits. He delegated the best loading behavior to the implementer.

Recommended policy:

- First uncached page/entity load: skeleton for the entire page content, including title, subtitle, toolbar, search/filter/action shapes, tabs, cards/table/form/calendar and relevant pagination. Match the actual module's composition, widths, row heights and responsive behavior.
- Keep the existing app navigation/sidebar available. Authentication restoration remains a separate secure boot state.
- Background refresh, filter/search, pagination and mutations with usable same-entity content: retain it with Updating feedback, appropriate busy state and temporarily disabled conflicting actions. Preserve the existing Audit Logs behavior.
- A different entity must not show the previous entity's records. A new entity gets its own loading state when its data is unavailable.
- Cached ready content renders immediately. Do not add fake waits to make skeletons appear. A blank new form that needs no asynchronous data does not need a pretend loader.
- Empty, failed, forbidden and genuinely pending are distinct states. Never use loading placeholders to imply nonexistent records or show a false empty state before a request settles.
- Skeleton controls are decorative, not focusable or clickable; one loading announcement per region. Use common tokens and respect reduced motion.

## Scope and evidence

- 11 variants in `frontend/src/components/common/loading/skeletonVariant.js`.
- 37 `SoftLoadingArea`/`PageStateWrapper` consumer call sites in 36 files, plus local/custom skeletons in Families, Doctor Availability, Notifications and Edit Account.
- Read the shared state wrappers, overlay, variants and corresponding loaded modules across Admin, BHC and RHU. Some routes share components across roles.
- Rendered the actual shared skeleton components through Vite SSR without fetching real user/patient data. Verified structural classes, placeholder blocks and status regions. These are structural checks, not browser screenshots.
- `npm.cmd run test:skeleton`: 2 passed. They verify variant dispatch and fallback only; they do not test page fidelity, query transitions, responsive layouts or accessibility behavior.
- Impeccable detector on shared loading files, PageLoadingFallback, BhcFamilies and DoctorSchedule: `[]`. Its static rules do not detect incorrect semantic mappings between pages and their skeletons.
- Chrome DevTools cannot find a Chrome executable. Computer-use inventory has no browser/app. No committed visual goldens were found. Pixel alignment, computed geometry, CLS, focus behavior and physical/mobile browser behavior remain unverified.

## Health assessment

Provisional source-based scores, limited to skeleton/loading implementation, not an overall AKAY/WCAG certification:

| Dimension | Score | Evidence |
|---|---:|---|
| Accessibility | 2/4 | Shared status/hidden-decoration semantics and reduced-motion shimmer exist; local pulse loaders do not consistently follow them. |
| Performance | 3/4 | Shared shimmer uses transform; several templates render structures the actual page does not contain. No runtime profiling available. |
| Theming | 2/4 | Shared hardcoded slate/hex placeholders, local neutral pulses and static blocks use different visual treatments. |
| Responsive | 2/4 | Generic table skeleton stays a wide table where actual modules switch to mobile cards; Facilities breakpoints differ. |
| Implementation integrity | 1/4 | Multiple active routes select obsolete or unrelated layouts; dispensing initial loading/error is bypassed. |
| Total | 10/20 | Significant consistency work needed; numerical assessment is provisional. |

Integrity verdict: the loading system is reusable, but its page-to-template contracts are inconsistent. No P0 established. Findings: 1 P1, 9 P2, 1 P3.

## Verified findings

### P1 — Dispensing queue bypasses its initial loading and error states

`frontend/src/components/features/medicine/RhuToDispenseTab.jsx:73` passes unconditional `hasData` to PageStateWrapper. Both initial-loading and initial-error branches in `frontend/src/components/common/PageStateWrapper.jsx:19` require `!hasData`.

The active `/rhu/to-dispense` route uses this component. While the first query is pending or has failed, the component can render its empty rows as “No prescriptions to dispense.” SSR of the wrapper with the same boolean combination confirms children render and no skeleton is produced.

Recommendation: derive usable/settled data from the query; separate pending, error, successful empty and refresh. Use a dispensing queue skeleton, not the inventory skeleton. Suggested command: impeccable harden.

### P2 — Patient profile skeleton reflects an obsolete layout

`SkeletonLoaders.jsx:474` renders a 300px sidebar and generic field sections. BHC `PatientDetails.jsx:405` and RHU `RHUPatientDetails.jsx:372` render PatientProfileHeader, tabs and PatientOverviewBoard; the board has a distinct responsive three-part anatomy/clinical layout.

Recommendation: profile-specific header, care path, tabs and overview placeholders matching the current board; share between roles only where the real structures match. Suggested command: impeccable layout.

### P2 — Medicine skeleton is used for three different surfaces

`SkeletonLoaders.jsx:382` contains inventory search/filter shapes, two tab shapes and nine columns. The current `MedicineInventoryTable.jsx:48` has five columns and a mobile card view. `pages/shared/MedicineDetailsPage.jsx:92` also selects `medicine`, even though its actual content has a back link, action buttons, five stock-summary values, expiry-group ledger and history. The dispensing queue also selects the inventory variant.

Recommendation: distinct inventory/details/dispensing compositions with shared primitives. Suggested command: impeccable layout.

### P2 — One dashboard template is reused for incompatible role layouts

`SkeletonLoaders.jsx:281` is shared by AdminDashboard, BHCDashboard and RHUDashboard. BHC puts KPI cards before the welcome panel and has a separate quick-action row; the skeleton reverses the first row and lacks that row. Admin's final section uses 4/8 columns; the skeleton uses 4/5/3. RHU has its own doctor-availability section and permission-dependent content.

Recommendation: role-specific compositions; preserve role gates rather than exposing restricted data under a loader. Suggested command: impeccable layout.

### P2 — Generic table skeleton cannot represent module schemas

`SkeletonLoaders.jsx:345` defaults to five columns and seven rows. `PageSkeletonLoader` does not forward consumer-specific columns/row heights. Generic TableShape also adds its own card title/footer. Actual account, audit, patient, queue and access-request modules have different structures; the patient directory is not simply this generic table.

`AccessRequestTable.jsx:72` uses 44px rows/36px headers and mobile cards below lg; TableShape uses padded grid rows and a 760px minimum table at every breakpoint. Other modules likewise switch to cards.

Recommendation: shared configurable primitives driven by actual columns, row/head heights, footer and responsive mode. Do not create a separate animation system per page. Suggested command: impeccable adapt.

### P2 — Clinical reports and account analytics share an unrelated composition

`SkeletonLoaders.jsx:438` assumes one selector, four KPI cards and a table. AdminReports uses Account & Role Analytics with role/status/access panels; BHCReports and RHUReports have actual period controls, print/export actions and category-specific charts/tables. FamilyPlanningList uses the same skeleton for its much wider TCL table and retains its own title outside the loader.

Recommendation: distinguish account analytics, clinical overview/category reports and TCL; represent their actual controls and charts. Suggested command: impeccable layout.

### P2 — Initial coverage is inconsistent for headings, controls and cards

AccessRequestTable intentionally keeps its toolbar outside `bodyOnly` loading. Families, Notifications, Doctor Availability and Edit Account also expose some live heading/control chrome while showing partial placeholder bodies. This is inconsistent with Eric's requested full initial page-content skeleton.

Conversely, FacilitiesSkeleton has tabs/cards but no matching page heading/search/filter toolbar, uses xl three columns while the real grid adds four at 2xl, and does not match the current routing/action card content. Generic TableSkeleton has heading blocks but no actual search/filter toolbar representation (confirmed by SSR).

Recommendation: explicitly define full-page initial scope versus nested-region scope. A nested panel should not synthesize another page heading. Suggested command: impeccable harden.

### P2 — Form and calendar loading states lack their own structure

`StaffAssignments.jsx:183` uses a table skeleton even for the create-assignment route. AddUser edit loading shows three input bars while its step navigation, heading and footer are already rendered. Generic referral form skeletons assume eight fields. Families details/forms show two large blocks; DoctorSchedule shows two blank pulse panels rather than calendar cells/doctor controls. FollowUpsSkeleton only represents a table even though FollowUps supports list/week/month modes.

Recommendation: map actual form steps, calendar mode, labels and actions instead of large anonymous rectangles. Suggested command: impeccable layout.

### P2 — Missing variants silently select a generic module shape

`RhuReferralSlip.jsx:53` and `patients/profile/FollowUpsAndReferrals.jsx:83` do not specify a variant. They receive `module`, whose chart/sidebar layout is inappropriate for a referral slip and a small profile panel. PatientRecordsTab also displays its own toolbar above a skeleton that creates another toolbar.

Recommendation: explicit destination-appropriate/nested shapes; keep the safe fallback but add coverage for known callers. Suggested command: impeccable harden.

### P2 — Motion and loading accessibility are not consistently shared

The common SkeletonRoot announces loading and hides decorative blocks. Its shimmer stops under reduced motion. Families and DoctorSchedule use local `animate-pulse` without their own reduced-motion alternative; generated CSS confirms animate-pulse itself has no automatic motion guard. DoctorSchedule's initial panels are aria-hidden without a dedicated loading announcement in that branch. Notification rows have a separate static loading shape.

SoftLoadingArea also always renders children beneath its overlay; the primitive does not make them inert. SSR confirms a child button remains in the tree. Several existing consumers hide children themselves, so do not claim every current page has a keyboard bug; verify consumers individually before making a shared behavior change.

Recommendation: shared decorative primitives, one accessible loading status, motion-safe animation and intentional focus handling for the regions actually being replaced. Suggested command: impeccable harden.

### P3 — Placeholder theming differs between implementations

The common block is hardcoded `#EEF2F7` with slate card styling; local loaders use neutral or slate pulse/static blocks. This is design-system drift, not a claim that decorative skeleton contrast violates text-contrast standards.

Recommendation: use the existing neutral tokens consistently, including control radius and row separators. Suggested command: impeccable polish.

## Existing behavior to retain

- AuditLogs distinguishes first load from later fetches and preserves rows/pagination with Updating logs.
- Dashboard and many patient/detail modules already retain cached content for background fetches.
- Shared skeletons have safe unknown-variant fallback, hidden decorative blocks and an accessible loading message.
- Query caching, authorization and existing inline validation must remain intact. No Laravel controller or PostgreSQL stored procedure change is needed for skeleton presentation.

## Proposed implementation order

1. Fix the dispensing pending/error/empty distinction and define one frontend loading-state policy; retain already-correct refresh behavior.
2. Consolidate placeholder primitives, status announcements and motion/token behavior. Add configuration for actual toolbar/table/footer/mobile structures.
3. Update full initial skeletons for Admin pages: dashboards, accounts, reset/invites, facilities, assignments and account analytics.
4. Update shared BHC/RHU clinical directories, current patient overview, records/referrals/slips, medicine inventory/details/dispensing and reports. Use separate role/mode compositions where actual layouts differ.
5. Update Families, forms, calendar modes and nested profile panels, then run impeccable polish as the final pass.

Verification: transition tests for initial pending/error/successful empty/cached/refetch/new entity; template structure and required controls per module; desktop/mobile comparisons when a browser is available; keyboard and reduced-motion checks; targeted regressions, scoped lint and production build. No artificial waits, new API, database migration, polling or scheduled job.

Follow-up commands can be run separately or together after approval. A follow-up audit should assess the implemented states; do not interpret the current static detector's empty output as proof of layout fidelity.
