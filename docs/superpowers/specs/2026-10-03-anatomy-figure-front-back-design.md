# Realistic Anatomy Figure, Front/Back Findings & Hover Lines

Date: 2026-10-03 · Status: approved in brainstorming

## Goal

Replace the flat SVG body outline with the realistic male/female, front/back
mannequin images from `anatomy-svg-pack.zip`, on both the consultation's
Physical Exam step and the patient profile's Visual Health Summary. Findings
record which side of the body (front or back) they were placed on. On the
profile, the figure is large and has no background, and hovering a Recorded
Finding draws an animated line from the list item to its marker on the body.

## Decisions

| # | Decision |
|---|----------|
| 1 | Hover lines connect **Recorded Findings only**. Current Conditions, Allergies and Medications have no body location and get no line - nothing is inferred. |
| 2 | Lines run one way: hovering/focusing a list item draws a line to its marker. Hovering a marker shows the existing callout and highlights its list items, without lines. |
| 3 | Both screens use the same realistic images and one shared geometry. |
| 4 | Each finding stores `side: "front" \| "back"`. The health worker sets it by clicking a dot on the front or back view. |
| 5 | Existing findings without `side` are treated as `"front"` - they were entered on a front-only figure. Records stay immutable; nothing is backfilled. |
| 6 | Region keys stay the same 12. On the back view, labels and specific-location lists are side-aware (chest -> Upper back, etc.). Backend region validation is unchanged. |
| 7 | Figure follows the registered sex: `Female` -> female images; `Male`, `Other` or missing -> male images. |
| 8 | Front/back is switched by a single **icon button** on the figure, on both screens. There is **no** automatic switching on hover. |
| 9 | Hover lines are desktop-only (>= 1024px) and respect `prefers-reduced-motion`. |

## Data model

