---
target: Medicine Availability module
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\bhc\\MedicineAvailability.jsx"
target_fingerprint: "sha256:c9b96ec1b024096f2d1a7187c9601a0eca9af461fe7c871486d81ec8d7e29082"
target_path: "D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\bhc\\MedicineAvailability.jsx"
timestamp: 2026-10-20T13-50-55Z
slug: frontend-src-pages-bhc-medicineavailability-jsx
---
Method: dual-agent (A: bd236de3-53e6-4aaa-a3ac-f07c476673ec · B: 4af8e910-a21f-44dd-a956-f3ed0308a938)

# Critique: Medicine Availability

Target: `frontend/src/pages/bhc/MedicineAvailability.jsx` (BHC route `/bhc/medicine-availability`, plus `MedicineFormModal`, `MedicineInventoryActionModal`, `MedicineInventoryHistoryModal`).

Mode: Operate. All 10 heuristics scored. Live module was not reached: Assessment A landed on Login; Assessment B’s session is RHU and hit Unauthorized. Findings below are from source plus those gated screens. Detector overlay ran on Unauthorized, not on this module.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Quantity-only Status; expiry never stamped on the row; mutations close with no in-page success |
| 2 | Match System / Real World | 2 | Adjustment In/Out, Correction, Reconcile Physical Count are warehouse jargon; Available can still mean expired |
| 3 | User Control and Freedom | 3 | Modal Cancel/Escape and filter clear exist; overflow Actions has no Escape; no undo after Delete or Apply Adjustment |
| 4 | Consistency and Standards | 2 | Local kebab vs shared ActionMenu; window.confirm vs ConfirmationModal; segmented pill tabs vs DESIGN.md underline tabs |
| 5 | Error Prevention | 2 | Restock/Adjust require a reason; Delete is a native confirm; blank name fails silently; missing expiry maps to Valid |
| 6 | Recognition Rather Than Recall | 2 | Desktop search collapses to a 40px icon; Restock / Adjust / History live in a 5-item kebab |
| 7 | Flexibility and Efficiency | 2 | No shortcuts, no bulk restock, no resulting-qty preview; one-row kebab workflow |
| 8 | Aesthetic and Minimalist Design | 2 | Four chrome bands; category rainbow competes with stock; red modal chrome on every dialog |
| 9 | Error Recovery | 2 | Page retry is solid; Add/Edit/Delete have no catch; empty copy does not distinguish no stock vs no match |
| 10 | Help and Documentation | 1 | Edit subtitle is the only teaching; six Adjust actions have no help; empty state does not point at Add Medicine |
| **Total** | | **20/40** | **Acceptable** |

## Design Specificity Verdict

**Start here.** This is a category-interchangeable inventory grid — search, filters, a 9-column table, a kebab — with BHC/RHU labels bolted on. It does not yet behave like a Bulakan clinic availability board whose job is “can this be given now?”

**LLM assessment:** The one product-true idea is the write boundary: BHC Inventory vs RHU Availability (view-only), Add Medicine gated by `RestrictedArea`, Edit that cannot change quantity, Restock/Adjust that require a reason, History with Before/Change/After. Around that sits a generic SaaS table. The incumbent contract is still Clinic Ledger (square sheets, Register Red only for action/active/danger, Public Sans + IBM Plex Mono, 44/56 rows). The shipped page has already drifted: `rounded-lg`/`xl`, hardcoded `#0F172A` / `#F1F5F9` / `#B91C1C` / `#E8ECF0`, `slate-*` chips, segmented pill tabs with `shadow-sm`. That drift is real and is not automatically an improvement; the module currently looks like Linear inventory, not a clinic ledger, and also not a finished Healthie/Elation surface.

**Deterministic scan:** `impeccable detect --json` on the page and on `frontend/src/components/features/medicine` both exited 0 with `[]`. Zero findings, zero rules. The detector did not catch the P1 UX issues (give-ability, hidden restock, native delete confirm) because those are IA, copy, and state — not the visual anti-patterns it scores. No false positives. Extra file scanned in that folder: `DispensedMedicinesSection.jsx` (not this route).

