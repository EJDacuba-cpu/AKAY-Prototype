# Realistic Anatomy Figure, Front/Back Findings & Hover Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat body outline with realistic male/female front/back images on the Physical Exam step and the profile's Visual Health Summary, store each finding's body side, and draw an animated line from a hovered Recorded Finding to its marker.

**Architecture:** `side` is a new key inside the existing `body_findings` JSON (no migration). Marker positions are **normalized** `[x, y]` fractions (0-1) of the figure box, from `bodyFigureGeometry.js`. A presentation-only `AnatomyFigure` renders the image in a fixed 2:3 box and a positioned layer where callers place their own markers as absolutely positioned HTML elements at `left: x%`/`top: y%` with fixed pixel sizes. So the figure scales to any width while hit areas stay constant. The profile adds a panel-wide, pointer-events-none SVG overlay that draws the hover line from DOM rects.

**Tech Stack:** React 19, Tailwind 4, Vite 8, lucide-react, `node --test` for frontend utils; Laravel + PHPUnit for backend.

**Spec:** `docs/superpowers/specs/2026-10-03-anatomy-figure-front-back-design.md`

## Global Constraints

- No new project dependencies. The image converter runs from the scratchpad only.
- Nothing is inferred: only Recorded Findings (which have a region) get markers and lines. Conditions, allergies, medications never do.
- `side` is locked to exactly `"front" | "back"`. The backend rejects anything else (422). The frontend normalizes missing or invalid values to `"front"`, so every existing finding is a front finding. Records are never backfilled.
- `region`, `side` and `location` must survive every hop unchanged: wizard state -> draft save -> draft resume -> finalization POST -> stored record -> profile. Tasks 1 and 2 pin each hop with a test.
- Marker coordinates are normalized fractions `[x, y]` with `0 <= x, y <= 1` relative to the figure box. No component hard-codes pixel or viewBox coordinates for dots. Marker sizes are fixed CSS pixels, so the figure stays responsive at any width.
- `AnatomyFigure` is presentation-only. It takes `sex`, `side`, `onToggleSide`, `flipHint`, `className`, `label` and `children`, and holds no state, no findings, and no hover or selection logic. Counting, filtering and interaction live in the callers.
- Before Tasks 3, 5 and 6 are marked done, all four views (male front, male back, female front, female back) are checked by hand in the running app.
- Region keys stay the 12 in `BODY_REGIONS` / `HealthRecord::BODY_REGIONS`.
- Figure choice: `Female` (case-insensitive) -> female images; anything else (Male, Other, missing) -> male.
- Front view: patient's right on viewer's left. Back view: patient's right on viewer's right. R/L labels match.
- Front/back changes only through the flip icon button (or an explicit edit from the findings list). Never on hover.
- Hover lines only at `(min-width: 1024px)`. Under `prefers-reduced-motion: reduce`: no draw animation, no pulses, no crossfade.
- Frontend unit tests use `node:test` + `node:assert/strict` (see `frontend/src/utils/*.test.js`).
- Match surrounding code style: AKAY red `#DC2626` / `red-600`, square corners (`rounded-none`), lucide icons.

## Review Focus

