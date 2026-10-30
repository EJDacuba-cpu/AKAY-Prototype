---
target: Families module
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\bhc\\BhcFamilies.jsx"
target_fingerprint: "sha256:64240e870426b54c980d15132887123c832fb520bcdc969a0e6ec3e850dd3312"
target_path: "D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\bhc\\BhcFamilies.jsx"
timestamp: 2026-10-22T15-07-29Z
slug: frontend-src-pages-bhc-bhcfamilies-jsx
closed: true
---
Method: dual-agent (A: design review ad43f23 · B: detector + browser evidence a4fb0ce)
Note: neither assessment saw the live UI (BHC login unavailable; admin has no Families access). Visual claims are source-inferred; the P0 was verified in button.jsx.

## Design Health Score: 21/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Plain-text loading; paging blanks list and pager |
| 2 | Match System / Real World | 3 | Good domain terms; "Connections" jargon; wrong copy on Related Family route |
| 3 | User Control and Freedom | 2 | No draft guard; 409 forces reload that discards draft |
| 4 | Consistency and Standards | 1 | Pre-redesign shell; nonexistent button variant |
| 5 | Error Prevention | 3 | Strong head-transfer rules and version check; no leave-guard |
| 6 | Recognition Rather Than Recall | 2 | No member column headers; title-only disabled reasons; 24-option selects |
| 7 | Flexibility and Efficiency | 2 | Explicit-submit search; no filter/sort/clear; only footer link opens a household |
| 8 | Aesthetic and Minimalist Design | 2 | Thin uniform cards; oversized tree canvas |
| 9 | Error Recovery | 2 | One generic load error for 404/403/offline; Retry cannot work on 404 |
| 10 | Help and Documentation | 2 | Empty-state copy contradicts the Add Family button |

## Design Specificity Verdict
Authored household/BHC logic in a templated shell. Directory is a generic 3-up card grid (FSN, surname, head, address, red link); no member count, purok grouping or related-family cue. Related families, the product differentiator, are invisible to BHC users. Visual layer ignores Ledger Paper, pill-control rule and the 24px/700 title spec.
Deterministic scan: impeccable detect returned 0 findings (BhcFamilies.jsx, BhcFamilyConnections.jsx, components/features/families). No browser overlay; injection did not run (auth blocked).

## Overall Impression
Careful clinical logic under an unfinished surface. Biggest opportunity: a scannable household ledger that shows related families.

## What's Working
1. Transfer modal review step (current/new table, reassurance bullets, source re-read, distinct 404/409).
2. Household-first model encoded in copy and rules.
3. Real accessibility effort (roving tablist, tree keyboard model, sr-only list, aria-pressed, alert/status).

## Priority Issues
- [P0] variant="outline" does not exist in button.jsx; Search, Previous/Next, Retry, Edit Family, FSN mode toggle, Reload, transfer-modal Back render as plain text. 15 uses in 5 files (8 in BhcFamilies.jsx; others in BhcFamilyConnections, FamilyRegistryField, TransferHouseholdModal, ConditionCardsSection). Fix: map to secondary; make Add Family/Register Member brand. Command: polish.
- [P1] Directory card grid is generic and under-informative. Fix: ledger rows with FSN, head, member count, purok/barangay, related-family chip, whole-row link, toolbar. Command: layout, typeset.
- [P1] Loading/paging/error states weak (list blanks on paging, generic errors, archived dead end). Fix: keep previous data, skeleton frame, distinct 404/offline/archived, clear-search. Command: harden.
- [P2] Tree/details composition: #999 strokes (~2.8:1) and 10px #666 labels (FamilyTreeCanvas.jsx:111-123), head marked by colour only, no add-connection path, no list column headers, title-only disabled reasons. Command: layout, clarify.
- [P2] Form load/recovery: per-member 24-option selects, no leave-guard, 409 discards draft, no error summary, unexplained Add Family vs register-patient order. Command: clarify, adapt.

## Persona Red Flags
- BHW/encoder (weak connection): list blanks on paging, invisible Retry, draft lost on 409, no live search or purok filter.
- Alex: only footer link opens a household; no search-on-type, sort or shortcuts.
- Sam: low-contrast tree strokes and 10px text, colour-only head marker, title-only disabled reasons, no error summary.
- Jordan: unexplained Add Family vs Register Patient order; "Connections" unclear; wrong Related Family copy.

## Minor Observations
bg-white vs Ledger Paper; shell widths jump (max-w-3xl vs 1440); mixed control shapes; missing required marks on address fields; parent-links text has no link; hardcoded ?tab=patient-info.

## Questions to Consider
1. Why a card grid of FSNs instead of a ledger scannable by purok and surname?
2. Should Add Family exist if a family cannot exist without a registered head?
3. If related families are the differentiator, why is no trace visible in Families?

## Browser verification addendum (2026-10-22, signed in as BHC, desktop 1358x588)
Confirmed: variant="outline" buttons render with transparent background and 0 border (Search, Previous, Next, Edit Family). Add Family / Register Member are navy (default), not brand red. Edit Family reads as plain text beside the navy button.
Corrected: h1 computes to 30px / weight 600 (not normal weight). Head node on the tree carries a "Household head" text label, so the head is not marked by colour alone; the red border is a redundant cue.
Observed: tree for a 1-member household is a ~360px canvas holding one square node; Members List rows have no column headers; the header shows "Finish or leave the form before switching" on the edit form (facility-switch guard exists; route-leave guard not verified).
Not inspected: transfer modal, /new form, loading skeleton, error/archived states, tablet and phone widths. Test data has only 1 household, so the card grid at scale was not seen.
