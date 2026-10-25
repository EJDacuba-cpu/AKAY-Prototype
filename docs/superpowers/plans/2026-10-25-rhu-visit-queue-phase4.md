# RHU Visit Queue — Phase 4 (RHU Patients UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/rhu/patients` becomes a two-view workspace — Today's Queue (default) and All Patients — with a walk-in check-in modal, backed by the Phase 2/3 API.

**Architecture:** A pure util (`rhuQueueView.js`) turns API visits into display rows and filters them; a react-query hook loads the queue; a table built from existing `FixedTable`/`TablePagination`/`SegmentedFilter`/`SearchField`/`ActionMenu` renders it; a modal handles search and check-in; a new workspace page switches views by URL. The shared `PatientsModule` only gains an optional `embedded` prop.

**Tech Stack:** React + Vite, TanStack Query, Tailwind v4, `node --test` for pure utilities.

**Spec:** `docs/superpowers/specs/2026-10-25-rhu-visit-queue-phase4-patients-ui-design.md` (P4-1..P4-11); parent `docs/superpowers/specs/2026-10-24-rhu-visit-queue-design.md` (D6–D9). Design rules: `DESIGN.md`.

## Global Constraints

- BHC pages and their output are unchanged; `PatientsModule` with `embedded` absent/false renders exactly as before.
- Follow DESIGN.md: controls are pills, sheets are rectangular, 44px head / 56px rows, one red primary action per screen, status uses info/neutral/caution stamps (not Alert Red), tokens/ramps not raw hex where the surrounding component already uses them.
- No tracking ID, QR value or referral code is rendered or searched (D7). The queue payload has none.
- Phase 4 renders no Start / Resume / Close / Discard actions (Phase 5). The ⋯ menu has one item: **Open patient record**.
- "Today" and clock times use the `Asia/Manila` zone.
- Backend is not changed in this phase. Never point a verification run at the Supabase connection in `backend/.env`.
- Run from `frontend/`. Unit tests: `node --test <file>`; lint: `npx eslint <files>`; build: `npm run build`. Add a `test:rhu-queue` script.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A visit that arrived just before and just after midnight Manila → "From {date} · still open" only for the earlier one. (Task 1)
2. A status the UI does not know (Phase 5 will add some) → neutral chip with the raw text, never a crash. (Task 1)
3. A visit with no referral object or no sending BHC name, or a patient with no age → the row still renders (no "undefined", no "From null"). (Task 1)
4. Check-in modal: typing fast fires one request after the pause, a response for an old query never replaces a newer one, and a query shorter than 2 characters sends nothing. (Task 3)
5. Check-in response `VISIT_ALREADY_ACTIVE` (another desk was faster) → treated as "already in today's queue", list refreshes, no error toast. (Task 3)

---

## File Structure

| File | Change |
|---|---|
| `src/utils/rhuQueueView.js` (+ `.test.js`) | new — pure row/filter/format logic |
| `src/services/rhuVisitService.js` | + `listRhuVisits()`, `searchPatientsForCheckIn(q)` |
| `src/utils/queryKeys.js` | + `rhuVisits` |
| `src/hooks/useRhuVisits.js` | new — react-query hook |
| `src/components/features/rhu-queue/RhuQueueTable.jsx` | new — toolbar + table + paging |
| `src/components/features/rhu-queue/WalkInCheckInModal.jsx` | new — search + check in |
| `src/pages/rhu/RhuPatientsWorkspace.jsx` | new — heading, view switch, composition |
| `src/pages/bhc/PatientsModule.jsx` | optional `embedded` prop |
| `src/App.jsx` | `/rhu/patients` element → workspace |
| `package.json` | `test:rhu-queue` |

---

### Task 1: Pure queue view logic and API functions

**Files:** Create `src/utils/rhuQueueView.js`, `src/utils/rhuQueueView.test.js`; Modify `src/services/rhuVisitService.js`, `src/utils/queryKeys.js`, `package.json`

