# RHU Walk-in Check-in two-panel workspace — Design

Status: approved for implementation (GOAL / CONTEXT / OUTPUT from Eric, 2026-11-05).

## Layout

- Page header unchanged: Walk-in Check-in + subtitle left; brand **Register New Patient** right.
- Desktop: two side-by-side sheets (`lg:grid-cols-2`). Mobile: stacked.
- **Left — Find Patient:** search + selectable result rows (name primary; age · sex · barangay secondary). Selected row: subtle sunk background + stronger border.
- **Right — Check-in Details:** identity fields for verification; status as colored dot + text (not pill badges); **Confirm Check-in** only when eligible; **Already Checked In** when `active_visit_id`.
- After success: in-panel success copy + **Check In Another Patient** (resets workspace). **View Today's Queue** link only if `clinical.history`.
- No Recent Check-ins, no directory, no queue table. Confirm is the right-panel primary button (no extra modal).

## Non-goals

Backend, Today's Queue, Patient Details, All Patients, Incoming Referrals, registration API behavior.
