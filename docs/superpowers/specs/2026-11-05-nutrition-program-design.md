# Nutrition Program — Design

**Date:** 2026-11-05  
**Scope:** Enrollment + Care Tracking only. Do **not** change Nutrition Reports.

## Problem

AKAY needs a Nutrition Health Service for BHC and RHU that works for patients of all ages. Staff enroll during consultation; enrollment becomes Active only after finalize; it stays Active until authorized staff close it with a reason. Care Tracking shows current status and PE-derived Weight / Height-Length / BMI history without a separate nutrition assessment form.

## Decisions

1. **Program key:** `Nutrition` → category `Nutrition` (add to FE `PROGRAM_CLASSIFICATIONS` and BE `ConsultationPrograms::CLASSIFICATIONS`).
2. **No nutrition assessment form / no `nutrition_data` column.** Selecting Nutrition marks the visit only; wizard skips a Nutrition form step.
3. **Enrollment intent:** `monitoring_data.nutritionIntent` = `enroll` | `continue` (parallel to `prenatalIntent`). Draft selection does not enroll.
4. **Active after finalize:** First finalized record with `Nutrition` in `selectedPrograms` and intent `enroll` opens Active enrollment. While Active, later Nutrition visits must use `continue` (server rejects duplicate enroll).
5. **Explicit close:** Table `nutrition_care_closures` + `POST /api/patients/{patient}/nutrition-care/close`. Permission `consultations.finalize`. Status becomes Closed; history preserved. Patient may enroll again later (new episode).
6. **Statuses (exact copy):** `Not Enrolled`, `Active`, `Closed`.
7. **Measurements:** Reuse `vital_signs.weight` / `vital_signs.height` from finalized health records. History = records with a usable weight and/or height whose visit date falls in the episode window (from enrollment start through close, or open-ended while Active). Deduplicate by record id. Do not copy values into a separate table.
8. **BMI:** Reuse `summarizeLatestBmi` / `calculateBmi`. Show numeric BMI when both measurements exist. Adult WHO category **only when age ≥ 18**. No pediatric growth charts / z-scores.
9. **Age:** Nutrition is available to all ages (not in `INFANT_HIDDEN_PROGRAMS`). Infants still hide BMI display in consultation PE via existing `shouldShowBmiDisplay`.
10. **UI:** Extend existing Health Services panel, Care & Programs tab, and AKAY UI primitives. No new design system.

## Close reasons

| value | label |
|-------|--------|
| `goals_met` | Goals met / discharged |
| `transferred` | Transferred / moved out |
| `lost_to_follow_up` | Lost to follow-up |
| `other` | Other |

`closed_on` required, ≤ today, ≥ enrollment start date. `note` optional, ≤ 500 chars.

## Out of scope

- Nutrition Reports module
- Pediatric anthropometric calculations
- Separate MUAC / wasting forms
- Changing Maternal / FP / EPI enrollment semantics
