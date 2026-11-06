# RHU Today's Queue compact table

Status: approved by Eric ("approve and go ahead"), 2026-11-05.

## Intent

Refine RHU Today's Queue to match AKAY Medicine & Supply compact table density. Keep one queue for referred and walk-in visits; filter with in-table All | Referred | Walk-in tabs. No new sidebar children. UI only.

## Layout

- Page heading **Today's Queue** + subtitle upper-left; **Check in walk-in** upper-right (permission-gated).
- Existing SearchField below the header, right-aligned; appearance and behavior unchanged.
- Queue table card header holds compact **All | Referred | Walk-in** (`SegmentedFilter`). Filter only; does not change visit status or navigate away.

## Table

- Medicine & Supply visuals: 44px header (`h-11`), ~56px rows (`h-14`), sunk header, subtle dividers, existing typography.
- Columns: #, Patient, Patient Entry, Arrived, Visit Progress, Actions.
- Patient: name prominent; Age/Sex underneath.
- Patient Entry: primary **Referred** / **Walk-in** as text + small semantic dot (no pill). Secondary: `Referred from [BHC]` or `Direct RHU check-in`.
- Arrived: time + waiting-duration / carried-over note (unchanged meaning).
- Visit Progress: text + small semantic dot (no pill). Waiting and Walk-in → neutral gray; Referred → blue; In Consultation → distinct cyan. Labels and meanings unchanged.
- Actions: existing Start / Resume / Review Referral Slip / Open Patient Record / Close Visit by permission and state.
- Shared `TablePagination` (Page X of Y + numbered pages + Previous/Next), 10 rows; resets on search/source change.
- Preserve empty and no-access states.

## Architecture

- Lift Check-in and Search chrome into `RhuPatientsWorkspace` for queue view.
- `RhuQueueTable` owns the sheet, source tabs, rows, pagination.
- Adjust `rhuQueueView` display helpers for entry secondary copy and status tones; no API/backend changes.

## Out of scope

Check-in, consultation, queue ordering, referral verification, permissions, backend.
