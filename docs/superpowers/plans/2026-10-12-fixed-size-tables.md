# Fixed-size Tables and Card Load-more Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every main list table shows at most 10 rows per page inside a card of fixed size; card lists (Patients, Facilities) use a Load more button.

**Architecture:** Pure paging helpers and constants live in `utils/tablePaging.js` (unit tested). Two React hooks (`usePagedRows`, `useLoadMore`) derive the visible slice without effects. A `FixedTable` primitive owns the fixed height, 56px rows and `…` truncation through one CSS class; `ModuleTableCard` opts into it with `fixedRows`, and hand-rolled cards swap their table body for it. Each screen is then migrated one task at a time.

**Tech Stack:** React 19, Tailwind 4, `node --test` for utils, eslint, vite. All paths are under `frontend/src/` unless stated.

**Spec:** `docs/superpowers/specs/2026-10-12-fixed-size-tables-design.md`

## Global Constraints

- 10 rows per page everywhere (`TABLE_PAGE_SIZE = 10`); row height 56px, header 44px (`TABLE_ROW_HEIGHT`, `TABLE_HEAD_HEIGHT`).
- Table cards never change size with the number of rows; fewer rows leave plain empty space; the pagination bar stays in place.
- Text that does not fit is cut with `…` and the full text is available on hover (`title`); at most two lines in a cell.
- Pagination footer text stays `Page X of Y` (existing `TablePagination`). No "Showing 1–10 of N".
- Patients: Load more button, 10 per batch (2 columns × 5 rows). Facilities: Load more button, 12 per batch.
- Out of scope: dashboard "Recent" tables, the unused `RecentReferralsTable` / `RecentHealthRecordsTable`, `MedicineInventoryHistoryModal`, tables inside detail pages and reports, any backend change, widening the 50-row fetch on Password & Invites.
- UI copy in English. Match surrounding code style; no new dependencies.

## Review Focus

1. A search/filter that leaves 0 rows while the user is on page 3 → fixed-height empty state and `Page 1 of 1`, not a stuck page 3. (Task 1 test `clampPage`/`sliceRows` past the end; Task 4 browser check.)
2. A list that shrinks after a status change/refresh so the current page no longer exists → falls back to the last page. (Task 1 `sliceRows` page 9 of 25 rows.)
3. Exactly 10 and exactly 20 rows → 1 and 2 pages (not 2 and 3). (Task 1 `pageCount` tests.)
4. One very long unbroken value (80+ characters, long email) must truncate, not widen the table or stretch the row. (Task 4 browser check by injecting a long value.)
5. The ⋯ action menu on the last row must not be clipped or scroll the fixed-height card. (Task 4 browser check; menus are portaled today.)
6. Load more when a filter shrinks the list below the visible count → button disappears, no blank cards. (Task 1 `nextVisibleCount`/`hasMoreItems` tests; Task 11 browser check.)

---

### Task 1: Paging helpers and constants

**Files:**
- Create: `utils/tablePaging.js`
- Create: `utils/tablePaging.test.js`
- Modify: `../package.json` (add script `"test:table-paging": "node --test src/utils/tablePaging.test.js"`)

**Interfaces:**
- Produces (all named exports of `utils/tablePaging.js`):
  - Constants: `TABLE_PAGE_SIZE = 10`, `TABLE_ROW_HEIGHT = 56`, `TABLE_HEAD_HEIGHT = 44`, `TABLE_SCROLLBAR_ALLOWANCE = 8`, `PATIENTS_LOAD_BATCH = 10`, `FACILITIES_LOAD_BATCH = 12`
  - `pageCount(rowCount: number, pageSize = TABLE_PAGE_SIZE): number` — never below 1
  - `clampPage(page: number, totalPages: number): number` — integer in `1..max(totalPages,1)`; non-numeric → 1
  - `sliceRows<T>(rows: T[], page: number, pageSize = TABLE_PAGE_SIZE): T[]` — page is clamped against `pageCount(rows.length, pageSize)`
  - `tableBodyHeight(pageSize = TABLE_PAGE_SIZE): number` — `TABLE_HEAD_HEIGHT + pageSize * TABLE_ROW_HEIGHT + TABLE_SCROLLBAR_ALLOWANCE`
  - `tableEmptyHeight(pageSize = TABLE_PAGE_SIZE): number` — `pageSize * TABLE_ROW_HEIGHT`
  - `nextVisibleCount(visible: number, batch: number, total: number): number` — `min(visible + batch, total)`
  - `hasMoreItems(visible: number, total: number): boolean`