**Interfaces — `rhuQueueView.js` (all pure):**
- `queueRows(visits: object[], now?: Date): QueueRow[]` — input is the API `data` array in server order; `QueueRow = { id, number, patientId, name, ageSex, source: 'referral'|'walk_in', sourceLabel, fromLabel: string|null, arrivedTime: string, carriedOver: boolean, arrivalNote: string, status: { label, tone: 'info'|'neutral' } }`.
- `filterQueueRows(rows, { search: string, source: 'all'|'referral'|'walk_in' }): QueueRow[]` — every whitespace-separated search token must appear (case-insensitive) in `name`.
- `formatWaiting(minutes: number): string` — `< 1` → `Just arrived`; `1–119` → `N min`; `≥ 120` → `H h` or `H h M min`.
- `statusChip(status: string): { label, tone }` — `waiting` → `Waiting`/`info`; anything else → Title-cased raw text/`neutral`.
- Service: `listRhuVisits(): Promise<object[]>` (GET `/rhu-visits`), `searchPatientsForCheckIn(query: string): Promise<object[]>` (GET `/rhu-visits/patient-search?q=<encoded>`); both return `response.data ?? []`. `queryKeys.rhuVisits = () => ["rhu-visits"]`.

Field mapping: `name` ← `patient.full_name`; `ageSex` ← `"{age} · {M|F|O}"` (just the sex letter when age is missing; empty string when both are missing); `sourceLabel` `Referred`/`Walk-in`; `fromLabel` `From {referral.sending_bhc}` only when the name exists; `arrivedTime` the Manila clock time (`h:mm AM/PM`); `arrivalNote` = `Waiting {formatWaiting(waiting_minutes)}`, or `From {Mon D} · still open` when the arrival's Manila date is before `now`'s Manila date.

- [ ] **Step 1: Write the failing tests** (`node:test`, fixed clock `now = new Date('2026-10-25T01:30:00Z')` = 9:30 AM Oct 25 Manila):
  - `formatWaiting`: `0`→`Just arrived`, `1`→`1 min`, `65`→`65 min`, `119`→`119 min`, `120`→`2 h`, `125`→`2 h 5 min`, `NaN`/negative → `Just arrived`.
  - `statusChip('waiting')` → `{label:'Waiting', tone:'info'}`; `statusChip('in_consultation')` → `{label:'In Consultation', tone:'neutral'}`; `statusChip('')`/`undefined` → `{label:'Unknown', tone:'neutral'}`. *(Review Focus 2)*
  - `queueRows` referral visit (`checked_in_at` `2026-10-25T00:12:00Z`, `waiting_minutes` 78, referral `{id:5, sending_bhc:'BHC Poblacion'}`, patient `{id:9, full_name:'Maria Dela Cruz', age:34, sex:'Female'}`) → `name`, `ageSex` `34 · F`, `sourceLabel` `Referred`, `fromLabel` `From BHC Poblacion`, `arrivedTime` `8:12 AM`, `carriedOver` false, `arrivalNote` `Waiting 78 min`, `number` 1.
  - Walk-in visit → `Walk-in`, `fromLabel` null.
  - Midnight edge: arrival `2026-10-24T16:30:00Z` (00:30 Oct 25 Manila) → not carried over; arrival `2026-10-24T15:30:00Z` (23:30 Oct 24 Manila) → `carriedOver` true and `arrivalNote` `From Oct 24 · still open`. *(Review Focus 1)*
  - Missing pieces: referral with no `sending_bhc` → `fromLabel` null; `referral: null` with source referral does not throw; patient without age → `ageSex` `F`; patient without age and sex → `''`; no `waiting_minutes` → `Waiting Just arrived`. *(Review Focus 3)*
  - `queueRows` keeps server order and numbers rows 1..n.
  - `filterQueueRows`: `'ramos jose'` matches "Jose Ramos"; source `referral` keeps only referred rows; blank search keeps all; both combined.