**Visual overlays:** Injection succeeded and the detector ran, but **not on Medicine Availability**. Assessment B opened a new `[Human]` tab (`viewId` 5935a3), mutated title, started live-server on port 8400, injected `http://localhost:8400/detect.js`. The session is RHU and the target route redirected to `/unauthorized`. Console: `[impeccable] No anti-patterns found.` Overlay count 0; no highlight boxes. Live-server was stopped. There is **no reliable user-visible overlay on this module**. Assessment A’s new tab (`viewId` 8f272c) saw only Login.

## Overall Impression

The accounting is more honest than the scan. A midwife cannot tell, in one glance, whether Paracetamol can be given: Status is quantity-only, expiry is a gray date, missing expiry is classified Valid, and Restock is the fifth item in a kebab. The single biggest opportunity is to make the row answer **name, quantity, expiry** — and to put Restock on the row, not behind ⋯.

## What's Working

1. **Honest write boundary.** BHC vs RHU tabs, a View-only badge on RHU, Add Medicine only on BHC and wrapped in `RestrictedArea` so locked staff see a placeholder, not a fake control.
2. **Operate-grade frame.** FixedTable 44px head / 56px rows / 10 per page, `skeleton="medicine"`, RefreshingIndicator, History loading/error/empty. This is a task UI, not a marketing table.
3. **Ledgered stock, not a fake qty field.** Edit subtitle tells staff to use Restock or Adjust; those flows require Reason / Reference; History shows Before / Change / After. That is product-true inventory accounting.

## Priority Issues

### [P1] Row does not answer “can this be given?”
- **What:** `StatusBadge` is quantity-only via `computeMedicineStatus`. `getMedicineExpiryStatus` is used only in the Expiry filter. Missing `expiryDate` returns **Valid**. Quantity is muted `#6B7280`. **Reconciliation Required** is a wrapping line inside a nowrap clipped cell.
- **Why it matters:** The BHW/midwife primary action is give-or-refer. An expired lot stamped Available is a clinical miss. “Record, don’t decide” still requires the record to be true.
- **Fix:** Make qty + expiry the two stamps on the row. Drive Status from quantity **and** expiry. Never map empty expiry to Valid. Keep Reconciliation Required fully visible as its own chip.
- **Suggested command:** `/impeccable colorize`

### [P1] Finding and moving stock is hidden
- **What:** `ModuleToolbar` search collapses to `sm:w-10` until opened. Daily actions Restock, Adjust Stock, and Inventory History sit in a 32×32 kebab with five items, no `aria-expanded`, no Escape, no `role="menu"`.
- **Why it matters:** Alex cannot complete the core loop in one glance. Jordan will open Edit Medicine, see Current Stock, and not understand why quantity cannot change.
- **Fix:** Keep search expanded on desktop. Surface Restock as a labeled row action on BHC rows; keep Adjust / History / Delete in the overflow (≤4). 40px+ hit target. Keyboard menu (Escape, arrows).
- **Suggested command:** `/impeccable layout`

### [P1] High-stakes mutations are under-reassured
- **What:** Delete uses `window.confirm(\`Delete ${item.name} from BHC inventory?\`)` and `handleDelete` has no `.catch`. Add/Edit `handleSubmit` has no try/catch; blank name fails silently. Restock/Adjust show current qty, not resulting qty. No success confirmation on this page.
- **Why it matters:** Accidental delete of Paracetamol is irreversible in the UI. A failed delete looks like success.
- **Fix:** Use `ConfirmationModal` with name + Item ID + “This cannot be undone.” Preview `12 → 19 bottles` before Add Stock / Apply Adjustment. Inline error on blank name. Catch API failures and keep the modal open. Confirm success in-page.
- **Suggested command:** `/impeccable harden`

### [P2] Visual-world collision
- **What:** Segmented tabs (`rounded-lg bg-[#F1F5F9]`, active white + `shadow-sm`), card `rounded-xl border-[#E8ECF0]`, Add Medicine `rounded-lg bg-[#B91C1C]`, CategoryBadge in slate/violet/rose/emerald, ModalShell red header on every dialog. DESIGN.md wants square underline tabs, Register Red `#dc2626` fill, pills only for status, no slate, no new hex, Flat-At-Rest.
- **Why it matters:** The module already looks like a different product than the committed ledger, and also unlike a finished clinical SaaS surface. Category color is decoration, not clinical signal.
- **Fix:** Either fully ledger this surface, or explicitly replace DESIGN.md. Do not keep hex + slate + rounded + red modal chrome as an accidental hybrid.
- **Suggested command:** `/impeccable quieter` (if keeping Clinic Ledger) or `/impeccable document` (if the SaaS world is now the contract)