- [ ] **Step 1: Write the failing tests** in `utils/tablePaging.test.js` (`node:test` + `node:assert/strict`, same style as `utils/accountForm.test.js`):
  - `pageCount`: 0→1, 1→1, 10→1, 11→2, 20→2, 21→3, 25→3.
  - `clampPage`: `(5, 2)`→2, `(0, 3)`→1, `(NaN, 3)`→1, `(2, 0)`→1, `(2.7, 3)`→2.
  - `sliceRows` over `Array.from({length: 25}, (_, i) => i + 1)`: page 1 is `[1..10]`; page 3 has 5 rows (`[21..25]`); page 9 (past the end) returns `[21..25]`; `sliceRows([], 1)` is `[]`.
  - `tableBodyHeight()` is 612 and `tableEmptyHeight()` is 560; `tableBodyHeight(2)` is 164.
  - `nextVisibleCount(10, 10, 25)`→20, `(20, 10, 25)`→25, `(10, 10, 4)`→4; `hasMoreItems(10, 25)`→true, `(25, 25)`→false, `(30, 25)`→false.

- [ ] **Step 2: Run to verify failure**

Run (from `frontend/`): `npm run test:table-paging`
Expected: FAIL — cannot find module `./tablePaging.js`.

- [ ] **Step 3: Implement `utils/tablePaging.js`** with the signatures above. Plain JS, no React import.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:table-paging`
Expected: all tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/tablePaging.js frontend/src/utils/tablePaging.test.js frontend/package.json
git commit -m "feat(tables): add paging helpers and fixed table constants"
```

---

### Task 2: Paging hooks and Load more button

**Files:**
- Create: `hooks/usePagedRows.js`, `hooks/useLoadMore.js`
- Create: `components/common/pagination/LoadMoreButton.jsx`
- Modify: `components/common/index.js` (export `LoadMoreButton` next to `TablePagination`)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces:
  - `usePagedRows(rows: T[], resetKey: string | number | object, pageSize = TABLE_PAGE_SIZE): { page: number, setPage: (n: number) => void, totalPages: number, pageRows: T[], startIndex: number }` — `startIndex = (page - 1) * pageSize` (for "#" numbering). `resetKey` must be a primitive or a stable reference (a state object), never a value rebuilt on every render.
  - `useLoadMore(items: T[], batchSize: number, resetKey): { visibleItems: T[], hasMore: boolean, loadMore: () => void }`.
  - `LoadMoreButton({ onClick: () => void, label?: string = "Load more" })` — a full-width-centered secondary button, `type="button"`.

- [ ] **Step 1: Implement `usePagedRows`.** Derive without effects: keep `useState({ key: resetKey, page: 1 })`; the effective page is `1` when the stored key differs from `resetKey`, otherwise `clampPage(stored.page, totalPages)`. `setPage` stores `{ key: resetKey, page }`. This resets on filter change and clamps on shrink with no `useEffect`.
- [ ] **Step 2: Implement `useLoadMore`** the same way: stored `{ key, count }`, effective count is `batchSize` when the key changed, else `min(count, items.length)` floored at `batchSize`; `loadMore` uses `nextVisibleCount`.
- [ ] **Step 3: Implement `LoadMoreButton`** using the existing red-outline button look from the Facilities "+ Add" button (`rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50`).
- [ ] **Step 4: Verify**

