# Realistic Anatomy Figure, Front/Back Findings & Hover Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat body outline with realistic male/female front/back images on the Physical Exam step and the profile's Visual Health Summary, store each finding's body side, and draw an animated line from a hovered Recorded Finding to its marker.

**Architecture:** `side` is a new key inside the existing `body_findings` JSON (no migration). One shared `AnatomyFigure` component renders the image plus an SVG overlay in the image's 1024 x 1536 space; both screens put their dots in that overlay using per-figure positions from `bodyFigureGeometry.js`. The profile adds a panel-wide, pointer-events-none SVG overlay that draws the hover line from DOM rects.

**Tech Stack:** React 19, Tailwind 4, Vite 8, lucide-react, `node --test` for frontend utils; Laravel + PHPUnit for backend.

**Spec:** `docs/superpowers/specs/2026-10-03-anatomy-figure-front-back-design.md`

## Global Constraints

- No new project dependencies. The image converter runs from the scratchpad only.
- Nothing is inferred: only Recorded Findings (which have a region) get markers and lines. Conditions, allergies, medications never do.
- `side` values are exactly `"front"` and `"back"`; missing or invalid normalizes to `"front"`. Records are never backfilled.
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
5. **Specific location survives saving a record**: `healthRecordService` currently serializes only `id, region, finding, note`, which drops `location`. It must send `location` and `side`. Pinned in Task 2.

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
| `frontend/src/utils/bodyFigureGeometry.js` | viewBox, per-figure dot tables, `getFigureKey`, `getFigureImage` |
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

- [ ] **Step 2: Run, confirm failure**
  Run: `cd backend && php artisan test --filter=ConsultationProgramsTest`
  Expected: the new side tests fail (side stripped from draft shape / no 422).

- [ ] **Step 3: Implement**
  - `HealthRecordRequest`: `'body_findings.*.side' => ['nullable', 'string', Rule::in(['front', 'back'])]`.
  - `HealthRecordDraftPayloadService`: add `'side' => self::SCALAR` to the `bodyFindings` shape, and `'payload.bodyFindings.*.side' => ['nullable', 'string', Rule::in(['front', 'back'])]`.

- [ ] **Step 4: Run, confirm pass**
  Run: `cd backend && php artisan test --filter=ConsultationProgramsTest`
  Expected: all PASS.

- [ ] **Step 5: Commit**
  `git add backend/app/Http/Requests/HealthRecordRequest.php backend/app/Services/HealthRecordDraftPayloadService.php backend/tests/Feature/ConsultationProgramsTest.php`
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

- [ ] **Step 1: Write failing tests** in `bodyFindings.test.js`:
  - Update the first existing test's expected object to include `side: "front"`.
  - `normalizeBodyFindings keeps a valid side and defaults the rest to front`: inputs with `side: "back"`, `side: "BACK"`, `side: "left"`, none -> `["back", "front", "front", "front"]` (only exact lowercase is valid).
  - `getBodyRegionLabel is side-aware`: front `chest` -> `"Chest"`. Back: `head` -> `"Back of head"`, `chest` -> `"Upper back"`, `abdomen` -> `"Lower back"`, `pelvis` -> `"Buttocks"`, `left_arm` -> `"Left arm (back)"`, `right_hand` -> `"Back of right hand"`, `left_leg` -> `"Left leg (back)"`, `right_foot` -> `"Right heel / sole"`. Omitting `side` equals `"front"`.
  - `getSpecificLocationOptions has back-side lists`: values for back `chest` equal `["Right shoulder blade", "Left shoulder blade", "Upper spine", "Between shoulder blades", OTHER_LOCATION]`; back `abdomen` = `["Lower spine", "Right flank", "Left flank", "Sacrum / Tailbone", OTHER_LOCATION]`; back `head` = `["Back of scalp", "Nape / Back of neck", OTHER_LOCATION]`; back `pelvis` = `["Right buttock", "Left buttock", "Tailbone", OTHER_LOCATION]`. Limbs on back reuse their front list (arm/hand/leg/foot places are the same words).
  - `splitSpecificLocation finds a back-side place`: `splitSpecificLocation("chest", "Upper spine", "back")` -> `{ choice: "Upper spine", other: "" }`.
  - `formatBodyFindings uses back labels`: `[{region:"chest",side:"back",location:"Upper spine",finding:"Rash"}]` -> `"Upper back - Upper spine: Rash"`.