1. **Legacy findings without `side`** (every saved record today) must show on the front view, label as front, and draw lines. Pinned in Task 2 and Task 6 tests.
2. **A region with findings on both sides**: each view's marker/badge counts only that side's findings. Pinned in Task 6 (`splitFindingsBySide`).
3. **Hovered item scrolled out of its section, or section collapsed**: no line, no stray line to the panel's corner. Pinned in Task 7 (`isRectVisibleWithin`).
4. **Editing a back finding from "Findings by body area" while the figure shows front**: figure flips to back and the dialog anchors beside the back dot (not a stale front node). Manual check in Task 5.
5. **Region, side and specific location survive draft -> resume -> finalization**: `healthRecordService` currently serializes only `id, region, finding, note`, which drops `location`. It must send `location` and `side`. Pinned in Task 1 (backend draft + finalization) and Task 2 (`serializeBodyFindings` / `normalizeBodyFindings` round-trip).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/Http/Requests/HealthRecordRequest.php` | add `body_findings.*.side` rule |
| `backend/app/Services/HealthRecordDraftPayloadService.php` | add `side` to payload shape + rule |
| `backend/tests/Feature/ConsultationProgramsTest.php` | side tests beside existing body-findings tests |
| `frontend/src/utils/bodyFindings.js` | side normalization, side-aware labels/locations/format |
| `frontend/src/services/healthRecordService.js` | serialize `location` + `side` |
| `frontend/src/assets/anatomy/*.webp` | 4 figure images |
| `frontend/src/utils/bodyFigureGeometry.js` | `FIGURE_ASPECT`, normalized per-figure dot tables, `getFigureKey`, `markerStyle` |
| `frontend/src/components/features/patients/AnatomyFigure.jsx` | **new** image + overlay + flip button |
| `frontend/src/components/features/health-records/wizard/BodyPreviewPanel.jsx` | exam figure on AnatomyFigure, side-aware dialog/list |
| `frontend/src/pages/bhc/ConsultationWorkspace.jsx` | lift `side` state, pass `sex` |
| `frontend/src/utils/bodyFindingsSummary.js` | side-aware labels, `splitFindingsBySide` |
| `frontend/src/components/features/patients/BodyFigureSvg.jsx` | profile figure on AnatomyFigure, glowing markers |
| `frontend/src/utils/findingLink.js` | **new** pure geometry for the hover line |
| `frontend/src/components/features/patients/profile/FindingLinkOverlay.jsx` | **new** panel-wide line overlay |
| `frontend/src/components/features/patients/profile/AnatomyFindingsPanel.jsx` | side state, hover wiring, no background |
| `frontend/src/pages/bhc/PatientDetails.jsx` | pass `sex` |
| `frontend/src/index.css` | keyframes for line draw, marker pulse, flip hint |
| `frontend/package.json` | add new test files to `test:patient-overview` |

---

### Task 1: Backend accepts `side` on body findings

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php:283-288`
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php:35-41, 548-553`
- Test: `backend/tests/Feature/ConsultationProgramsTest.php`

**Interfaces:**
- Produces: API accepts `body_findings.*.side` / `payload.bodyFindings.*.side` in `front|back|null`, stored and returned as sent.

- [ ] **Step 1: Write failing tests** in `ConsultationProgramsTest`, next to the existing body-findings tests:
  - `test_body_findings_keep_their_side`: POST `/api/health-records` with findings `[{id:'f1',region:'chest',side:'back',finding:'Rash'},{id:'f2',region:'head',side:'front',finding:'Cut'},{id:'f3',region:'left_leg',finding:'Swelling'}]`; GET asserts `data.body_findings.0.side === 'back'`, `.1.side === 'front'`, and `.2` has no `side` key (`assertJsonMissingPath('data.body_findings.2.side')`).
  - `test_body_findings_reject_an_unknown_side`: `side: 'left'` -> 422 with error on `body_findings.0.side`.
  - Extend `test_body_findings_round_trip_through_a_draft`: add `'side' => 'back'` to the draft finding and assert `data.payload.bodyFindings.0.side === 'back'`.
  - `test_draft_rejects_an_unknown_body_finding_side`: draft POST with `side: 'top'` -> 422 on `payload.bodyFindings.0.side`.
  - In `backend/tests/Feature/HealthRecordDraftFinalizationTest.php`, add `test_body_findings_keep_region_side_and_location_through_draft_and_finalization`. Use the file's existing `createDraft`, `finalize` and `officialPayload` helpers; extend a helper's arguments only if it can't carry `bodyFindings`.
    - Save a draft whose payload `bodyFindings` is `[{id:'f1',region:'chest',side:'back',location:'Upper spine',finding:'Rash',note:'2 days'}, {id:'f2',region:'left_leg',location:'Knee',finding:'Swelling'}]`.
    - GET the draft: assert both entries' `region`, `location`, `f1.side === 'back'`, and that `f2` has no `side`.
    - Finalize with `officialPayload()` plus `body_findings` set to the same two items, with `f2.side = 'front'` as the frontend serializer will send it.
    - GET `/api/health-records/{id}`: assert `body_findings.0` = region `chest`, side `back`, location `Upper spine`, and `body_findings.1` = region `left_leg`, side `front`, location `Knee`.

- [ ] **Step 2: Run, confirm failure**
  Run: `cd backend && php artisan test --filter="ConsultationProgramsTest|HealthRecordDraftFinalizationTest"`
  Expected: the new side tests fail (side stripped from draft shape / no 422).

- [ ] **Step 3: Implement**
  - `HealthRecordRequest`: `'body_findings.*.side' => ['nullable', 'string', Rule::in(['front', 'back'])]`.
  - `HealthRecordDraftPayloadService`: add `'side' => self::SCALAR` to the `bodyFindings` shape, and `'payload.bodyFindings.*.side' => ['nullable', 'string', Rule::in(['front', 'back'])]`.

- [ ] **Step 4: Run, confirm pass**
  Run: `cd backend && php artisan test --filter="ConsultationProgramsTest|HealthRecordDraftFinalizationTest"`
  Expected: all PASS.

- [ ] **Step 5: Commit**
  `git add backend/app/Http/Requests/HealthRecordRequest.php backend/app/Services/HealthRecordDraftPayloadService.php backend/tests/Feature/ConsultationProgramsTest.php backend/tests/Feature/HealthRecordDraftFinalizationTest.php`
  `git commit -m "feat(body-findings): accept front/back side on findings"`

---

### Task 2: Side-aware body findings utils + record serializer

**Files:**
- Modify: `frontend/src/utils/bodyFindings.js`
- Modify: `frontend/src/services/healthRecordService.js:808-812`
- Test: `frontend/src/utils/bodyFindings.test.js`

**Interfaces:**
- Produces:
  - `BODY_SIDES = ["front", "back"]`
  - `normalizeBodySide(value) -> "front" | "back"`
  - `normalizeBodyFindings(list) -> [{ id, region, side, location, finding, note }]`
  - `getBodyRegionLabel(region, side = "front") -> string`
  - `getSpecificLocationOptions(region, side = "front") -> [{ value, label }]`
  - `splitSpecificLocation(region, location, side = "front")`. It must look up the side's list so a back location round-trips into the select.
  - `formatBodyFindings(list)` uses the side-aware label.
  - `serializeBodyFindings(list) -> [{ id, region, side, location, finding, note }] | null`: normalized entries, `location`/`note` as `null` when empty, `null` for an empty list. This is the single serializer for the finalization POST.

- [ ] **Step 1: Write failing tests** in `bodyFindings.test.js`:
  - Update the first existing test's expected object to include `side: "front"`.
  - `normalizeBodyFindings keeps a valid side and defaults the rest to front`: inputs with `side: "back"`, `side: "BACK"`, `side: "left"`, none -> `["back", "front", "front", "front"]` (only exact lowercase is valid).
  - `getBodyRegionLabel is side-aware`: front `chest` -> `"Chest"`. Back: `head` -> `"Back of head"`, `chest` -> `"Upper back"`, `abdomen` -> `"Lower back"`, `pelvis` -> `"Buttocks"`, `left_arm` -> `"Left arm (back)"`, `right_hand` -> `"Back of right hand"`, `left_leg` -> `"Left leg (back)"`, `right_foot` -> `"Right heel / sole"`. Omitting `side` equals `"front"`.
  - `getSpecificLocationOptions has back-side lists`: values for back `chest` equal `["Right shoulder blade", "Left shoulder blade", "Upper spine", "Between shoulder blades", OTHER_LOCATION]`; back `abdomen` = `["Lower spine", "Right flank", "Left flank", "Sacrum / Tailbone", OTHER_LOCATION]`; back `head` = `["Back of scalp", "Nape / Back of neck", OTHER_LOCATION]`; back `pelvis` = `["Right buttock", "Left buttock", "Tailbone", OTHER_LOCATION]`. Limbs on back reuse their front list (arm/hand/leg/foot places are the same words).
  - `splitSpecificLocation finds a back-side place`: `splitSpecificLocation("chest", "Upper spine", "back")` -> `{ choice: "Upper spine", other: "" }`.
  - `formatBodyFindings uses back labels`: `[{region:"chest",side:"back",location:"Upper spine",finding:"Rash"}]` -> `"Upper back - Upper spine: Rash"`.
  - `serializeBodyFindings keeps region, side and location`: `[{id:"f1",region:"chest",side:"back",location:"Upper spine",finding:"Rash",note:""}, {id:"f2",region:"left_leg",location:"Knee",finding:"Swelling"}]` deep-equals `[{id:"f1",region:"chest",side:"back",location:"Upper spine",finding:"Rash",note:null}, {id:"f2",region:"left_leg",side:"front",location:"Knee",finding:"Swelling",note:null}]`. `serializeBodyFindings([])` and `(null)` -> `null`.
  - `findings survive save -> resume unchanged`: for the same input, `normalizeBodyFindings(JSON.parse(JSON.stringify(serializeBodyFindings(input))))` deep-equals `normalizeBodyFindings(input)`. This mirrors draft save -> resume (`ConsultationWorkspace` resumes with `normalizeBodyFindings(payload.bodyFindings)`) and finalization -> profile (`healthRecordService` reads with `normalizeBodyFindings(record.body_findings)`).

- [ ] **Step 2: Run, confirm failure**
  Run: `cd frontend && node --test src/utils/bodyFindings.test.js`
  Expected: FAIL on side assertions.

- [ ] **Step 3: Implement** in `bodyFindings.js`. Add `BACK_LABELS` and `BACK_SPECIFIC_LOCATIONS` maps beside `SPECIFIC_LOCATIONS`, keyed by region. Labels/locations fall back to the front entry where the back map has none (limbs' locations). The `normalizeBodyFindings` output key order is `id, region, side, location, finding, note`.

- [ ] **Step 4: Fix the serializer.** In `healthRecordService.js:808-812`, replace the inline map with `body_findings: serializeBodyFindings(record.bodyFindings)`. The draft save path already sends the raw `bodyFindings` state (`ConsultationWorkspace.jsx:1353`), so `side` and `location` ride along there. Confirm no other code strips keys from `bodyFindings`: run `grep -rn "bodyFindings" frontend/src` and check every hit.

- [ ] **Step 5: Run, confirm pass**
  Run: `cd frontend && node --test src/utils/bodyFindings.test.js src/utils/bodyFindingsSummary.test.js`
  Expected: PASS. If a `bodyFindingsSummary` deepEqual now needs `side: "front"`, update that expectation.

- [ ] **Step 6: Commit**
  `git commit -m "feat(body-findings): side-aware labels and locations; keep location and side on save"` (add the three files).

---

### Task 3: Figure images and per-figure geometry

**Files:**
- Create: `frontend/src/assets/anatomy/{male,female}-{front,back}.webp`
- Modify: `frontend/src/utils/bodyFigureGeometry.js`
- Test: `frontend/src/utils/bodyFigureGeometry.test.js`

**Interfaces:**
- Produces:
  - `FIGURE_ASPECT = "2 / 3"`: the CSS `aspect-ratio` of the figure box, matching the 1024 x 1536 images.
  - `FIGURE_KEYS = ["male", "female"]`
  - `getFigureKey(sex) -> "male" | "female"` (trim, case-insensitive `"female"` -> female)
  - `DOT_POSITIONS[figure][side][region] -> [x, y]`, **normalized**: `0 <= x, y <= 1` as fractions of the figure box's width and height
  - `getDotPosition(figure, side, region) -> [x, y]` (normalized)
  - `markerStyle([x, y]) -> { left: "<x*100>%", top: "<y*100>%" }`: the only coordinate-to-CSS conversion callers use
  - `FIGURE_SHAPES` and `FIGURE_VIEWBOX` removed

- [ ] **Step 1: Convert the images** (scratchpad, not the repo). The pack's four SVGs are `d:\Documents\anatomy-svg-pack.zip`. Each wraps one base64 RGBA PNG. Extract with `sed -n 's/.*base64,\([^"]*\)".*/\1/p' X.svg | base64 -d > X.png`, then convert with `npx --yes sharp-cli -i X.png -o <repo>/frontend/src/assets/anatomy/ -f webp -q 82` (run from the scratchpad dir so nothing is added to the project). Check alpha survived: the converted file's corner pixel must be transparent. Open it on a white page and confirm there's no black box.
  Expected: four `.webp` files, each < 300 KB.

