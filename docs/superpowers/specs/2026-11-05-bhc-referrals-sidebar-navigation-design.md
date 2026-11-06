# BHC Referrals sidebar navigation and list filters

Status: approved by Eric ("go ahead and implement that"), 2026-11-05.

## Intent

Move BHC Sent Referrals vs Waiting to Submit from in-page tabs into a nested sidebar group like Reports. Both views use a dense table plus Health Commodities–style search and Filter popover (draft dropdowns → Apply / Reset). Independent filter state per view. No API or RHU changes.

## Approaches

- **Selected:** Reports-style nested sidebar; one page; `?view=sent|waiting`; legacy `?tab=waiting` redirects/normalizes to waiting.
- Rejected: separate routes for each view; keep in-page tabs and only restyle filters.

## Navigation

- Parent **Referrals** expands to **Sent Referrals** (default) and **Waiting to Submit**.
- URLs: `/bhc/referrals` and `/bhc/referrals?view=sent` → Sent; `/bhc/referrals?view=waiting` → Waiting.
- Drop the in-page tab strip. Keep create/detail/waiting-detail routes.
- Query-aware active matching so only one child is active. Expand/collapse, collapsed rail, and mobile drawer match Reports behavior.
- Update in-app links that used `?tab=waiting` to `?view=waiting`.
- RHU Incoming Referrals and authorization for Referrals stay unchanged.

## List surfaces and filters

- Shared chrome: always-visible search + Filter pill popover (commodities pattern) + active chips + Clear.
- **Sent:** existing table and columns; filters Referral Date (presets incl. custom), Status, Urgency, Receiving Facility; search patient / tracking ID / complaint.
- **Waiting:** table (not cards): Patient, Consultation date, Receiving RHU, Urgency, Reason (truncated), Actions (View Details, Check Availability & Submit). Filters: Held date, Urgency, Receiving Facility (no Status). Search patient / reason / complaint. Existing empty-state copy.
- Filter state is independent per view.

## Architecture

- Frontend-only. Reuse referral and hold queries. Sidebar data + navigation helpers; `Referrals.jsx` view switch; commodities-style filter component; workspace helpers for view constants/normalization.
- No new endpoints, migrations, or RHU work.

## Verification

Default Sent; both sidebar children and active state; legacy `?tab=waiting`; filters/search per view; Waiting table and empty state; pagination; locked access unchanged; update Referrals tests; scoped frontend checks.
