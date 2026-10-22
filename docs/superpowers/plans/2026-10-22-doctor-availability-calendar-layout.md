# Doctor Availability: calendar-first layout

Source: `/impeccable critique` on `/rhu/doctor-availability` (23/40, snapshot in `.impeccable/critique/`).

## Goal

Make the calendar the main surface. Remove the doctor card grid. Keep one place to set a doctor's status now, and put the referral status answer ("can BHC refer today?") at the top.

## Decisions

- **Doctor picker is a pill strip, not a left rail.** At 1366px with the sidebar open, a rail plus a 340px panel leaves about 480px for the calendar (about 69px per day). A pill strip above keeps the calendar near 700px.
- **"All doctors" is the default view.** The calendar shows every doctor's absences with the doctor name on each chip (no per-doctor colors; three-color rule). Selecting a doctor filters it.
- **No backend change.** The unavailability API is per provider, so the page fetches each doctor's month with `useQueries` and shares the existing query keys.
- **Right panel replaces the modal.** One sticky aside with two pill tabs, Status and Absences. Clicking a doctor opens Status; clicking a day opens Absences. The old `DoctorUnavailabilityModal` is deleted.
- **Red stays on one action.** Save availability is brand red. Save absence is navy ink. Selected doctor pill and today marker use navy ink.
- **Remove asks twice inline** (Remove, then Confirm remove or Cancel). No modal.
- **Quick status toggle is deferred.** It needs the unsaved-changes and consequence guards from the harden pass first.
- **Roster search and status filter tabs are dropped.** A facility has 3 to 12 doctors; counts move into the referral status line.

## Tasks

1. `utils/doctorAvailabilityCalendar.js`: add `formatLongDate`, `unavailabilityChipLabel`, `calendarCellLabel`, `visibleGridWeeks`. Tests first in `doctorAvailabilityCalendar.test.js`.
2. `hooks/useDoctorAvailability.js`: add `useAllProviderUnavailability(providers, range)` using `useQueries` with `combine`; each row gets `doctorName`.
3. `DoctorUnavailabilityCalendar.jsx`: rewrite. Scope label beside the month, legend, doctor names on chips when All doctors, long-date cell labels, 10px minimum, ink today marker, trim empty trailing week.
4. `DoctorAbsencePanel.jsx` (new): day header, add form (All day or Time range), list with inline two-step remove, read-only list in All doctors view, past dates view-only.
5. `DoctorSchedule.jsx`: new layout, status line that waits for load and handles error, doctor pill strip, aside tabs, label association on fields, `role="status"` notice with timeout cleanup, remove the Official chip and card grid.
6. Verify: `node --test` on the calendar utils, `npm run lint`, `npm run build`, then one browser pass at desktop and narrow width.

## Revision 2 (supersedes the pill strip and side-panel tabs above)

Requested layout: calendar on the left, doctor list on the right with search and a Filter popover; hovering a day shows a plus that opens a modal.

- **Right panel:** `DoctorRosterPanel` (search, status Filter popover with draft and Apply, a Manage button per doctor, view-only users get View). Selecting a row filters the calendar to that doctor; selecting it again shows everyone.
- **Calendar:** month grid. A plus appears on hover or focus for today and future days (always visible on touch). Absence chips and "+N more" open `DoctorDayAbsencesModal` (list, two-step Remove).
- **Modal:** `DoctorAvailabilityModal` with a searchable doctor picker, Available or Unavailable, then date and time for Unavailable.
- **Three writes behind one modal** (`utils/doctorAvailabilityChange.js`), matching `RhuProvider::isEffectivelyAvailable`:
  - Available: confirm the stored status (no date or time). An absence happening now still blocks.
  - Unavailable with a date: a scheduled absence.
  - Unavailable with "No end date": stored status Unavailable until confirmed Available.
- **Notes** (expected return, BHC notes, internal notes) sit behind a disclosure and are saved with a PATCH before the absence, so a retry never duplicates the absence.
- Removed: `DoctorAbsencePanel`, the doctor pill strip, the Status/Absences tabs.
