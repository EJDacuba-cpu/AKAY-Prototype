# Fixed-size tables and card load-more — design

Date: 2026-10-12
Status: awaiting review

## Problem

Table cards in the app resize with their content. `ModuleTableCard` and the hand-rolled card wrappers only set a
`min-height`, so a page with 1 row is short and a page with 10 rows is tall. Rows per page differ by screen (5, 8, 10,
15). Several screens show a pagination bar that does nothing (`currentPage={1} totalPages={1}`) and render every row at
once.

## Intent (agreed with the owner)

- Every main list table shows **at most 10 rows per page** with numbered pages (10 rows, then page 2).
- The table card has a **fixed size**. It does not grow or shrink with the number of rows. Fewer than 10 rows leave
  plain empty space; the pagination bar stays in the same place.
- Rows are a **uniform height** (56px). Text that does not fit is cut with `…` and shown in full on hover (`title`).
- Card-based lists use a **Load more button** instead of pages: Patients loads 10 at a time (2 columns × 5 rows),
  Facilities loads 12 at a time (a clean multiple of 1, 2 and 3 columns).
- The footer text stays `Page X of Y`. No "Showing 1–10 of N" text.

## Out of scope

- Dashboard "Recent" tables and the unused `RecentReferralsTable` / `RecentHealthRecordsTable` components.
- `MedicineInventoryHistoryModal` (15 per page, server-paged, inside a modal).
- Tables inside detail pages and reports (clinical details, TB calendar, conflict panel, report tables).
- Backend changes. Server paging stays as it is (Audit Logs, medicine history).
- Widening the 50-row fetch on Password & Invites (separate issue).

## Design

### 1. Shared building blocks

| Piece | Location | Purpose |
|---|---|---|
| `TABLE_PAGE_SIZE = 10`, `TABLE_ROW_HEIGHT = 56`, `TABLE_HEAD_HEIGHT = 44` | `utils/tablePaging.js` | The one place to change the numbers |
| `pageCount`, `clampPage`, `sliceRows`, `fillerRowCount` | `utils/tablePaging.js` | Pure functions, unit tested with `node --test` |
| `usePagedRows(rows, resetKey)` | `hooks/usePagedRows.js` | Returns `{ page, setPage, totalPages, pageRows }`. Goes back to page 1 when `resetKey` (search/filter state) changes; clamps the page when the row count shrinks |
| `useLoadMore(items, batchSize, resetKey)` | `hooks/useLoadMore.js` | Returns `{ visibleItems, hasMore, loadMore }`; resets to the first batch when `resetKey` changes |
| `LoadMoreButton` | `components/common/pagination/LoadMoreButton.jsx` | Button under a card grid; the caller renders it only while more items remain |
| `FixedTable` | `components/common/tables/FixedTable.jsx` | The scroll wrapper + `<table>` with a fixed height = header + 10 rows, uniform 56px rows and `…` truncation. The one place the height rule lives |
| `ModuleTableCard` (changed) | `components/common/tables` | New opt-in `fixedRows` prop renders its body with `FixedTable`. Cards that are not paged (for example the Family Planning summary tables) keep today's behaviour |

Fixed height is done with a fixed-height body, not filler rows, so empty space is plain white (agreed: no guide lines).
Rows use `h-14` (56px) with `truncate` on each cell and at most two lines in a cell.

Hand-rolled cards (`min-h-[420px]` wrappers on Account Directory, Audit Logs, Medicine Availability, Medicine
Management, Password & Invites, Follow-ups, Health Records) keep their own header and mobile card view but swap their
table body for `FixedTable`, so the height rule lives in one place without forcing their different layouts onto
`ModuleTableCard`.

### 2. Screens

| Screen | Today | After |
|---|---|---|
| BHC Referrals | client, 5/page | client, 10/page, fixed size |
| RHU Incoming Referrals | client, 5/page | client, 10/page, fixed size |
| BHC Health Records (`HealthRecordsTable`) | client, 5/page | client, 10/page, fixed size |
| RHU Health Records | client, 8/page | client, 10/page, fixed size |
| Family Planning list | client, 8/page | client, 10/page, fixed size |
| Audit Logs | server, 10/page | unchanged paging, fixed size |
| Account Directory | fake paging, all rows | real client paging, 10/page, fixed size |
| Medicine Availability | fake paging | real client paging, 10/page, fixed size |
| Medicine Management | fake paging | real client paging, 10/page, fixed size |
| Password & Invites (both tabs) | fake paging, 50 fetched | client paging over the fetched rows, fixed size |
| Follow-ups | no paging | client paging, 10/page, fixed size |
| Patients (BHC and RHU) | scroll-to-load, 12/batch | Load more button, 10/batch (replaces the IntersectionObserver) |
| Facilities | all cards | Load more button, 12/batch |

Mobile card views (for example Account Directory below `md`) also show 10 per page but have no fixed height.

### 3. Visual changes and risks

- Account Directory rows lose the third line (contact number) in the desktop table; it stays in the mobile card.
- A full table card is about 700px tall, so on a short laptop screen the pagination bar needs a scroll. If this is too
  tall, lower `TABLE_ROW_HEIGHT` to 48 in one place.
- Truncated cells always carry a `title` so the full text is reachable by hover.
- Patients: the scroll area, pinned header and side summary panel stay; only the loading mechanism changes. The
  "scroll to load" hint and spinner are removed in favour of the button.

### 4. Testing

- Unit tests (`node --test`): `pageCount`, `clampPage`, `sliceRows` for 0, 1, 10, 11 and 25 rows (including a page
  number that is past the end after the list shrinks). The two hooks need React, so reset-on-filter and Load more are
  checked in the browser.
- `eslint` and `vite build` clean.
- Browser check per screen with 0, 1, 10 and 11+ rows: card height does not change between pages or results,
  pagination stays in place, page resets on search/filter, Load more adds the right batch and disappears at the end.

## Open items

None. Decisions on rows per page, fixed height, row truncation, footer text, Patients and Facilities were all settled
with the owner.
