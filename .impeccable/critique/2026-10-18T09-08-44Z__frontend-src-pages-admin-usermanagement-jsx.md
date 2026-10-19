---
target: Account Directory
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\admin\\UserManagement.jsx"
target_fingerprint: "sha256:76eb934ed8f6ae31780232d7272828a56cc62f87bda54df998079e8c744b86a4"
target_path: "D:\\Projects\\AKAY-Prototype\\frontend\\src\\pages\\admin\\UserManagement.jsx"
timestamp: 2026-10-18T09-08-44Z
slug: frontend-src-pages-admin-usermanagement-jsx
---
# Critique: Account Directory (/admin/users), re-run

Method: dual-agent (A: design-review agent, B: detector/browser agent), both isolated and read-only.

## Design Health Score: 24/40 (all 10 heuristics applicable), Acceptable

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Count line, aria-live, "Updating accounts" are good; status is only Active/Inactive |
| 2 | Match with real world | 2 | "Role" switch filters account type but the Role column shows staff role; MHO is "Municipality-wide" in the table and "No facility" in the filter |
| 3 | User control and freedom | 3 | Cancel, chip removal and Clear filters work; View details has no Edit |
| 4 | Consistency and standards | 2 | Hand-rolled row menu; every modal has a brand-red header |
| 5 | Error prevention | 2 | Deactivate confirmation opens with focus on "Deactivate account" |
| 6 | Recognition rather than recall | 2 | Two pill switches both start with "All", no visible labels |
| 7 | Flexibility and efficiency | 2 | No sort, no URL filters, no row click, two clicks per action |
| 8 | Aesthetic and minimalist design | 3 | Calm and on-direction; red modals, heavy card for two selects |
| 9 | Error recovery | 3 | Failed status change keeps the dialog open with the server message |
| 10 | Help and documentation | 2 | No page description; Edit modal does not say where role and facility change |

## Design Specificity Verdict
Mostly interchangeable: search, two pill switches, navy CTA, name-over-email table, status chip and a row menu fit any SaaS admin. Only the copy is authored for AKAY ("Municipality-wide", "Also covers ...", the deactivate sentence). Facility is the authority axis but sits under More filters while account type has a top-level switch.

Deterministic scan: CLI clean on 9 files ([]). Browser: nested-cards x1, a false positive (table card inside the app shell frame). The earlier low-contrast x2 and undersized-text x5 are gone from the page; modals were closed during the scan.

## Priority Issues
- [P1] Destructive confirmation defaults focus to the destructive button (ModalShell.jsx:67 focuses [data-modal-primary]; ConfirmationModal passes primary on confirm, no initialFocusRef). Activate also gets danger styling (warning icon, red header, red button). Fix: add tone (danger/neutral) and Cancel as initial focus for danger; plain header, navy primary and no warning icon for Activate; mention "Also covers N BHCs" in the deactivate copy. Command: harden.
- [P1] Filter vocabulary contradicts the table: Role switch = account type, Position = staff role (hidden), MHO is "No facility" in the filter and "Municipality-wide" in the table. Fix: label the switch "Type", rename Position to Role, make Facility visible, map the MHO consistently. Command: clarify.
- [P2] Red in every modal launched from this screen (shared ModalShell: red header and red primary). Violates red-for-danger-only; shared component, app-wide. Command: quieter.
- [P2] Toolbar is a generic unlabeled pill row; More filters is a full-width card for two selects. Fix: visible micro-labels, inline or popover extra filters. Command: layout.
- [P2] Remaining a11y and polish: 10px ACCOUNT eyebrow in Account details at ~2.6:1 (AccountDetailsModal.jsx:50); truncated text reveals full value only on mouse hover (FixedTable.jsx:24); single-page pagination shows a washed-out "1" and raw hex (TablePagination.jsx). Command: harden, then polish.
Not carried forward: invite/password state and links to Password & Invites in the directory (declined by the owner).

## Persona Red Flags
- Alex: no sortable headers, no URL filters, no row click, no bulk deactivate; Account details has no Edit.
- Sam: focus lands on "Deactivate account"; truncated cells readable by mouse hover only; switches lack visible labels.
- MHO: cannot filter by facility without More filters; "Role" switch does not filter roles; deactivate dialog names only the home facility.

## Minor Observations
Column widths shift in the filtered-empty state; filtered-empty copy mentions status and role even when only search is set; two Clear filters controls visible at once; large blank frame with two rows; "Add user account" is a third noun beside "Users" and "Account Directory" (naming is an open owner question). Not verified: tablet/phone, Inactive row and Activate dialog, long strings, rows with extra BHC assignments.

## Questions
1. If facility is the authority axis, should the directory be a roster grouped by facility instead of a flat table filtered by account type?
2. Is a paginated 10-row table the right shape for dozens of staff?
3. Should clicking a row open its details?
