---
target: Families Module
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\bhc\\BhcFamilies.jsx"
target_fingerprint: "sha256:9070b52bf160f1cfa8d3edbd13d17b3046c01ef67ce3375ca940fffb96900486"
target_path: "D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\bhc\\BhcFamilies.jsx"
timestamp: 2026-10-22T18-14-03Z
slug: frontend-src-pages-bhc-bhcfamilies-jsx
closed: true
---
Method: dual-agent (A: design review · B: detector + browser evidence)
Note: test data has 1 household / 1 member; dense table, long names, multi-node tree, phone width, Connections and Transfer screens judged from source only.

## Design Health Score: 27/40 (Acceptable, near Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeletons, "Updating…", dimmed stale rows; tree shows no zoom/pan state; ~10px header shift on Tree↔List (scrollbar) |
| 2 | Match System / Real World | 3 | Household/FSN/head/purok are user words; empty copy says "create through patient registration" beside an Add Family button |
| 3 | User Control and Freedom | 3 | Chips removable, Clear all, Esc; no unsaved-changes guard on edit form |
| 4 | Consistency and Standards | 2 | Pill filter selects vs native 44px rounded-md selects in form and Connections; square tree cards vs 12px sheets; red for CTA and head marker |
| 5 | Error Prevention | 3 | Version guards, locked head, transfer review; disabled-Transfer reason only in title |
| 6 | Recognition Rather Than Recall | 3 | Edit Connections (only way to draw the tree) is two levels deep in a "…" menu |
| 7 | Flexibility and Efficiency | 2 | Live search, row click, arrow keys; no sort, no shortcuts, Show more only |
| 8 | Aesthetic and Minimalist Design | 3 | Head stated four times; lone member in a 330px canvas |
| 9 | Error Recovery | 3 | Distinct 404/offline; Connections page keeps the bare load error; errors colour-only |
| 10 | Help and Documentation | 2 | Micro-hints only |

## Design Specificity Verdict
Mixed. Directory ledger is authored for AKAY's household-first model; tree canvas, details frame, edit form and Connections page are generic.
Deterministic scan: static detect 0 findings. In-page detector (injection succeeded) found 14 across 3 pages: search placeholder contrast 2.6:1 (real, from shared Input placeholder:text-slate-400); 10px uppercase labels below detector's 11px floor (deliberate Label spec in DESIGN.md, 6.9:1 contrast, system tension); nested-cards x5 (false positives: page sheets, tree node on canvas). Overlay-induced horizontal overflow was not real.

## Overall Impression
Directory finally reads as the product. Weakest screen is the Family Tree, the default tab after opening a household. Biggest opportunity: quiet members-first view, red back to the one action.

## What's Working
1. Directory table: tabular FSN, real link plus whole-row click, stacked address on small screens, 44/56 rhythm.
2. Filter popover: only fields the facility has, draft then Apply, Reset disables at default.
3. Trust behaviour: version conflicts, locked head, transfer review.

## Priority Issues
- [P1] Family Tree is default and weakest: square cards, red head border, #999 strokes (~2.8:1), 10px #666 labels, own toolbar row; lone member in empty canvas. Fix: Members List default; 12px cards with ink border + HEAD pill; tokens; fold hint+zoom into one row. Command: layout, then polish.
- [P1] Red spent several times per screen: Register Member vs red head marker/HEAD chip; red selected states in candidate picker and transfer modal. Fix: neutral head chip; selected = neutral-100 + ink ring; red only on Register Member, Save Family, Apply Filters. Command: quieter.
- [P1] Forms and secondary screens off-language: native rounded-md 44px selects, Connections h-10 rounded-md and bare error, transfer modal pill inputs and non-brand primary (source only), placeholder 2.6:1 via shared Input. Fix: shared 8px field/select, fix placeholder token, shared error state, unsaved-changes guard. Command: polish, harden.
- [P2] Directory lacks sort; household/head cells truncate without title; toolbar scrolls away after Show more (20 per click); skeleton/empty heights differ from populated frame. Fix: sortable headers with aria-sort, titles, reachable toolbar, consistent frame. Command: harden, adapt.
- [P2] Unavailable-action reasons and the add-connection path are hidden (Transfer reason title-only; no add-connection link on a tree without links). Fix: visible reason text; "Add connections" link. Command: clarify.

## Persona Red Flags
Alex: no sort or shortcuts; extra click per 20 rows; transfer is eight steps; tree needs mouse drag.
Sam: Transfer reason title-only; colour-only errors; Members List header row aria-hidden; tree edge 2.8:1; placeholder 2.6:1.
Jordan: lone red-outlined box and "Drag to move around"; no explanation of connections; Add Family vs register-patient order unclear.

## Minor Observations
Scrollbar layout shift on tab switch (scrollbar-gutter: stable). Subtitle and count line repeat "in your BHC". Greyed facility selector hint wraps the topbar and reads like an error. H1 computes to 600 not 700 (global override). Text links are 20px tall (<24px). Tree labels at 10px shrink with zoom.

## Questions to Consider
1. Why is the first view of a household the one that shows the least? Members List default?
2. Where can anyone see related families in this module?
3. Could Families prove one-red-per-screen with navy ink alone?
