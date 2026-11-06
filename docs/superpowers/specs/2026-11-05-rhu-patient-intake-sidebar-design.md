# RHU Patient Intake sidebar & Walk-in Check-in — Design

Status: approved for planning (GOAL / CONTEXT / OUTPUT from Eric, 2026-11-05).

## Intent

Separate RHU patient arrival and registration from the clinical queue workspace. Staff who register walk-ins and receive referrals should not depend on Today's Queue as their primary intake entry point. Doctors and nurses keep Today's Queue and All Patients for clinical work.

## Sidebar

| Parent | Children | Notes |
|--------|----------|--------|
| **Patient Intake** (collapsible) | Incoming Referrals, Walk-in Check-in | Replaces the flat **Referrals** section items. |
| **Patients** (unchanged parent) | Today's Queue, All Patients | Clinical workspace only. |

- Remove **QR Scanner** from the sidebar. Keep route `/rhu/qr-scanner` and the existing **QR Scan** button on Incoming Referrals (same verification behavior).
- Parent path for expand/active: `/rhu/patient-intake` with `defaultPath` `/rhu/incoming-referrals`. Visiting `/rhu/patient-intake` redirects to Incoming Referrals.
- Active parent when pathname is `/rhu/incoming-referrals`, `/rhu/walk-in-check-in`, `/rhu/qr-scanner`, or `/rhu/referrals/:trackingId`.
- Preserve AKAY sidebar hierarchy, locking, typography, and responsive behavior (same pattern as Patients / BHC Referrals).

## Walk-in Check-in page

**Route:** `/rhu/walk-in-check-in`  
**Gate:** `ProtectedPage` module `patients` (`patients.register`). No `clinical.history` required.

**UI (page, not modal):**

- Heading: **Walk-in Check-in**
- Subtitle: Search existing patients first so a returning patient keeps one record.
- Search: name, PhilHealth number, or contact number (reuse `searchPatientsForCheckIn` / existing debounce rules).
- States: idle hint, loading, empty, error, duplicate-already-in-queue, success toast after check-in.
- Existing match without active visit: **Check In** → confirmation → `POST /api/rhu-visits` → Waiting on Today's Queue.
- No match: **Register New Patient** → `/rhu/patients/add?check_in=1&return_to=walk-in` (or equivalent return marker).
- After successful registration: navigate to `/rhu/walk-in-check-in?patient_id={id}` with that patient selected and ready for **explicit** check-in confirmation (do not auto-enqueue on save).
- Already in queue (`active_visit_id`): show “Already in today's queue”; no second check-in.

Reuse: `WalkInCheckInModal` search/check-in logic (extract shared panel), `walkInRegistration` helpers, `rhuVisitService`, existing registration form. Do not rebuild queue or referral backends.

## Move intake entry points

| From | Change |
|------|--------|
| Today's Queue **Check in walk-in** button + modal | Remove |
| All Patients register / walk-in CTAs | Keep directory browse-only (already hides New Patient for RHU); update empty-state copy to point at Walk-in Check-in |
| Dashboard walk-in / add-patient shortcuts that open intake | Point at `/rhu/walk-in-check-in` |
| Legacy `/rhu/walk-in-patients` | Redirect to `/rhu/walk-in-check-in` |
| Registration success when opened from check-in flow | Return to Walk-in Check-in with `patient_id`, not auto-check-in then Today's Queue |

Preserve patient profile links and profile **Check in to today's queue** (clinical desk action on a known patient) unless it clearly duplicates the removed queue CTA — keep profile action.

## Incoming Referrals

Unchanged process: BHC referral tracking, QR/manual arrival, Receive Patient → same Today's Queue. No new queue, no status model changes, no duplicated clinical records.

## Permissions

| Surface | Requirement |
|---------|-------------|
| Incoming Referrals / QR Scanner / referral tracking resolve | Existing `rhuIntake` / `rhu.intake` \| `rhu.manage` bridge |
| Walk-in Check-in page + search + check-in API | `patients.register` |
| Today's Queue list / consultation actions | Unchanged (`clinical.history` / encode / finalize) |
| `intake_staff` defaults | Can register, verify arrival, and walk-in check-in **without** `clinical.history` |

Frontend and backend already strip clinical fields on walk-in search and intake arrival summaries. Do not broaden clinical access. Out of scope: fixing `GET /incoming-referrals` still requiring `rhu.manage` (O5 bridge) unless a tiny nav-only change is required for this feature.

## Non-goals

- BHC registration or BHC sidebar
- Today's Queue table design / consultation processing
- Referral status machine or separate intake queue
- Backend schema / new visit sources

## Verification

New and existing patient registration → return → confirm check-in → Waiting on Today's Queue; duplicate active visit blocked; referral receive still enqueues; `intake_staff` can use Walk-in Check-in and intake arrival without history; direct nav + refresh on `/rhu/walk-in-check-in?patient_id=`; sidebar active/expand states correct.
