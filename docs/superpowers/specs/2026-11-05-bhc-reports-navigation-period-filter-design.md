# BHC Reports navigation and period filter

Status: approved by Eric ("sure go ahead"), 2026-11-05. Amended during implementation: "no filter button na kasi naka show na ito"; period controls are always visible, with Apply retained.

Latest amendment: Eric selected the soft gray control style in Impeccable Live, followed by the plain applied-range summary below the controls. From/To remain editable in every preset and show its resolved dates; editing either date switches the draft to Custom. Apply still updates the report explicitly. Remove the custom-range instruction text. All categories share this responsive layout, minimum validation space and local date-text truncation. Additional clinical/report-specific filters remain outside this amendment.

## Intent and first scope

Reports opens with All Categories by default. An expandable Reports sidebar group provides category-specific views. Every BHC report category uses the same always-visible Weekly, Monthly, Custom, Apply and Reset controls and the same committed reporting range. Additional category-specific filters require a separate workflow discussion; do not invent them from field availability alone.

## Approaches

- Selected by Eric's latest amendment: an always-visible period bar gives direct access; no Filter trigger or expandable panel.
- Superseded during implementation: a Filter button opening an inline panel. Eric changed his preference to permanently visible Weekly/Monthly/Custom controls.
- Superseded: putting the report category in a filter popup. Eric instead requested category choices in the Reports sidebar dropdown.

## Navigation

- Use the existing report engine and supported REPORT_CATEGORIES: All Categories, EPI / Immunization, Maternal Care, Family Planning, Morbidity, Notifiable Diseases, Community Surveillance, Referrals.
- Use the existing /bhc/reports route with its type query parameter. Do not create duplicate report pages or include the old unsupported TB/follow-up menu entries.
- Proposed implementation choice: opening Reports from another module expands its submenu and opens All Categories. While already inside Reports, the group can be collapsed/reopened without changing the selected category. Clicking a category opens its existing report view and highlights that exact category.
- Desktop collapsed-rail behavior must reveal the submenu when Reports is opened. Mobile keeps the expandable group usable and closes the drawer after selecting a category. Retain parent Reports authorization for all children.
- Query-aware active matching must agree with the report engine's normalization, including existing legacy category aliases. Keep unrelated navigation behavior and permissions intact.

## Shared date controls

- Weekly/Monthly/Custom and Apply are always visible; no Filter button or popup. Use existing shadcn/ui Button and Input patterns, the existing date picker, and Tailwind styling within the current AKAY design system.
- Weekly, Monthly, and Custom modify draft selection only. All date selections require Apply; the current figures, displayed range, charts, summary, and printable report continue using the last applied range until then.
- From and To keep permanent positions in the responsive grid and remain editable. Weekly/Monthly display their resolved dates; editing a date or choosing Custom seeds the custom draft from the displayed range. Reserve minimum validation space and constrain selected-date text locally so date changes do not determine field widths. Show required-start and invalid-range errors beside their fields without clipping messages. Preserve the existing single-day behavior when To is blank; never silently reverse an invalid range in the UI. Future dates remain unavailable.
- Reset changes restores the applied selection, discarding unsubmitted edits. Show the applied date range beside the controls. Applying keeps the controls visible.
- Preserve existing range definitions: Weekly is Sunday through today; Monthly is the current month through today. Monthly remains the initial applied preset.
- Apply freezes the resolved range consistently for the displayed report and print. An invalid draft does not change the applied report.

## Category-specific views and boundaries

Category links expose the existing category reports and appropriate titles. Date controls and Apply/Reset behavior are now unified across all of them. Additional filtering dimensions are still to be defined with Eric from actual BHC reporting needs. Preserve existing calculations. Do not add vaccine, method, clinical status, area, or diagnosis filters merely because such data exists in code. RHU/Admin Reports are outside this scope.

## Architecture

React owns panel visibility, draft values, inline validation, applied range, and navigation state. Reuse resolveReportPeriod and buildBhcReport; preserve report units and aggregations. TanStack Query continues fetching and caching the same authorized report sources; date Apply filters those sources locally and does not add endpoints or query keys. Existing Laravel authorization/data access remains unchanged. No PostgreSQL stored procedure or migration is needed for this UI/navigation change.

## Verification and delivery

Verify default All Categories, each supported sidebar link/active state, legacy links, permission-locked Reports, active-group collapse, collapsed rail and mobile interactions. Verify visible preset controls without a Filter button, draft changes never update totals before Apply, invalid Custom dates leave the applied range intact, Reset changes restores applied values, blank To yields a single day, and print uses the applied range. Run relevant existing report/navigation/access checks, frontend build, scoped lint and diff checks. Use temporary behavior checks for the bounded UI change rather than adding implementation-mirroring tests. Report unavailable browser checks honestly.

Preserve the previously accepted registration and Follow-ups changes and unrelated workspace edits. Do not reopen or restore discarded live previews. Deliver reviewable changes in the existing workspace.