- [ ] **Step 2:** `node --test src/utils/rhuQueueView.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the util with `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', ... })` for the time, the date key (`en-CA` `YYYY-MM-DD`) and the `Mon D` label; implement the two service functions and the query key; add `"test:rhu-queue": "node --test src/utils/rhuQueueView.test.js"` to `package.json`.
- [ ] **Step 4:** `npm run test:rhu-queue` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rhu-queue): add queue view logic and API functions`.

---

### Task 2: Queue hook and table

**Files:** Create `src/hooks/useRhuVisits.js`, `src/components/features/rhu-queue/RhuQueueTable.jsx`

**Interfaces:**
- Consumes: Task 1 `queueRows`, `filterQueueRows`, `listRhuVisits`, `queryKeys.rhuVisits`; existing `FixedTable`, `SearchField`, `SegmentedFilter`, `TablePagination`, `ActionMenu`, `ConnectionErrorState`, `SoftLoadingArea` (all from `components/common`), `usePagedRows`.
- Produces: `useRhuVisits(): { visits, loading, error, queryError, refetch, isRefreshing }` (react-query: `queryKey: queryKeys.rhuVisits()`, `queryFn: listRhuVisits`, `staleTime: 0`, `refetchInterval: 30000`, `refetchOnWindowFocus: true`). `<RhuQueueTable rows onCheckIn canCheckIn loading error onRetry isRefreshing />` where `rows` are `QueueRow[]` and `onCheckIn()` opens the modal.

- [ ] **Step 1: Implement `useRhuVisits`** following `usePatients`'s shape for loading/error flags.
- [ ] **Step 2: Implement `RhuQueueTable`** per the mockup and DESIGN.md: toolbar row with `SearchField` (placeholder "Search patient name", local state), `SegmentedFilter` (All sources / Referred / Walk-in), and — only when `canCheckIn` — one brand `Button` "+ Check in walk-in" calling `onCheckIn`; table via `FixedTable` + `usePagedRows(filteredRows, {search, source})` with columns `#`, Patient (name linking to `/rhu/patients/{patientId}`, age · sex beneath), Source (badge + `fromLabel` beneath), Arrived (`arrivedTime`, `arrivalNote` beneath — caution colour when `carriedOver`), Visit progress (chip from `status`, info vs neutral), Actions (`ActionMenu` with `viewLink` `/rhu/patients/{patientId}` and `viewLabel` "Open patient record", `showHeader={false}`); `TablePagination` under the table; empty state inside the frame ("No patients in today's queue" / narrowed "No matches" with a clear-filters action); error state via `ConnectionErrorState` with `onRetry`; skeleton via `SoftLoadingArea skeleton="table"`.
- [ ] **Step 3:** `npx eslint src/hooks/useRhuVisits.js src/components/features/rhu-queue/RhuQueueTable.jsx` — Expected: no errors (the component is exercised in the browser in Task 5).
- [ ] **Step 4: Commit** `feat(rhu-queue): add the Today's Queue table`.

---

### Task 3: Walk-in check-in modal

**Files:** Create `src/components/features/rhu-queue/WalkInCheckInModal.jsx`

**Interfaces:**
- Consumes: `searchPatientsForCheckIn`, `checkInExistingPatient(patientId, key)` (Phase 3), `newWalkIn()` from `walkInRegistration.js`, `ModalShell`, `Button`, `SearchField`, `react-hot-toast`, `useQueryClient`, `queryKeys.rhuVisits`.
- Produces: `<WalkInCheckInModal open onClose registerPath />` where `registerPath` is `/rhu/patients/add?check_in=1`.

- [ ] **Step 1: Implement.** Search input (`SearchField`) debounced 300 ms; no request when the trimmed query is shorter than 2 characters; a request counter ignores any response that is not the latest (Review Focus 4); results list with name, `age · sex`, birthdate and barangay from the identity payload, then either a **Check in** button or the text "Already in today's queue" when `active_visit_id` is set; a footer link-button "Register new patient" navigating to `registerPath`. One `newWalkIn()` key per modal open (new key after each success); **Check in** disables itself while saving, calls `checkInExistingPatient`, then toasts "{name} added to today's queue", invalidates `queryKeys.rhuVisits()`, and closes. `VISIT_ALREADY_ACTIVE` (error `code`) is handled as success-without-toast: refresh the search results and the queue (Review Focus 5); other errors show `toast.error(error.message)`. Empty, loading and error lines are inline text, not blank space.
- [ ] **Step 2:** `npx eslint src/components/features/rhu-queue/WalkInCheckInModal.jsx` — Expected: no errors.
- [ ] **Step 3: Commit** `feat(rhu-queue): add the walk-in check-in modal`.

---

### Task 4: Workspace page, embedded directory and route

