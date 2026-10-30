# Clinic Ledger medicine details

Design authority: Eric's supplied approved UI/UX brief. Preserve the existing Clinic Ledger world in PRODUCT.md / DESIGN.md and the existing stock workflows. This is a frontend navigation/presentation change.

## Approach

Use one shared inventory surface and one shared full-page Medicine Details surface with BHC/RHU route adapters. Reuse the shared medicine form, stock operation endpoints, permission checks and transaction query. Separate facility pages with copied markup would retain the current drift; retaining Details and History modals would conflict with the requested full-page workflow.

- Medicine names link to `/bhc/medicine-availability/:medicineId` or `/rhu/medicine-management/:medicineId`.
- Exactly five row actions: View Details, Restock, Deduct Stock, Quarantine Stock, Inventory History. Viewing remains available to inventory viewers; stock writes require inventory.manage.
- History navigates to `#history` on Details (implementer default, optional clarification pending). No second history interface.
- Details: back navigation, medicine name and identifiers, Edit Details/Restock/Deduct Stock, stock summary, medicine metadata, FEFO-sorted group table, one paginated Inventory History section. Small screens use compact stacked records; wide screens use ledger tables.
- Group-specific Quarantine, Release and Dispose reuse one focused stock form. Deduct/quarantine select the group and show the affected stock pool, quantity, reason and explicit confirmation. Release rejects expired groups and Dispose targets quarantined stock through existing APIs.
- List quantity shows a second available-stock line only when recorded and available differ. Details retains the complete summary. Staff wording uses Available for Dispensing / Ready to Dispense rather than Eligible.
- Remove/archive appears only in a permission-restricted management area on Details, with existing confirmation and backend retention safeguards. No destructive row action.
- Add and Edit retain existing shared form behavior, including editable opening stock and read-only recorded stock during edit. No nested dialogs, new calculations, endpoints, permissions or migrations.
- TanStack Query keys include user/facility and current calendar date. Stock commits invalidate list, details and history. Direct URLs fetch scoped details and handle forbidden/not-found/loading/retry safely.

## Validation

Behavior tests cover both route bases, exact action set, permissions, conditional quantity breakdown, FEFO including expired and Not Applicable groups, group-action eligibility, form validation, history allocations/shortage and readonly metadata. Reuse the existing Node/Vite SSR and real request tests. Run focused medicine/navigation tests, changed-file lint and production build. Attempt browser verification if an enabled browser exists; report the actual limit if unavailable.