Run (from `frontend/`): `npx eslint src/hooks src/components/common` and `npx vite build`
Expected: no lint output; build ends with `built in`.

- [ ] **Step 5: Commit** — `git add frontend/src/hooks frontend/src/components/common && git commit -m "feat(tables): add usePagedRows, useLoadMore and LoadMoreButton"`

---

### Task 3: FixedTable primitive and ModuleTableCard `fixedRows`

**Files:**
- Create: `components/common/tables/FixedTable.jsx`
- Create: `utils/truncationTitle.js`
- Modify: `components/common/tables/ModuleTableCard.jsx`, `components/common/tables/DataTableEmptyState.jsx`, `components/common/index.js` (export `FixedTable`), `index.css` (add the `.akay-fixed-table` rules)

**Interfaces:**
- Consumes: `tableBodyHeight`, `tableEmptyHeight`, `TABLE_PAGE_SIZE`, `TABLE_ROW_HEIGHT` from Task 1.
- Produces:
  - `FixedTable({ minWidth = "min-w-[900px]", pageSize = TABLE_PAGE_SIZE, children })` — renders `<div class="akay-fixed-table w-full min-w-0 overflow-x-auto" style={{ height: tableBodyHeight(pageSize), "--akay-row-h": "56px", "--akay-empty-h": tableEmptyHeight(pageSize) + "px" }}><table class="w-full {minWidth} border-separate border-spacing-0 text-left" onMouseOver={setTitleIfTruncated}>{children}</table></div>`. Children are `<thead>`/`<tbody>`.
  - `setTitleIfTruncated(event: MouseEvent): void` in `utils/truncationTitle.js` — walks from `event.target` up to the `td`; on the first element whose `scrollWidth > clientWidth` and that has no `title`, sets `title` to its trimmed `textContent`.
  - `ModuleTableCard` new props `fixedRows = false`, `pageSize = TABLE_PAGE_SIZE`; when `fixedRows`, the scroll body + `<table>` is rendered by `FixedTable` (card chrome, header, swipe hint, footer unchanged).
  - CSS contract in `index.css`: `.akay-fixed-table tbody tr:not(:has(td[colspan]))` gets `height: var(--akay-row-h)`; `.akay-fixed-table tbody td:not([colspan])` gets `padding-block: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 22rem; vertical-align: middle`; direct block children (`> p`, `> div`) of those cells get `overflow: hidden; text-overflow: ellipsis`. Rules are unlayered so they beat Tailwind utilities.
  - `DataTableEmptyState` default `minHeight` becomes `min-h-[var(--akay-empty-h,260px)]` (260px outside a fixed table, 560px inside).

- [ ] **Step 1: Create `truncationTitle.js` and `FixedTable.jsx`** per the interfaces.
- [ ] **Step 2: Add the CSS rules** to `index.css` per the contract.
- [ ] **Step 3: Add `fixedRows`/`pageSize` to `ModuleTableCard`** and update `DataTableEmptyState`'s default.
- [ ] **Step 4: Verify**

Run (from `frontend/`): `npx eslint src/components/common src/utils` and `npx vite build`
Expected: no lint output; build succeeds. No screen uses `fixedRows` yet, so nothing visible changes.

- [ ] **Step 5: Commit** — `git commit -m "feat(tables): add FixedTable primitive and fixedRows option"` (add the files listed above).

---

### Task 4: Referrals and records screens already on ModuleTableCard

**Files:**
- Modify: `pages/bhc/Referrals.jsx` (drop `ITEMS_PER_PAGE`, `currentPage`/`setCurrentPage` state, the slice and the reset effect), `pages/rhu/IncomingReferrals.jsx`, `pages/rhu/RHUHealthRecords.jsx` (table component `RHUHealthRecordsTable` owns paging; remove the `currentPage` props from the page), `pages/shared/FamilyPlanningList.jsx` (main "Family Planning TCL Table" only; leave `SummaryTable` untouched)