- [ ] **Step 2: Write failing tests** in `bodyFigureGeometry.test.js` (replace the existing test):
  - `every figure/side has a normalized position for every region`: loop `FIGURE_KEYS` x `["front","back"]` x `BODY_REGIONS`; each `[x, y]` is finite with `0 <= x <= 1` and `0 <= y <= 1`.
  - `patient's right is on the viewer's left from the front and right from the back`: for each figure, `right_arm[0] < 0.5 < left_arm[0]` on front, reversed on back. Same for `right_leg` / `left_leg`.
  - `getFigureKey`: `"Female"`, `" female "` -> `"female"`; `"Male"`, `"Other"`, `""`, `undefined` -> `"male"`.
  - `markerStyle([0.25, 0.5])` deep-equals `{ left: "25%", top: "50%" }`.

- [ ] **Step 3: Run, confirm failure**
  Run: `cd frontend && node --test src/utils/bodyFigureGeometry.test.js`

- [ ] **Step 4: Implement** the geometry. Starting values for `male.front`, measured from the image; refine in Step 6:
  `head [0.5,0.088], chest [0.5,0.238], abdomen [0.5,0.342], pelvis [0.5,0.456], right_arm [0.322,0.306], left_arm [0.678,0.306], right_hand [0.186,0.514], left_hand [0.814,0.514], right_leg [0.422,0.658], left_leg [0.578,0.658], right_foot [0.43,0.938], left_foot [0.57,0.938]`.
  - `male.back`: mirror x (`1 - x`) and swap right/left, so `right_arm` ends at ~0.678.
  - `female.*`: start from the male values and calibrate in Step 6.
  - Round values to 3 decimals.