**Files:** Create `src/pages/rhu/RhuPatientsWorkspace.jsx`; Modify `src/pages/bhc/PatientsModule.jsx`, `src/App.jsx`

**Interfaces:**
- Consumes: Task 2 `useRhuVisits`, `RhuQueueTable`; Task 3 `WalkInCheckInModal`; `queueRows`; `SegmentedFilter`; `useAccess().can("patients.register")`; `DashboardLayout`.
- Produces: `PatientsModule({ role, basePath, embedded = false })`; `/rhu/patients` renders `RhuPatientsWorkspace`; `?view=queue|all` in the URL (`queue` when absent or unknown).

- [ ] **Step 1: `PatientsModule`.** Add `embedded = false`. When true: skip both `DashboardLayout` wrappers (render their children directly) and, in the toolbar heading, omit the `<h1>` but keep the count line. When false nothing changes — verify by diffing the rendered markup in the BHC browser check (Task 5).
- [ ] **Step 2: `RhuPatientsWorkspace`.** `DashboardLayout role="rhu" title="Patients"`; heading "Patients" with a one-line description; `SegmentedFilter` ("Today's Queue" with the active count, "All Patients") bound to the `view` search param via `useSearchParams` (replace history entries when switching so Back leaves the page); queue view renders `RhuQueueTable` with `queueRows(visits)` and the modal state; all-patients view renders `<PatientsModule role="rhu" basePath="/rhu" embedded />`. `canCheckIn` from `patients.register`.
- [ ] **Step 3: Route.** In `App.jsx` replace the `RHUPatientsModule` element at `/rhu/patients` with `RhuPatientsWorkspace` (keep `ProtectedPage allowedRole="rhu" module="patientDirectory"`); leave `RHUPatientsModule.jsx` in place (still imported elsewhere, if anywhere) and remove its import from `App.jsx` only if it becomes unused.
- [ ] **Step 4:** `npx eslint` on the changed files and `npm run build` — Expected: no errors.
- [ ] **Step 5: Commit** `feat(rhu-queue): add the RHU Patients workspace`.

---

### Task 5: Verification

- [ ] **Step 1: Automated.** `npm run test:rhu-queue`, `npm run test:walk-in`, `npx eslint` on every file touched in Tasks 1–4, `npm run build`. Expected: all green.
- [ ] **Step 2: Isolated stack safety check (before any data command).** From `backend/` with `DB_CONNECTION=sqlite`, `DB_DATABASE=<scratch file under the session scratchpad>` and `DB_URL=` set in the process environment, run `php artisan config:show database.default` and `php artisan config:show database.connections.sqlite.database`. Expected: `sqlite` and the scratch path. **If either differs, stop** — never continue against the `.env` connection.
- [ ] **Step 3: Seed and serve.** Create the scratch database (`php artisan migrate --force` with `ITR_HISTORY_RESET_CONFIRMED=1`, valid only on the empty scratch file), seed through a throwaway PHP script kept outside the repo: one RHU, one BHC mapped to it, an RHU nurse, a BHC midwife, three RHU patients, one referred BHC patient with a Pending referral, plus Turnstile test keys. Serve the API with `php artisan serve` (same environment) and the frontend with `npm run dev`.
- [ ] **Step 4: Browser check** with the Chrome tools, after loading the `claude-in-chrome` skill: log in as the nurse; confirm (a) `/rhu/patients` opens on Today's Queue, empty state fills the frame; (b) Check in walk-in → search "first last" → Check in → row appears with Walk-in badge, waiting time; (c) searching the same patient again says "Already in today's queue"; (d) Register new patient (`?check_in=1`) saves and the new patient appears in the queue; (e) mark the referral Received through the existing page and the queue shows a Referred row "From {BHC}" with no tracking ID anywhere; (f) tab switch and Back behave; All Patients still lists patients with "New Patient"; (g) the ⋯ menu shows only "Open patient record"; (h) log in as the BHC midwife and confirm the BHC Patients page looks and behaves as before. Take a screenshot of each of (a), (b), (e). Record anything that does not work; do not claim a step that was not seen.
- [ ] **Step 5: Final review** by a fresh reviewer on the whole range; fix Critical/Important with a failing test first where a test is possible; report with the browser results stated exactly (verified / not verified, per step) and stop before Phase 5.