**Interfaces:**
- Consumes: `usePagedRows` (Task 2), `ModuleTableCard fixedRows` (Task 3).

- [ ] **Step 1: Referrals** — replace local paging with `const { page, setPage, totalPages, pageRows: paginatedReferrals } = usePagedRows(filteredReferrals, filters)`; pass `fixedRows` to `ModuleTableCard`; footer `TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage}`. Replace the `DataTableEmptyState` as is (it now fills the fixed height).
- [ ] **Step 2: IncomingReferrals** — same, `resetKey` = its filter state object; the `#` queue number uses `startIndex + index + 1`.
- [ ] **Step 3: RHUHealthRecords** — move paging into `RHUHealthRecordsTable` with a new `resetKey` prop (the page's `filters`); delete the clamp effect and the page's `currentPage` state.
- [ ] **Step 4: FamilyPlanningList** — same as Referrals for the main table; numbering uses `startIndex + index + 1`; delete the clamp effect.
- [ ] **Step 5: Verify**

Run (from `frontend/`): `npx eslint src/pages` and `npx vite build`
Expected: clean. Then in the browser (log in with the role that owns the screen; seeded accounts are in `backend/database/seeders`), on each screen check: the card height is identical with all rows, with a search that returns 1 row, and with a search that returns 0 rows; pagination stays in place; page returns to 1 after searching. Then (Review Focus 4 and 5) inject an 80-character string into a Patient/ID cell with the devtools console and confirm it ends in `…` without widening the row; open the ⋯ menu on the last visible row and confirm it is not clipped. Where the seed data has fewer than 11 rows, temporarily set `TABLE_PAGE_SIZE = 2` in `utils/tablePaging.js` to exercise paging, and revert it before committing.

- [ ] **Step 6: Commit** — `git commit -m "feat(tables): fixed 10-row pages on referrals, health records and family planning"`

---

### Task 5: BHC Health Records table

**Files:**
- Modify: `components/features/records/HealthRecordsTable.jsx`, `pages/bhc/HealthRecords.jsx`

- [ ] **Step 1: In `HealthRecordsTable`**, delete `ITEMS_PER_PAGE`, the `currentPage`/`totalPages`/`setCurrentPage` props and the local slice; add a `resetKey` prop and use `usePagedRows(records, resetKey)`. The mobile card list renders `pageRows`. Replace the `<div className="hidden min-h-[280px] … md:block"><table …>` wrapper with `<div className="hidden md:block"><FixedTable minWidth="min-w-[850px]">…</FixedTable></div>`.
- [ ] **Step 2: In `pages/bhc/HealthRecords.jsx`**, drop `currentPage` state and pass `resetKey={filters}` instead.
- [ ] **Step 3: Verify** — `npx eslint src && npx vite build` (from `frontend/`); browser check on `/bhc/health-records` as in Task 4 Step 5 (fixed height, 0/1 rows, page reset on search).
- [ ] **Step 4: Commit** — `git commit -m "feat(tables): fixed 10-row pages on BHC health records"`

---

### Task 6: Audit Logs (server-paged, fixed size only)

**Files:**
- Modify: `pages/admin/AuditLogs.jsx`

- [ ] **Step 1:** Replace `<div className="w-full flex-1 overflow-x-auto"><table className="w-full min-w-[1050px] text-left">…</table></div>` with `<FixedTable minWidth="min-w-[1050px]">…</FixedTable>`; remove `min-h-[420px]` from the card wrapper; change the two `min-h-[260px]` empty/error `div`s to `min-h-[var(--akay-empty-h,260px)]`. Leave server paging (`LOGS_PER_PAGE = 10`, `TablePagination`) unchanged.
- [ ] **Step 2: Verify** — lint/build; browser check on `/admin/audit-logs`: the card is the same height on a full page and on a filtered result; error/empty text is centred in the fixed height.
- [ ] **Step 3: Commit** — `git commit -m "feat(tables): fixed size for audit logs table"`

---

### Task 7: Account Directory (real paging)

**Files:**
- Modify: `pages/admin/UserManagement.jsx`

**Interfaces:**
- `AccountsTable` gains a `resetKey` prop (the page passes its `filters` state).

- [ ] **Step 1:** In `AccountsTable`, add `const { page, setPage, totalPages, pageRows } = usePagedRows(users, resetKey)`; the header count stays `users.length`; both the desktop table and the mobile card list render `pageRows`; replace `<TablePagination currentPage={1} totalPages={1}/>` with real props.
- [ ] **Step 2:** Replace the desktop `<div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] …">` wrapper with `<div className="hidden md:block"><FixedTable minWidth="min-w-[1050px]">`; remove the `contact_number` line from the Account cell in the desktop row only (the mobile card keeps it); make `EmptyRow`'s inner `div` use `min-h-[var(--akay-empty-h,260px)]`.
- [ ] **Step 3: Verify** — lint/build; browser check on `/admin/users` (the demo data has few accounts, so use the temporary `TABLE_PAGE_SIZE = 2` trick from Task 4 Step 5, then revert).
- [ ] **Step 4: Commit** — `git commit -m "feat(accounts): real paging and fixed size for Account Directory"`

---

### Task 8: Medicine Availability and Medicine Management

**Files:**
- Modify: `pages/bhc/MedicineAvailability.jsx` (`MedicineTable` and the card around it), `pages/rhu/MedicineManagement.jsx`

- [ ] **Step 1: MedicineAvailability** — in the page, `usePagedRows(filteredItems, <string joining activeTab and every active filter value>)`; pass `pageRows` to `MedicineTable`; swap the `<div className="w-full flex-1 overflow-x-auto"><table className="w-full min-w-[1120px] …">` for `FixedTable minWidth="min-w-[1120px]"`; make the empty-state `div` use `min-h-[var(--akay-empty-h,260px)]`; replace the fake `TablePagination` with real props; the header badge keeps `{filteredItems.length} of {activeItems.length} items`.
- [ ] **Step 2: MedicineManagement** — same, with `min-w-[1160px]`.
- [ ] **Step 3: Verify** — lint/build; browser check both screens (temporary `TABLE_PAGE_SIZE = 2` if the seed has fewer than 11 items); confirm the row action menu (`openMenuId`) on the last row is not clipped.
- [ ] **Step 4: Commit** — `git commit -m "feat(medicine): real paging and fixed size for medicine tables"`

---

### Task 9: Password & Invites

**Files:**
- Modify: `components/features/password-access/AccessRequestTable.jsx`

- [ ] **Step 1:** Inside `AccessRequestTable`, add `usePagedRows(rows, filters)`; the desktop table and mobile `RowCard` list render `pageRows`; swap the desktop `<div className="hidden flex-1 overflow-x-auto md:block"><table className="w-full min-w-[980px] …">` for `<div className="hidden md:block"><FixedTable minWidth="min-w-[980px]">`; the `EmptyState` with `tall` uses `min-h-[var(--akay-empty-h,260px)]`; replace the fake `TablePagination` with real props.
- [ ] **Step 2: Verify** — lint/build; browser check on `/admin/password-reset-requests` (both tabs), including switching tabs and applying the status filter (page returns to 1).
- [ ] **Step 3: Commit** — `git commit -m "feat(accounts): real paging and fixed size for Password & Invites"`

---

### Task 10: Follow-ups list view

**Files:**
- Modify: `pages/bhc/FollowUps.jsx` (`FollowUpList`)

- [ ] **Step 1:** `FollowUpList` gets a `resetKey` prop (the page's `filters`) and uses `usePagedRows(tasks, resetKey)`; it renders `pageRows` inside `<FixedTable minWidth="min-w-[820px]">` followed by `<TablePagination …>`; the "No follow-ups match" empty block keeps its place but uses the fixed empty height. The calendar views are unchanged.
- [ ] **Step 2: Verify** — lint/build; browser check on `/bhc/follow-ups` list view: height stable across filters, calendar views unaffected.
- [ ] **Step 3: Commit** — `git commit -m "feat(follow-ups): paged fixed-size list view"`

---

### Task 11: Patients lists (BHC and RHU)

**Files:**
- Modify: `pages/bhc/PatientsModule.jsx`, `pages/rhu/RHUPatientsModule.jsx`

**Interfaces:**
- Consumes: `useLoadMore`, `LoadMoreButton`, `PATIENTS_LOAD_BATCH`.

- [ ] **Step 1:** In each module, delete `PATIENTS_BATCH_SIZE`, `visibleCount`/`loadingMore` state, `loadMoreRef`, the `IntersectionObserver` effect and the "reset visibleCount on filters" effect (keep the scroll-to-top part in that effect); use `const { visibleItems: visiblePatients, hasMore: hasMorePatients, loadMore } = useLoadMore(filteredPatients, PATIENTS_LOAD_BATCH, filters)`.
- [ ] **Step 2:** In `PatientDirectory`, replace the "Scroll to load more patients" / spinner block with `{hasMorePatients && <div className="flex justify-center py-3"><LoadMoreButton label="Load more patients" onClick={onLoadMore} /></div>}` and pass `onLoadMore` down; remove the now-unused `loadingMore`/`loadMoreRef` props.
- [ ] **Step 3: Verify** — lint/build; browser check on `/bhc/patients` and `/rhu/patients`: first view is 10 cards (2 columns × 5 rows when the list is wide), the button adds 10 more, it disappears at the end and after a filter that leaves fewer cards than are shown (Review Focus 6). Use a temporary smaller `PATIENTS_LOAD_BATCH` if the seed has fewer than 11 patients; revert before committing.
- [ ] **Step 4: Commit** — `git commit -m "feat(patients): Load more button with 10 per batch"`

---

### Task 12: Facilities cards

**Files:**
- Modify: `pages/admin/Facilities.jsx`

- [ ] **Step 1:** `useLoadMore(items, FACILITIES_LOAD_BATCH, type)` (reset when the BHC/RHU tab changes); render `visibleItems` in the card grid; below the grid render `LoadMoreButton label="Load more facilities"` while `hasMore`.
- [ ] **Step 2: Verify** — lint/build; browser check on `/admin/facilities`: 12 cards first (4 rows at 3 columns), the button adds 12 more or the remainder, tab switch resets.
- [ ] **Step 3: Commit** — `git commit -m "feat(facilities): Load more button with 12 per batch"`

---

### Task 13: Final verification sweep

- [ ] **Step 1:** From `frontend/`: `npm run test:table-paging`, `npm run test:access`, `npx eslint .` and `npx vite build`. Expected: all pass, lint prints nothing, build succeeds.
- [ ] **Step 2:** Confirm `TABLE_PAGE_SIZE` is `10` and `PATIENTS_LOAD_BATCH` is `10` in `utils/tablePaging.js` (no leftover temporary values): `git diff main -- frontend/src/utils/tablePaging.js`.
- [ ] **Step 3:** Search for leftovers: `grep -rn "ITEMS_PER_PAGE\|PER_PAGE = \|currentPage={1} totalPages={1}\|min-h-\[420px\]" frontend/src` — only the out-of-scope files may remain (history modal, dashboard "Recent" components, report tables).
- [ ] **Step 4:** Walk every migrated screen once in the browser at the default window width and once narrow (mobile view for Account Directory, Health Records, Password & Invites) to confirm the mobile cards show 10 per page and the desktop card height does not change between pages.
- [ ] **Step 5:** Commit any fixes found; otherwise no commit.
