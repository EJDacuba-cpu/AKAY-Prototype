# Nutrition Report — Design

**Date:** 2026-11-05  
**Status:** Approved  
**Scope:** BHC Nutrition Report only. Other report categories and clinical workflows unchanged.

## Problem

BHC staff need a facility Nutrition Report under Reports that shows adult nutritional status (BMI) and Nutrition Program enrollment coverage from real finalized data — not demo numbers — with period and age filters, PDF/print, and AKAY Reports chrome.

## Approach

Extend the existing client-side BHC Reports engine (`bhcReporting.js` + `BHCReports.jsx`): add a `nutrition` category, Nutrition-specific layout when `?type=nutrition`, and age-group support inside the Filter popover. Reuse facility-scoped `getAllPatients` / `getAllHealthRecords` lists. No new backend report API in this pass.

## Layout (top → bottom)

1. **Header** — Title “Nutrition Report”; subtitle facility name + reporting period; right: Filter | Export PDF | Print (existing button styles).
2. **Filter popover** — Reporting Period (Weekly / Monthly / Custom Date); Age Group (All Ages / 0–4 / 5–19 / 20+); Apply and Reset. Controls stay inside the popover.
3. **Four cards** — Underweight, Normal, Overweight, Obese: patient count + percentage only. **No progress bars.**
4. **Charts (side-by-side desktop, stacked mobile)**  
   - Left: Nutritional Status Distribution (bar).  
   - Right: Nutrition Enrollment radial chart — coverage of ever-enrolled vs eligible population; center label “{n} Patients Enrolled”.
5. **Reporting Summary** — Full-width table (metric, count, percentage/value) + short data-quality notes. Empty states when no applicable data.

## Data rules

| Concept | Rule |
|--------|------|
| BMI assessment | Per unique patient in age filter: latest **paired** weight+height from a **finalized** health record with visit date in **[period.start, period.end]**. |
| Adult classification | WHO adult cutoffs only if age at visit **≥ 18**. Under 18 never classified with adult BMI. |
| BMI % denominator | Unique patients with a valid adult classification in the period (not all registered patients). |
| Ever enrolled | Unique patients with ≥1 finalized Nutrition-tagged record (`selectedPrograms` contains `Nutrition` or category `Nutrition`) with visit date **≤ period.end**, matching age filter (age as of period end). Includes closed enrollments. |
| Eligible population | Registered facility patients matching age filter as of period.end. Nutrition is available to all ages → no extra clinical eligibility gate. |
| Coverage % | `everEnrolled / eligible` × 100; `0` when eligible is 0. |
| Age groups | `all`: no age filter; `0-4`: age &lt; 5; `5-19`: 5 ≤ age &lt; 20; `20+`: age ≥ 20. Age from birthdate vs as-of date (period end for enrollment/population; visit date for BMI). |
| Incomplete vs N/A | Missing/unpaired vitals among adults = incomplete (note/row). Under-18 with or without vitals = Not Applicable for classification, not incomplete. |
| All Ages note | Cards/bar reflect adult assessments only; younger patients excluded from BMI stats (stated in subtitle/note). |
| Facility scope | Inherited from authenticated BHC patient/record list APIs. Permission: `reports.view`. |

## Charts & print

- Bar chart: counts for the four adult BMI categories.  
- Radial: value = coverage fraction; center shows enrolled count + “Patients Enrolled”; legend/tooltip show eligible and coverage %.  
- Export PDF / Print: keep `window.print()`; Nutrition print block must include header context, card totals, chart figures (or equivalent tabular chart data), and summary table — not table-only if that would drop Nutrition-specific figures.

## Non-goals

- Pediatric growth charts / z-scores  
- RHU Nutrition Report  
- Demo/hardcoded statistics  
- Changing Maternal / EPI / other report categories  
- New bulk Nutrition Reports API (unless client aggregation later proves insufficient)

## Success criteria

- Sidebar Reports → Nutrition opens `?type=nutrition` with the layout above.  
- Filters change cards, charts, and summary consistently.  
- No double-counted patients; no adult BMI on children.  
- Tests cover BMI unique-patient logic, age gates, ever-enrolled vs eligible, and empty/N/A states.  