- [ ] **Step 2: Run, confirm failure**
  Run: `cd frontend && node --test src/utils/bodyFindings.test.js`
  Expected: FAIL on side assertions.

- [ ] **Step 3: Implement** in `bodyFindings.js`. Add `BACK_LABELS` and `BACK_SPECIFIC_LOCATIONS` maps beside `SPECIFIC_LOCATIONS`, keyed by region. Labels/locations fall back to the front entry where the back map has none (limbs' locations). The `normalizeBodyFindings` output key order is `id, region, side, location, finding, note`.

- [ ] **Step 4: Fix the serializer** in `healthRecordService.js:808-812`: map `({ id, region, side, location, finding, note }) => ({ id, region, side, location: location || null, finding, note: note || null })`.

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
  - `FIGURE_VIEWBOX = { width: 1024, height: 1536 }`
  - `FIGURE_KEYS = ["male", "female"]`
  - `getFigureKey(sex) -> "male" | "female"` (trim, case-insensitive `"female"` -> female)
  - `DOT_POSITIONS[figure][side][region] -> [x, y]`
  - `getDotPosition(figure, side, region) -> [x, y]`
  - `FIGURE_SHAPES` removed

- [ ] **Step 1: Convert the images** (scratchpad, not the repo). The pack's four SVGs are `d:\Documents\anatomy-svg-pack.zip`. Each wraps one base64 RGBA PNG. Extract with `sed -n 's/.*base64,\([^"]*\)".*/\1/p' X.svg | base64 -d > X.png`, then convert with `npx --yes sharp-cli -i X.png -o <repo>/frontend/src/assets/anatomy/ -f webp -q 82` (run from the scratchpad dir so nothing is added to the project). Check alpha survived: the converted file's corner pixel must be transparent. Open it on a white page and confirm there's no black box.
  Expected: four `.webp` files, each < 300 KB.

- [ ] **Step 2: Write failing tests** in `bodyFigureGeometry.test.js` (replace the existing test):
  - `every figure/side has a position for every region inside the viewBox`: loop `FIGURE_KEYS` x `["front","back"]` x `BODY_REGIONS`.
  - `patient's right is on the viewer's left from the front and right from the back`: for each figure, `right_arm.x < 512 < left_arm.x` on front, reversed on back. Same for `right_leg` / `left_leg`.
  - `getFigureKey`: `"Female"`, `" female "` -> `"female"`; `"Male"`, `"Other"`, `""`, `undefined` -> `"male"`.
  - `FIGURE_VIEWBOX` deep-equals `{ width: 1024, height: 1536 }`.

- [ ] **Step 3: Run, confirm failure**
  Run: `cd frontend && node --test src/utils/bodyFigureGeometry.test.js`

- [ ] **Step 4: Implement** the geometry. Starting values for `male.front`, measured from the image; refine in Step 6:
  `head [512,135], chest [512,365], abdomen [512,525], pelvis [512,700], right_arm [330,470], left_arm [694,470], right_hand [190,790], left_hand [834,790], right_leg [432,1010], left_leg [592,1010], right_foot [440,1440], left_foot [584,1440]`.
  - `male.back`: mirror x (`1024 - x`) and swap right/left, so `right_arm` ends at ~694.
  - `female.*`: start from the male values and calibrate in Step 6.

- [ ] **Step 5: Run, confirm pass.** Same command. Expected: PASS.

- [ ] **Step 6: Calibrate visually.** Write a throwaway scratchpad HTML page that draws each `.webp` with its 12 dots at the table values in a 1024 x 1536 SVG overlay. Open it and screenshot all four figures. Adjust any dot that isn't centred on its body part: torso dots on the midline, arm dots on the upper arm/elbow, hand dots on the palm, leg dots mid-thigh/knee, foot dots on the foot. Re-run the tests.

- [ ] **Step 7: Commit**
  `git commit -m "feat(anatomy): realistic figure images and per-figure dot positions"` (add the webp files, geometry, test).

---

### Task 4: Shared `AnatomyFigure` component

**Files:**
- Create: `frontend/src/components/features/patients/AnatomyFigure.jsx`
- Modify: `frontend/src/index.css` (keyframes)

**Interfaces:**
- Consumes: `getFigureKey`, `FIGURE_VIEWBOX` (Task 3).
- Produces: `AnatomyFigure({ sex, side, onToggleSide, flipHint = false, className, title, children })`:
  - `children` render inside an `<svg viewBox="0 0 1024 1536">` laid over the image, so dots use image coordinates.
  - Root element is `relative`, sized by `className` (callers set height or width), aspect ratio 2 / 3.
  - `<img>` with `alt=""` (decorative; the SVG `<title>` = `title` prop names the figure) and `draggable={false}`. Images are imported statically from `assets/anatomy` (Vite fingerprints them).
  - R / L text in the overlay's top corners: front `R` left / `L` right, back swapped.
  - Flip button: top-right, `h-8 w-8`, lucide `RotateCcw` size 15, `aria-label` and `title` = `side === "front" ? "Show back" : "Show front"`. While `flipHint`, add class `anatomy-flip-hint`.
  - Under the image, a visually hidden live region announces `"Front view"` / `"Back view"` on change.
  - Crossfade: key the `<img>` on `figure-side` and give it class `anatomy-fade-in`.

- [ ] **Step 1: Add keyframes to `index.css`:**
  - `anatomy-fade-in`: opacity 0 -> 1, 150ms.
  - `anatomy-flip-hint`: red ring pulse, 2 x 600ms.
  - `anatomy-marker-pulse`: halo `r`/opacity breathe, 1.6s infinite.
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

- [ ] **Step 2: Rewrite `BodyFigure`** on `AnatomyFigure` (`className="mx-auto w-full max-w-[240px]"`). Drop `FigureOutline`, `RegionShape` and the `FIGURE_SHAPES` import.
  - Dots use `getDotPosition(figure, side, region)`.
  - Radii are scaled to the 1024 viewBox (multiply current values by 5.12: hit 72, dot 31, ring 46, badge 33, badge font ~41px), so on-screen sizes stay as today at 200px wide.
  - `countByRegion` counts only `item.side === side`.
  - Hover callout percentages use `FIGURE_VIEWBOX`.
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
  1. Male patient: add a front chest finding; flip; add a back chest finding. Confirm the dialog title says "Upper back" and the badge counts are 1 per view.
  2. Flip back to front, then click Edit on the back finding in "Findings by body area". The figure flips to back and the dialog sits beside the back chest dot (Review Focus #4).
  3. Save the draft, reload it, and confirm both findings keep their side. Finalize the record and confirm `location` and `side` persist.
  4. Female patient shows the female figure.

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
  - `BodyFigureSvg({ sex, side, onToggleSide, findingsByRegion, selectedRegion, onSelectRegion, isDesktop, linkedRegion, flipHint })`. Each marker `<g>` has `data-marker-region={region}`, so Task 7 can find it.
  - `AnatomyFindingsPanel({ ..., sex })`.

- [ ] **Step 1: Write failing tests** in `bodyFindingsSummary.test.js`:
  - `summary findings carry side and a side-aware label`: a record with `[{region:"chest",side:"back",finding:"Rash"}, {region:"chest",finding:"Cough"}]` -> sides `["back","front"]`, labels `["Upper back","Chest"]`.
  - `splitFindingsBySide keeps each side's regions apart` (Review Focus #2): both chest findings above -> `front.chest.length === 1`, `back.chest.length === 1`, `front.abdomen === undefined`.

- [ ] **Step 2: Run, confirm failure**
  Run: `cd frontend && node --test src/utils/bodyFindingsSummary.test.js`

- [ ] **Step 3: Implement** `regionLabel` with side, plus `splitFindingsBySide`. Run again; expected PASS.

- [ ] **Step 4: Rewrite `BodyFigureSvg`** on `AnatomyFigure` (`className="h-full max-h-full w-auto"`, so it fills the column height).
  - Markers: invisible hit circle r 72; halo circle r 60 `fill-red-600/20`; core r 28 `fill-red-600 stroke-white` stroke 8, with `data-marker-core` on it. When `region === linkedRegion || hovered`, the halo gets class `anatomy-marker-pulse` and a ring r 46 `stroke-red-600`.
  - Badge: as today, scaled ×5.12.
  - Callout positioning uses `FIGURE_VIEWBOX`.
  - Remove `Shape`, `FIGURE_SHAPES`, and the inline R/L text (AnatomyFigure draws them).

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
- Consumes: marker `data-marker-region` (Task 6).
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
  - Hovering a marker highlights list items of that region: add `bg-red-50` to items whose `region === hoveredRegion && side === side`. Lift `hoveredRegion` out of `BodyFigureSvg` via an `onHoverRegion` prop.

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