- [ ] **Step 5: Run, confirm pass.** Same command. Expected: PASS.

- [ ] **Step 6: Calibrate visually, all four views.** Write a throwaway scratchpad HTML page that shows male front, male back, female front and female back side by side.
  - Each figure is an `aspect-ratio: 2/3` box with the `.webp` and 12 absolutely positioned 10px dots at `left/top = value*100%`.
  - Render the page at two widths (240px and 420px per figure) to prove the dots stay put when the figure scales.
  - Screenshot all four views at both widths. Adjust any dot that isn't centred on its body part: torso dots on the midline, arm dots on the upper arm/elbow, hand dots on the palm, leg dots mid-thigh/knee, foot dots on the foot.
  - Re-run the tests. Attach the final screenshots to the task report.

- [ ] **Step 7: Commit**
  `git commit -m "feat(anatomy): realistic figure images and per-figure dot positions"` (add the webp files, geometry, test).

---

### Task 4: Shared `AnatomyFigure` component

**Files:**
- Create: `frontend/src/components/features/patients/AnatomyFigure.jsx`
- Modify: `frontend/src/index.css` (keyframes)

**Interfaces:**
- Consumes: `getFigureKey`, `FIGURE_ASPECT` (Task 3).
- Produces: `AnatomyFigure({ sex, side, onToggleSide, flipHint = false, className = "", label, children })`. It is **presentation-only**: no `useState`/`useEffect`, no findings, no counting, no hover or selection logic, and no knowledge of regions or marker positions.
  - Root is `<figure>`, `relative`, `style={{ aspectRatio: FIGURE_ASPECT }}`, sized by `className` (callers set width or height). `aria-label={label}`.
  - `<img>` fills the box (`absolute inset-0 h-full w-full object-contain`) with `alt=""`, `draggable={false}` and `decoding="async"`. The four images are imported statically from `assets/anatomy` (Vite fingerprints them).
  - `children` render in an `absolute inset-0` layer above the image. Callers position markers inside it with `markerStyle(...)` plus `-translate-x-1/2 -translate-y-1/2`, at fixed pixel sizes.
  - R / L labels: small text in the top corners. Front: `R` left / `L` right. Back: swapped.
  - Flip button: top-right, `h-8 w-8`, lucide `RotateCcw` size 15, `aria-label` and `title` = `side === "front" ? "Show back" : "Show front"`, `onClick={onToggleSide}`. It's omitted when `onToggleSide` isn't passed. While `flipHint`, add class `anatomy-flip-hint`.
  - A visually hidden `aria-live="polite"` span renders `"Front view"` / `"Back view"` from the `side` prop, so it announces on change with no effect needed.
  - Crossfade: key the `<img>` on `` `${figure}-${side}` `` with class `anatomy-fade-in`.

