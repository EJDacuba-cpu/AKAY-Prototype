---
target: Account Directory
total_score: 14
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\admin\\UserManagement.jsx"
target_fingerprint: "sha256:69455aa2155c83a83638ff4de0ec44369ef3ef257eb36dea29b1bb415435db83"
target_path: "D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\admin\\UserManagement.jsx"
timestamp: 2026-10-18T08-37-44Z
slug: frontend-src-pages-admin-usermanagement-jsx
---
# Critique: Account Directory (/admin/users)

Method: dual-agent (A: design-review agent, B: detector/browser agent), both isolated and read-only.

## Design Health Score: 14/40 (all 10 heuristics applicable), Poor

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No busy/success/error on Deactivate; applied filters vanish when the popover closes |
| 2 | Match with real world | 2 | Nav says "Users", page says "Account Directory"; MHO facility shows "-" |
| 3 | User control and freedom | 1 | Deactivate is one click, no confirm or undo; filtered-empty has no clear action |
| 4 | Consistency and standards | 1 | Diverges from the redesigned Password & Invites (red CTA, slate/hex, hand-rolled menu) |
| 5 | Error prevention | 1 | Deactivate also offered on the MHO row (backend block unverified) |
| 6 | Recognition rather than recall | 1 | Filters are free-text boxes needing exact values |
| 7 | Flexibility and efficiency | 1 | No sorting, bulk, URL filters; search hidden behind an icon |
| 8 | Aesthetic and minimalist design | 2 | Calm, but red CTA dominates; 10px uppercase badges are loud |
| 9 | Error recovery | 1 | updateStatus has no try/catch (UserManagement.jsx:61-68) |
| 10 | Help and documentation | 2 | Nothing explains what deactivation does |

## Design Specificity Verdict
Generic admin template, interchangeable with any SaaS user list. Account role (BHC/RHU/Admin) is not shown, pending invites are not shown, the MHO scope is "-". Only the red is AKAY-specific and it sits in the wrong places.

Deterministic scan: CLI clean on 10 files ([]). Browser run: low-contrast x2 (#9CA3AF on white 2.5:1 at :289 and :304; count pill 4.4:1 at :292), undersized-ui-text x5 (10px count pill, role badges, status badges), nested-cards x1 (false positive: table card inside app shell). Header said 7 anti-patterns, 8 lines listed (unexplained).

## Priority Issues
- [P1] Filters render as free-text inputs: no type "select" in toolbarFilters (UserManagement.jsx:171-196); FilterPopover.jsx:122-125 falls through to InputField. Verified in source, not in browser. Fix: always-visible search + segmented Status/Role, Facility select, active-filter chips. Command: harden.
- [P1] Deactivate/Activate is one click, unconfirmed, no error handling or feedback; no ConfirmationModal in the file; also offered on the MHO row. Fix: ConfirmationModal naming person, role, facility and consequence; busy state; success/error toast; disable on own row. Command: harden.
- [P1] Authority not visible: account role missing, MHO scope "-", extra BHC assignments only in the modal, invite-pending state not shown (API behavior unverified). Fix: two-line access cell (staff role / scope), "Invite pending" status linking to Password & Invites. Command: clarify.
- [P2] Off-direction visuals: red primary CTA, red pagination/Filters/Show Results, red Inactive pill, 10px bold uppercase badges, slate/hex colors, no card shadow, card title repeats page title. Fix: navy-ink primary, neutral Inactive, sentence-case 12px role text, shadow-card and neutral tokens. Command: quieter, then polish.
- [P2] State and accessibility gaps: filtered-empty without clear button (:299-312), no mobile empty state, RefreshingIndicator layout shift, row menu without aria-expanded/role=menu/Escape/focus return, search without aria-label, th without scope. Command: harden (mobile: adapt).

## Persona Red Flags
- Alex: click before typing in search; no sorting or bulk deactivate; filters need open/edit/Show Results and reset on reload; View details takes two clicks.
- Sam: row menu has no ARIA or focus management, 32px targets, unlabeled search, status changes never announced.
- MHO provisioning a midwife: cannot see invite state here, cannot filter "RHU" without typing it, cannot tell which row is their own, Deactivate sits under Edit.

## Minor Observations
Nav "Users" vs page "Account Directory"; Title Case on "Add User Account"; generic popover subtitle; large white void with 2 rows; filter defaults object duplicated 3x (:40-46, :85-91, :97-103). Not verified: popover, row menu, mobile, pagination over 10 rows, long strings, self-deactivation block.

## Questions
1. If the MHO's real question is "is every BHC staffed and can everyone sign in?", why a flat alphabetical list instead of grouping by facility with gaps and stuck invites first?
2. Should Deactivate share a menu with View details and Edit, or live inside the details view with open referrals and patient load shown first?
3. Why two screens to learn whether someone has access yet; should invite/password state live in this table's Status column?
