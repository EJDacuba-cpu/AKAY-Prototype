---
target: Doctor Availability
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\rhu\\DoctorSchedule.jsx"
target_fingerprint: "sha256:d9f58da55b5e5669f7f54f3a2b4152b4c935bc22ed1a462cc6b097d967e7a67e"
target_path: "D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\rhu\\DoctorSchedule.jsx"
timestamp: 2026-10-22T14-10-40Z
slug: frontend-src-pages-rhu-doctorschedule-jsx
---
Method: dual-agent (A: design-review sub-agent, B: detector and browser sub-agent)

# Critique: Doctor Availability (/rhu/doctor-availability)

Files: frontend/src/pages/rhu/DoctorSchedule.jsx, frontend/src/components/features/rhu/DoctorUnavailabilityCalendar.jsx, frontend/src/components/features/rhu/DoctorUnavailabilityModal.jsx (uncommitted work in progress).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Referral submissions blocked" is an 11px chip; load-time flash of "0 of 0 available" plus blocked; 2.2s saved notice |
| 2 | Match System / Real World | 3 | "Official account"/"Official" jargon; raw ISO date in modal subtitle |
| 3 | User Control and Freedom | 2 | Remove is immediate, no confirm/undo; switching doctors discards unsaved edits |
| 4 | Consistency and Standards | 2 | Ink modal primary vs red page primary; selected card red; custom tablist without tabpanel/arrow keys |
| 5 | Error Prevention | 2 | No overlap/inverted-range check; no consequence preview for Unavailable |
| 6 | Recognition Rather Than Recall | 3 | Calendar chips lack doctor name and legend |
| 7 | Flexibility and Efficiency | 2 | Status flip takes 4 steps; week of leave takes 5+ modal trips; no range select |
| 8 | Aesthetic and Minimalist Design | 2 | Policy copy repeated 4 times; "Official" chip on every card |
| 9 | Error Recovery | 3 | Mapped server errors and retry; no inline reason when Save disabled |
| 10 | Help and Documentation | 2 | Key rule buried in header and a conditional line; no calendar legend |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict

LLM assessment: category-interchangeable with a few authored moments. Domain copy and the internal/BHC notes split are authored; the card grid, side form and month calendar are stock; the BHC-RHU boundary, the product's signature, is absent from the page.

Deterministic scan: static CLI 0 findings on all four targets. Live detector: 26 findings (2 tiny-text, 15 undersized-ui-text, 5 low-contrast, 4 nested-cards). Most undersized-ui-text hits are 10px uppercase labels and weekday headers that DESIGN.md allows (false positives against this system). Real: two 9px count badges (DoctorSchedule.jsx:591, Calendar:126), contrast 2.4-2.6:1 on date button/label, textarea placeholders, overflow-day numbers (mostly from shared components), two nested bordered boxes in the form section.

## Overall Impression

Good domain thinking, wrong emphasis. The page's one job is "can BHC refer today, and why?", and that answer is the smallest element and flashes "blocked" while loading.

## What's Working

1. Honest domain copy and visible authority split (audience-labelled notes, view-only panel).
2. Safe-by-default semantics: expected return is informational, referrals stay blocked until Available is confirmed.
3. Solid states and accessibility basics: loading/error/empty/no-match/read-only, buttons with aria-pressed and focus rings, tokens used, no unnamed controls, no targets under 24px.

## Priority Issues

[P1] The blocking state is the point of the page and it is the weakest element. Fix: single status line rendered only after load; "Blocked by absence" / "Absence ended, confirm Available" stamp on cards; calendar legend. Command: /impeccable clarify

[P1] Daily path is too long and the calendar sits below the fold (1366x768). Fix: quick toggle pill on cards; calendar beside form or in a tab with doctor name; range select; sticky Save. Command: /impeccable layout

[P1] Consequential actions have no safety net (immediate Remove, discarded edits, no overlap check, 2.2s toast). Fix: ConfirmationModal for Remove, unsaved-changes prompt, inline overlap/inverted-range rejection, persistent aria-live confirmation. Command: /impeccable harden

[P2] Drift from DESIGN.md: card grid vs fixed-frame 56px table, red selected card, ink modal primary, 9px badges, nested boxes, custom PillTrack, bare loading text. Fix: 56px-row roster table, ink/sunk selection, brand-red modal primary, 10px minimum, flatten boxes. Command: /impeccable polish

[P2] Contrast and calendar accessibility: 2.4-2.6:1 gray text (shared DatePickerField/textarea), ISO-labelled day cells that don't announce absences, 42 tab stops, color-only meaning, non-live notice, placeholder-only labels. Fix: AA token for gray text, roving-tabindex grid, long-date labels with absences, role="status", label association. Command: /impeccable harden

## Persona Red Flags

Alex (power user): no quick toggle (4 steps), no multi-day/recurring absence, one doctor at a time, no "updated by".

Sam (keyboard/screen reader): 42 ISO-labelled tab stops with absences unannounced, tablist pattern incomplete, notice not live, "Remove" unnamed, color-only mobile dots.

RHU staff marking a doctor unavailable while BHC referrals depend on it: no pending-referral count, no BHC-view preview, no reminder to confirm Available after an absence ends, internal text can be pasted into BHC-visible notes with only one hint line as a guard.

## Minor Observations

Raw ISO date in modal subtitle; "Official account" repeats "Official doctor"; calendar always renders 6 weeks; selectedDate not reset on doctor change; save-notice setTimeout not cleaned up; add a "last checked" indicator for the 30s poll.

## Questions to Consider

1. If the page's one job is "can BHC refer today?", why does the first view lead with policy text and a roster?
2. Is a card grid right for 3-12 doctors, or is a dense table with a "Next absence" column and inline toggle closer to AKAY's promise?
3. Should absences be a calendar at all, or an "Upcoming absences" list with an Add button?

Coverage gaps: no valid 390px capture (viewport did not resize); dev data has one doctor with no absences; no keyboard-only or read-only-role pass.