- [ ] **Step 1: Add keyframes to `index.css`:**
  - `anatomy-fade-in`: opacity 0 -> 1, 150ms.
  - `anatomy-flip-hint`: red ring pulse, 2 x 600ms.
  - `anatomy-marker-pulse`: halo `transform: scale` and opacity breathe, 1.6s infinite (HTML element, so use scale, not `r`).
  - `anatomy-link-draw`: `stroke-dashoffset` from `var(--link-length)` to 0, 350ms ease-out.
  - One `@media (prefers-reduced-motion: reduce)` block sets `animation: none` on all four classes.

- [ ] **Step 2: Implement `AnatomyFigure.jsx`** per the Interfaces block.

- [ ] **Step 3: Verify the build**
  Run: `cd frontend && npx eslint src/components/features/patients/AnatomyFigure.jsx && npm run build`
  Expected: no lint errors; build succeeds and emits 4 webp assets.

- [ ] **Step 4: Commit** `git commit -m "feat(anatomy): shared AnatomyFigure with flip button"`

---

### Task 5: Physical Exam step on the new figure

**Files:**
- Modify: `frontend/src/components/features/health-records/wizard/BodyPreviewPanel.jsx`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx:845, 4675-4684, 4793-4799`

**Interfaces:**
- Consumes: `AnatomyFigure`, `getDotPosition`, `getFigureKey`, side-aware `getBodyRegionLabel` / `getSpecificLocationOptions` / `splitSpecificLocation`.
- Produces:
  - `BodyPreviewPanel({ findings, onChange, readOnly, dialog, onDialogChange, sex, side, onSideChange })`.
  - `dialog` is `{ region, side, anchor, editingId }`; `anchor` may be `null`.
  - `BodyFindingsList` unchanged props; groups are keyed by `side:region`.

- [ ] **Step 1: Lift `side`.** In `ConsultationWorkspace` add `const [bodyPreviewSide, setBodyPreviewSide] = useState("front")`. Pass `sex={selectedPatient?.sex}`, `side`, `onSideChange` to `BodyPreviewPanel`. `BodyFindingsList.onEdit` becomes:
  `setBodyPreviewSide(item.side); setBodyFindingDialog({ region: item.region, side: item.side, anchor: null, editingId: item.id })`
  and the `getBodyRegionAnchor` import is dropped from the workspace.

- [ ] **Step 2: Rewrite `BodyFigure`** on `AnatomyFigure` (`className="mx-auto w-full max-w-[240px]"`). Drop `FigureOutline`, `RegionShape`, the outer `<svg>`, and the `FIGURE_SHAPES` import.
  - Each `BodyDot` becomes an HTML `<button type="button">`, absolutely positioned with `style={markerStyle(getDotPosition(figure, side, region))}` and `-translate-x-1/2 -translate-y-1/2`.
  - Sizes in fixed px, matching today's on-screen look: hit area 28px (the transparent button itself), visible dot 12px, selection ring 18px, count badge 13px with 8px bold text, offset top-right.
  - Keep `data-region`, the ARIA labels, keyboard handling, and `role="img"` + `tabIndex=-1` when `readOnly`.
  - `countByRegion` counts only `item.side === side`.
  - Hover callout placement uses the same normalized `[x, y]`: `top: y*100%`, `left: calc(x*100% + 14px)` or `right: calc((1-x)*100% + 14px)`, with the side chosen by `x <= 0.5`.
  - The caption becomes `` `${side === "front" ? "Front" : "Back"} view · R / L = patient's side` ``.
  - The flip calls `onSideChange`, is disabled while a dialog is open, and is allowed in `readOnly`.