### [P2] Adjust Stock and empty copy teach the wrong job
- **What:** Adjust Stock dumps six ledger verbs in one select (Adjustment In, Adjustment Out, Damaged Disposal, Expired Disposal, Correction, Reconcile Physical Count) with no resulting-qty math. Empty copy is always “No medicines yet. / Try adjusting your search or filters.” even when the list is truly empty.
- **Why it matters:** Jordan will not know Adjustment Out vs Expired Disposal vs Correction. Empty copy blames the user for filters they did not set.
- **Fix:** Collapse Adjust into three intents (Add, Remove, Set counted amount) with disposal/reason as a second step. Preview the resulting quantity. Empty: Add Medicine CTA when unfiltered; “No matches” + clear chips when filtered.
- **Suggested command:** `/impeccable distill`

## Persona Red Flags

**Alex (Power User):** Search is an icon at `sm:w-10`; first click is wasted. No bulk restock, no shortcut, kebab is five serial clicks per SKU. Actions is 32×32, closes on scroll, no Escape. Last Updated long-form and Notes steal scan columns.

**Sam (Accessibility-Dependent):** Kebab is a button that portals more buttons — not a menu, no `aria-expanded`, no arrow keys, no Escape. 32×32 vs 44px target. Status meaning is color + 10px uppercase; expiry risk is not in the accessible name. Compact Locked control exposes the full restriction only as `sr-only`. Native `window.confirm` drops out of the app’s focus trap. `#9CA3AF` labels and `text-[9px]` tab badges are contrast/size risks.

**Jordan (First-Timer BHW):** Does not know to open the kebab to restock; will hit Edit and fail to change quantity. BHC vs RHU sits *below* search; View-only is a 9px badge, not a sentence about referring. Adjust Action labels do not match barangay language. Empty state tells them to change filters instead of Add Medicine. Delete pops a browser dialog that looks like a crash.

## Cognitive Load

6 of 8 checklist items fail (high): single focus, chunking, visual hierarchy, one thing at a time, minimal choices, working memory. Grouping and progressive disclosure pass.

Decision points with >4 visible options: row Actions (5), Adjust Action select (6), Category filter (7), populated row scan (8–9 cells).

## Emotional Journey

The peak should be spotting the medicine and knowing whether it can be given. The valley is collapsed search, a kebab of near-synonyms, Available on an expired lot, and a `#B91C1C` header on every modal (alarm for routine Restock, then numb for real danger). The end is a silent close: no success toast, Delete fire-and-forget. High-stakes reassurance is weak.

## Minor Observations

- Table `min-w-[1120px]` + 9 columns: mobile is horizontal-scroll only.
- Low Stock count on the BHC tab has no expired-count twin.
- Card header restates the layout title.
- Form Computed Status / Current Stock rendered in `#B91C1C` even when Available — red used as chrome.
- History table `min-w-[1020px]`, 8 columns; empty history has no “Restock to create the first movement” cue.
- `PageStateWrapper hasData={safeMedicineItems.length > 0}` means a BHC-empty / RHU-populated dataset never shows the page-level empty.
- Filter chips omit search.
- Status chips are `rounded-md`, not DESIGN.md pills with a leading dot.
- Item ID uses `font-mono` but the mono stack is Inter, not IBM Plex Mono.

## Questions to Consider

- If the row could only show three facts, would they be Name, Quantity, Expiry — and would Status then be derived, not a fourth competing badge?
- Why is Restock (daily) equal in the kebab to Delete (rare)?
- Should BHC vs RHU be the first control on the page, before search, because they are different jobs (manage vs refer)?
- Is this a warehouse ledger or a clinic availability board? The UI currently pretends to be both and teaches neither.
- If DESIGN.md is still Clinic Ledger, why does this module already speak Inter, 12px cards, and `#0F172A`?
