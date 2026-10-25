# RHU Visit Queue — Phase 4: RHU Patients UI — Design

Date: 2026-10-25 · Status: awaiting spec review
Parent spec: `docs/superpowers/specs/2026-10-24-rhu-visit-queue-design.md` (D6–D9 apply)
UI reference (approved mockup, Option A table): https://claude.ai/artifact/Sif1CnXPvzZJAQJAnW2huB
Builds on: Phase 2 read API (`GET /api/rhu-visits`), Phase 3 check-in (`POST /api/rhu-visits`, `GET /api/rhu-visits/patient-search`, `/rhu/patients/add?check_in=1`)

## Goal

Turn `/rhu/patients` into a two-view workspace — **Today's Queue** (default) and **All Patients** —
with the check-in modal, so RHU staff can see who is waiting, since when and from where, and
check a walk-in in without leaving the page. BHC Patients is unchanged.

## Findings that shape this phase

1. `/rhu/patients` renders the shared `PatientsModule` (`role="rhu"`), a **card directory** inside its
   own `DashboardLayout`, with its heading and toolbar built inside. A tab switcher therefore needs
   either a wrapper that owns the layout or an `embedded` mode on the shared module.
2. `PatientsModule` is shared with BHC. The only safe change is an **optional** prop whose default
   reproduces today's output exactly.
3. The Received action (QR Scanner, Incoming Referrals, Referral Details) already calls the single
   `updateReferralStatus`; since Phase 2 it enqueues the visit server-side. No change to those pages
   is needed — the queue refetches when the page mounts, on window focus and every 30 seconds.
4. The queue API returns waiting minutes, source, sending BHC name and identity fields only. It does
   not return a tracking ID (D7), nor "new registration / returning" hints; neither is shown.
5. Start consultation, Resume, Close visit and Discard need Phase 5 endpoints. They are **not**
   rendered in Phase 4 (no dead buttons).
6. The frontend has unit tests only for pure `.js` utilities (`node --test`). Row formatting goes in
   a pure util; components stay thin.

## Decisions

| # | Decision |
|---|---|
| P4-1 | New page `src/pages/rhu/RhuPatientsWorkspace.jsx` replaces the `RHUPatientsModule` element at `/rhu/patients`. It renders `DashboardLayout`, the page heading, the pill tab control and the active view. The view is kept in the URL (`?view=queue` default, `?view=all`) so refresh and Back behave. |
| P4-2 | `PatientsModule` gains an optional `embedded` prop (default `false`). When `true` it skips its own `DashboardLayout` and its own title; the toolbar's "New Patient" stays (registration without check-in, D5). With `embedded` false the rendered output is unchanged. |
| P4-3 | **Today's Queue** is a fixed-frame table following DESIGN.md (44px header, 56px rows, hairline sheet, pill chips). Columns: `#`, Patient (name link to the profile, age · sex), Source, Arrived, Visit progress, Actions. No pagination; the sheet scrolls inside a fixed frame. Empty and error states fill the same frame. |
| P4-4 | Source cell: Referred badge (info/blue) with "From {sending BHC}", or Walk-in badge (neutral). No tracking or QR value (D7). |
| P4-5 | Arrived cell: arrival time and "Waiting N min" from `waiting_minutes`. A visit whose arrival date (Asia/Manila) is before today shows "From {date} · still open" in the caution colour instead of the minutes (D9). |
| P4-6 | Visit progress cell: a status chip mapped from `status` (`waiting` → Waiting, info). Unknown statuses render their raw text in a neutral chip so later phases cannot break the table. |
| P4-7 | Actions cell: a ⋯ menu (D8). Phase 4 contains one item, **Open patient record** (`/rhu/patients/{id}`). Phase 5 adds Start/Resume/Close/Discard to the same menu. |
| P4-8 | Toolbar (Queue view): search box filtering the loaded queue by patient name (client-side), source pills All / Referred / Walk-in, and the one primary action **+ Check in walk-in** (hidden without `patients.register`). Tracking-ID search stays in Incoming Referrals / QR Scanner — a deviation from D7's "search still accepts it", because the queue payload carries no tracking ID. |
| P4-9 | **Check-in modal** (`ModalShell`): search field (debounced 300 ms, min 2 characters) → `patient-search`; each result shows name, age · sex, birthdate, barangay and either **Check in** or "Already in today's queue"; a "Register new patient" action links to `/rhu/patients/add?check_in=1`. One `newWalkIn()` key per modal open, renewed after a successful check-in. `VISIT_ALREADY_ACTIVE` is shown as "already in today's queue" and refreshes the list; other errors use the existing error toast. On success: toast, close, refetch the queue. |
| P4-10 | Data: `rhuVisitService.js` gains `listRhuVisits()` and `searchPatientsForCheckIn(q)`; `useRhuVisits()` (react-query, key `queryKeys.rhuVisits()`, refetch on focus and every 30 s, `staleTime` 0). The registration success path already returns to `/rhu/patients`; the queue refetches on mount, so the new walk-in appears. |
| P4-11 | Access: the workspace keeps today's gate (`patientDirectory` module, i.e. `clinical.history`). Users with `clinical.history` but no `patients.register` see the queue without the check-in action. |

## Out of scope

Start/Resume/Close/Discard and the intake permission split with Locked nav (Phase 5); "Check in"
buttons on All Patients rows (the modal search covers it and the card component is shared with
BHC); redesigning Incoming Referrals or QR Scanner; changing BHC pages.

## Tests and verification

- Pure util `src/utils/rhuQueueView.js` (`node --test`): source label/sub-line, waiting label, the
  carried-over marker around midnight Asia/Manila, status chip mapping incl. unknown status, name
  filtering, source filtering, ordering preserved.
- `npm run lint` on changed files, `npm run build`.
- **Browser check** against an isolated local stack (scratch SQLite database and a locally served
  backend — never the Supabase connection in `.env`): queue renders, check-in modal search and
  check-in, register-new flow returns and the visit appears, tab switch and Back, BHC Patients page
  unchanged. If this stack cannot be run, the report will say the UI was not browser-verified.

## Risks

- `embedded` touches a shared 436-line module; mitigated by default-false and a before/after check
  of the BHC page.
- Wall-clock "today" uses the browser clock converted to Asia/Manila; a clinic PC with a wrong clock
  mislabels carried-over visits (the server's `waiting_minutes` is unaffected).
- A long queue without pagination is acceptable for one RHU day; revisit if real queues exceed ~100.