- [ ] **Step 3: Side-aware dialog.**
  - `FindingDialog` gets a `side` prop: title `getBodyRegionLabel(region, side)`, options `getSpecificLocationOptions(region, side)`, `splitSpecificLocation(region, …, side)`, and `onSave` includes `side`.
  - `BodyPreviewPanel` passes `findings.filter(i => i.region === dialog.region && i.side === dialog.side)` and `key={`${dialog.side}:${dialog.region}:${dialog.editingId || ""}`}`.
  - Opening from a dot: `onDialogChange({ region, side, anchor, editingId: null })`.
  - In `FindingDialog`'s layout effect, resolve `const target = anchor?.isConnected ? anchor : getBodyRegionAnchor(region)` inside `place()`. The figure has re-rendered on the new side by then.

- [ ] **Step 4: `BodyFindingsList`.** Groups = `BODY_SIDES.flatMap(side => BODY_REGIONS.map(...))`, filtered by `item.side === side && item.region === key`. Label = `getBodyRegionLabel(key, side)`, so front groups come first and back groups second.

- [ ] **Step 5: Verify**
  Run: `cd frontend && npx eslint src/components/features/health-records/wizard/BodyPreviewPanel.jsx src/pages/bhc/ConsultationWorkspace.jsx && npm run build`
  Then manually, in the running app (`run` skill), on the Physical Exam step:
  1. Male patient: add a front chest finding with location "Sternum"; flip; add a back chest finding with location "Upper spine". Confirm the dialog title says "Upper back", the back location list shows the back places, and the badge counts are 1 per view.
  2. Flip back to front, then click Edit on the back finding in "Findings by body area". The figure flips to back and the dialog sits beside the back chest dot (Review Focus #4).
  3. Save the draft, leave the page, resume it. Both findings keep region, side and specific location, and the dialog's location select is pre-filled. Finalize; on the new record's view, region, side and location are all shown correctly.
  4. **All four views, by hand:** a male patient (front and back) and a female patient (front and back). Every one of the 12 dots sits on its body part, and the R/L labels are correct per side. Screenshot each view.
  5. Shrink the window from 1440px to 1024px and then to mobile (bottom sheet): dots stay on their body parts as the figure scales.

- [ ] **Step 6: Commit** `git commit -m "feat(consultation): realistic body figure with front/back findings"`

---

### Task 6: Profile figure on the new images, per-side markers

**Files:**
- Modify: `frontend/src/utils/bodyFindingsSummary.js`
- Test: `frontend/src/utils/bodyFindingsSummary.test.js`
- Modify: `frontend/src/components/features/patients/BodyFigureSvg.jsx`
- Modify: `frontend/src/components/features/patients/profile/AnatomyFindingsPanel.jsx`
- Modify: `frontend/src/pages/bhc/PatientDetails.jsx:487-493`

**Interfaces:**
- Consumes: `AnatomyFigure`, `getDotPosition`, `getFigureKey`, side-aware labels.
- Produces:
  - Summary findings carry `side` and `regionLabel = getBodyRegionLabel(region, side)`.
  - `splitFindingsBySide(findings) -> { front: { [region]: item[] }, back: { [region]: item[] } }`.
  - `BodyFigureSvg({ sex, side, onToggleSide, findingsByRegion, selectedRegion, onSelectRegion, isDesktop, linkedRegion, flipHint, onHoverRegion })`. The file name stays as is to limit churn. Each marker is an HTML `<button>` with `data-marker-region={region}`, and its visible core `<span>` has `data-marker-core`, so Task 7 can find it.
  - `AnatomyFindingsPanel({ ..., sex })`.

- [ ] **Step 1: Write failing tests** in `bodyFindingsSummary.test.js`:
  - `summary findings carry side and a side-aware label`: a record with `[{region:"chest",side:"back",finding:"Rash"}, {region:"chest",finding:"Cough"}]` -> sides `["back","front"]`, labels `["Upper back","Chest"]`.
  - `splitFindingsBySide keeps each side's regions apart` (Review Focus #2): both chest findings above -> `front.chest.length === 1`, `back.chest.length === 1`, `front.abdomen === undefined`.

- [ ] **Step 2: Run, confirm failure**
  Run: `cd frontend && node --test src/utils/bodyFindingsSummary.test.js`

- [ ] **Step 3: Implement** `regionLabel` with side, plus `splitFindingsBySide`. Run again; expected PASS.

- [ ] **Step 4: Rewrite `BodyFigureSvg`** on `AnatomyFigure` (`className="h-full max-h-full w-auto"`, so it fills the column height).
  - Markers are HTML `<button>`s at `markerStyle(getDotPosition(figure, side, region))`, centred with `-translate-x-1/2 -translate-y-1/2`, in fixed px:
    - hit area 32px (the button);
    - halo 24px `rounded-full bg-red-600/20 blur-[1px]`;
    - core 11px `rounded-full bg-red-600 ring-2 ring-white` with `data-marker-core`;
    - when `region === linkedRegion || hovered`, the halo gets class `anatomy-marker-pulse` and an 18px `ring-2 ring-red-600` appears.
  - Badge: 13px slate-900 circle with the count, offset top-right, for 2+ findings.
  - Callout placement uses the normalized `[x, y]` exactly as in Task 5 Step 2.
  - Remove `Shape`, `FIGURE_SHAPES`, the `<svg>`, and the inline R/L text (AnatomyFigure draws them). Keep the local hover state for the callout, and also report changes through `onHoverRegion(region | null)`.

- [ ] **Step 5: Update `AnatomyFindingsPanel`.**
  - Add `const [side, setSide] = useState("front")`.
  - `findingsByRegion` = `splitFindingsBySide(summary.findings)[side]`.
  - Flipping sets side and clears `selectedRegion`.
  - With a region selected, `listed` filters by region **and** `side`; with none selected, it lists all findings, front then back.
  - Back items get a tag `<span className="ml-1 rounded-sm border border-slate-300 px-1 text-[10px] font-semibold uppercase text-slate-500">Back</span>`.
  - Remove the radial-gradient wrapper. The figure container becomes `flex min-h-[420px] flex-1 items-center justify-center`, and the centre column becomes `flex flex-col` so the figure takes the remaining height.
  - Pass `sex` from `PatientDetails`: `sex={patient.sex}`.

- [ ] **Step 6: Verify**
  Run: `cd frontend && node --test src/utils/bodyFindingsSummary.test.js && npx eslint src/components/features/patients src/pages/bhc/PatientDetails.jsx && npm run build`
  Manual: on the patient Overview tab:
  - The figure is large with no grey halo box.
  - A legacy patient's findings show on front (Review Focus #1).
  - Flipping shows back findings only.
  - Selecting a marker filters the list.
  - Latest/History still work.
  - The record finalized in Task 5 shows its back finding as "Upper back - Upper spine: …" with a Back tag.
  - **All four views, by hand:** a male and a female patient with findings in all 12 regions on both sides (use a seeded or newly finalized test record). Every marker sits on its body part in male front, male back, female front and female back. Screenshot each view.
  - Resize the window from 1920px to 1024px: markers stay on their body parts as the figure height changes.

- [ ] **Step 7: Commit** `git commit -m "feat(patient-overview): large realistic figure with front/back markers"`

---

### Task 7: Animated hover line from Recorded Findings to markers

**Files:**
- Create: `frontend/src/utils/findingLink.js`
- Test: `frontend/src/utils/findingLink.test.js`
- Create: `frontend/src/components/features/patients/profile/FindingLinkOverlay.jsx`
- Modify: `frontend/src/components/features/patients/profile/AnatomyFindingsPanel.jsx`
- Modify: `frontend/package.json` (`test:patient-overview` gains `src/utils/bodyFindings.test.js src/utils/findingLink.test.js`)

**Interfaces:**
- Consumes: marker `[data-marker-region]` button and its `[data-marker-core]` span (Task 6), plus `BodyFigureSvg`'s `linkedRegion` / `flipHint` / `onHoverRegion` props.
- Produces:
  - `findingLink.js`:
    - `linkPath(from: {x,y}, to: {x,y}) -> string`: cubic `M from C c1 c2 to` with `c1 = { x: from.x + dx*0.5, y: from.y }`, `c2 = { x: to.x - dx*0.5, y: to.y }`, `dx = to.x - from.x`.
    - `isRectVisibleWithin(rect, clip) -> boolean`: true when the rect's vertical centre lies within `[clip.top, clip.bottom]` and `rect.height > 0`.
    - `toLocalPoint(clientPoint, containerRect) -> {x,y}`.
  - `FindingLinkOverlay({ containerRef, itemEl, markerRegion })`: renders nothing when either end is missing.

- [ ] **Step 1: Write failing tests** in `findingLink.test.js`:
  - `linkPath draws a horizontal-tangent cubic`: `linkPath({x:0,y:0},{x:100,y:50})` === `"M 0 0 C 50 0 50 50 100 50"`.
  - `isRectVisibleWithin rejects scrolled-out and collapsed items` (Review Focus #3):
    - `{top:10,bottom:30,height:20}` in `{top:0,bottom:100}` -> true;
    - centre at 110 -> false;
    - `height: 0` -> false.
  - `toLocalPoint subtracts the container origin`: `({x:150,y:80},{left:100,top:50})` -> `{x:50,y:30}`.

- [ ] **Step 2: Run, confirm failure**
  Run: `cd frontend && node --test src/utils/findingLink.test.js`

- [ ] **Step 3: Implement `findingLink.js`.** Run again; expected PASS.

- [ ] **Step 4: Implement `FindingLinkOverlay`.**
  - An absolutely positioned `<svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden="true">`.
  - Measure on mount, `ResizeObserver(container)`, and `scroll` (capture) on the container while mounted. Inside `requestAnimationFrame`:
    - `from` = item rect's right-edge vertical centre;
    - `to` = centre of `container.querySelector(`[data-marker-region="${markerRegion}"] [data-marker-core]`)`'s rect;
    - `clip` = `itemEl.closest("[id$='-panel']")` rect;
    - if `!isRectVisibleWithin(itemRect, clip)` render nothing.
  - Path: `stroke="#DC2626"`, `strokeWidth=1.5`, `fill="none"`, class `anatomy-link-draw`, `style={{ "--link-length": len, strokeDasharray: len }}` where `len = pathEl.getTotalLength()` (measure through a ref, then set state).
  - A 3px red dot at `from`.
  - Key the path on `itemEl` identity so it re-animates per item.

- [ ] **Step 5: Wire it into `AnatomyFindingsPanel`.**
  - Add a `panelRef` on the panel body `div` (make it `relative`).
  - State `activeLink = { el, item } | null`, set on the findings list button's `onMouseEnter` / `onFocus` and cleared on `onMouseLeave` / `onBlur`.
  - Only when `isDesktop`:
    - if `item.side === side`, render `<FindingLinkOverlay containerRef={panelRef} itemEl={activeLink.el} markerRegion={item.region} />` and pass `linkedRegion={item.region}` to `BodyFigureSvg`;
    - otherwise pass `flipHint` to `BodyFigureSvg` (forwarded to `AnatomyFigure`) and draw no line.
  - Flipping clears `activeLink`.
  - Hovering a marker highlights list items of that region: add `bg-red-50` to items whose `region === hoveredRegion && side === side`. The panel learns the hovered region from `BodyFigureSvg`'s `onHoverRegion` prop.

- [ ] **Step 6: Verify**
  Run: `cd frontend && npm run test:patient-overview && npx eslint src/components/features/patients src/utils/findingLink.js && npm run build`
  Manual at 1280px:
  - Hovering a finding draws the line over ~350ms and the marker pulses. Tab-focusing an item does the same.
  - Scroll the Recorded Findings section until the item leaves view: the line disappears. Collapse the section: no line.
  - Hovering a back finding while viewing front: no line, and the flip button pulses.
  - Resize the window while hovering: the line tracks.
  - With OS reduced-motion on: the line appears instantly with no pulse.
  - At 800px wide: no lines.

- [ ] **Step 7: Commit** `git commit -m "feat(patient-overview): animated line from hovered finding to its marker"`