Body finding (inside the existing `health_records.body_findings` JSON column
and the draft payload's `bodyFindings`):

```
{ id, region, side: "front" | "back", location, finding, note }
```

No migration - `side` is a key inside the JSON.

### Backend

- `HealthRecordRequest`: add `'body_findings.*.side' => ['nullable', 'string', Rule::in(['front', 'back'])]`.
- `HealthRecordDraftPayloadService`: add `side` to the `bodyFindings` payload shape map
  (line ~35) and `'payload.bodyFindings.*.side' => ['nullable', 'string', Rule::in(['front', 'back'])]`.
- Tests: `side` accepted for both values, rejected for any other value, omitted
  is accepted, and it round-trips through a draft save/load and a record save.

### Frontend `utils/bodyFindings.js`

- `BODY_SIDES = ["front", "back"]`.
- `normalizeBodyFindings` keeps `side`; missing or invalid -> `"front"`.
- `getBodyRegionLabel(region, side = "front")`. Back labels:

  | region | back label |
  |---|---|
  | head | Back of head |
  | chest | Upper back |
  | abdomen | Lower back |
  | pelvis | Buttocks |
  | right_arm / left_arm | Right arm (back) / Left arm (back) |
  | right_hand / left_hand | Back of right hand / Back of left hand |
  | right_leg / left_leg | Right leg (back) / Left leg (back) |
  | right_foot / left_foot | Right heel / sole / Left heel / sole |

- `getSpecificLocationOptions(region, side = "front")` gains back-side lists,
  anatomical places only (never symptoms), e.g. Upper back: Right shoulder
  blade, Left shoulder blade, Upper spine, Between shoulder blades; Lower back:
  Lower spine, Right flank, Left flank, Sacrum / Tailbone; Back of head:
  Back of scalp, Nape / Back of neck. "Other / Specify" is still appended.
- `formatBodyFindings` uses the side-aware label.

## Assets

- Extract the four embedded PNGs (1024 x 1536, RGBA, transparent background
  with a soft white glow) and convert them to WebP with a throwaway
  scratchpad converter - no new project dependency.
- Output: `frontend/src/assets/anatomy/{male,female}-{front,back}.webp`
  (target ~100-200 KB each, alpha preserved).

## Geometry - `utils/bodyFigureGeometry.js`

- `FIGURE_VIEWBOX = { width: 1024, height: 1536 }`.
- `DOT_POSITIONS[figure][side][region] = [x, y]` for `figure` in
  `male | female` and `side` in `front | back` - 4 tables x 12 regions,
  calibrated by eye on each image.
- On the front view the patient's right is on the viewer's left; on the back
  view the patient's right is on the viewer's right. R/L labels flip to match.
- `getFigureKey(sex)` -> `"female"` for `Female`, else `"male"`.
- `FIGURE_SHAPES` is removed.
- Tests: every region has a position in all four tables, inside the viewBox;
  right-side regions sit left of centre on front and right of centre on back.

## Shared figure component

New `components/features/patients/AnatomyFigure.jsx`:

- Props: `sex`, `side`, `onToggleSide`, `children` (marker overlay render),
  sizing class.
- Renders the `<img>` for the figure/side, plus an absolutely positioned SVG
  in the same 1024 x 1536 viewBox for markers, badges and R/L labels.
- Flip control: a single icon button (lucide `RotateCcw` or similar) at the
  figure's top-right. `aria-label` "Show back" / "Show front", `title`
  tooltip, `aria-pressed` not used (it's an action). Changing side crossfades
  the image (~150ms; instant under reduced motion).
- `flipHint` boolean prop: while true, the flip button shows a brief red
  pulse. The profile sets it when a finding on the other side is hovered.

## Physical Exam step - `BodyPreviewPanel.jsx`

- `FigureOutline` replaced by `AnatomyFigure`; dots render in the overlay.
- Local `side` state (default `"front"`), switched only by the flip button.
- Each dot's count/badge counts only findings on the current side.
- Adding a finding from a dot sets that side. Dialog title and location
  options use the side-aware label/list.
- Figure width cap widened from ~190px to ~240px; dot hit areas stay >= 24px
  on screen (radii scaled for the 1024-wide viewBox).
- `BodyFindingsList`: headings use the side-aware label; ordered front then
  back. Editing a finding from the list sets the figure to that finding's side
  (an explicit user action, not a hover).
- Click / tap / Enter / Space, anchored dialog >= 1024px, bottom sheet below,
  hover callout and `readOnly` all behave as today.
- `ConsultationWorkspace` passes the patient's `sex`.

## Visual Health Summary - `AnatomyFindingsPanel.jsx` + `BodyFigureSvg.jsx`

### Figure

- Remove the radial-gradient background wrapper.
- Figure fills the centre column height (~420px at the card's 480px min
  height, growing with the card).
- Local `side` state, flip icon button as above. Markers show only the current
  side's findings.
- Markers: solid red core, soft red halo; a slow pulse on the hovered/linked
  marker. Count badge kept for 2+ findings.
- Existing marker callout, region selection (filters the list), Clear
  selection, Latest / History toggle and click-to-open-record are unchanged.
  Selecting a region filters by region **and** the current side.
- `PatientDetails` passes the patient's `sex`.

### Recorded Findings list

- Back-side items show a small "Back" tag; front is the default and untagged.
- Item label uses the side-aware region label.

### Hover lines (>= 1024px)

- One overlay `<svg>` absolutely positioned over the whole panel body (facts
  column + figure), `pointer-events: none`, `aria-hidden`.
- Hovering or focusing a Recorded Findings item whose side matches the current
  view draws a smooth cubic curve from the item's right edge (vertical centre)
  to its marker centre. Draw-in ~350ms via `stroke-dasharray` /
  `stroke-dashoffset`; the marker pulses when the line arrives. Removed on
  mouse leave / blur.
- Coordinates via `getBoundingClientRect` relative to the panel; marker
  position from the overlay SVG's screen CTM. Recomputed on `ResizeObserver`
  and on scroll of the facts column while an item is active. If the item is
  scrolled out of its section's visible area, no line is drawn.
- Hovering an item on the **other** side: no line, no view change. The flip
  button gets a brief red pulse to signal the marker is on the other view.
- `prefers-reduced-motion`: line appears instantly, no draw animation, no
  pulse.
- Below 1024px: stacked layout as today, no lines; tapping an item opens the
  record as today.

## Testing

- Vitest: `normalizeBodyFindings` side handling and default; side-aware
  labels and location lists; `formatBodyFindings`; geometry completeness and
  orientation; `summarizeBodyFindings` carries `side`; `getFigureKey`.
- PHPUnit feature tests for `side` validation and draft round-trip (above).
- Manual, in the running app: dot and line alignment on male/female x
  front/back at 1024px, 1280px and 1536px widths; mobile layout without lines;
  reduced-motion behaviour.

## Out of scope

- Editing or backfilling `side` on saved records.
- Lines for conditions, allergies or medications.
- A neutral / non-binary figure.
