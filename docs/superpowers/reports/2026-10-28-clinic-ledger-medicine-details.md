# Clinic Ledger Health Commodities redesign

## Implemented

- Shared Clinic Ledger inventory for BHC and RHU; the old duplicate pages are route adapters.
- Medicine names link directly to dedicated facility Details routes. Removed expandable rows, Details modal and History modal.
- Exactly five row actions: View Details, Restock, Deduct Stock, Quarantine Stock, Inventory History. Write actions require inventory.manage; View Details and History remain available to inventory viewers.
- History links to Details `#history`, scrolls/focuses the section once per navigation, and keeps pagination inline. This was the stated implementer default after an optional clarification opportunity.
- Dedicated responsive Details content includes metadata, complete stock summary, all expiry groups in FEFO order, history and restricted item management.
- Staff wording uses Available for Dispensing / Ready to Dispense. List quantity breakdown is shown only when recorded and available differ.
- One focused shared form handles Restock, Deduct, Quarantine, Release and Dispose through existing APIs. Group/pool availability, required reason, expiry rules, positive whole quantity, confirmation, failed-entry preservation and stable operation keys remain protected.
- Group-specific actions preselect the physical group. Expired stock may be deducted/quarantined; expired quarantined stock cannot be released.
- Edit remains metadata-only with read-only Recorded Stock. Remove/archive is restricted to the Details management section and uses existing confirmation/backend safeguards.
- Query identities include current facility/user. Calendar placeholders retain data only for identical ownership/medicine scope, allowing midnight refetch without unmounting an open stock form. Metadata edit uses the snapshot captured when opened, so refetch does not overwrite typed entries.
- No backend, migration, inventory-calculation or API changes.

## Checks and exact limitations

- Medicine tests: **56 passed**, including the final review changes.
- Breadcrumb tests: **13 passed**.
- Changed-file ESLint: **passed**, including the final review changes and both route adapters.
- Production build: **passed**, with the existing large-chunk warning (main JavaScript bundle approximately 2.77 MB / 790 kB gzip).
- `git diff --check`: **passed**; Git reported only line-ending notices.
- New tests cover both route bases, exact row actions, view-only permissions, conditional quantity breakdown, FEFO order, group eligibility, focused form validation and confirmation, inline history and breadcrumb navigation.
- Fresh read-only review identified the midnight query/form lifecycle issue. It was fixed using scope-checked placeholder data and dialogs outside page loading wrappers. A new regression test covers same-scope calendar retention and rejection across user/facility/medicine boundaries.
- The review also alleged missing nested allocation groups. Inspection showed existing `MedicineInventoryTransaction::allocations()` already calls `with('expiryGroup')`, so missing eager loading was not established. A frontend group-ID lookup/fallback was still added for ID-only history responses, and its test now requires both actor and actual expiry text rather than an either/or assertion.

**The disk-space blocker is resolved.** After Eric freed capacity, the medicine suite, breadcrumb suite, changed-file ESLint and production build were rerun successfully against the final review changes. No backend files or migrations were changed, and no migration or deployment was run.

Browser verification is incomplete. CUA reported no enabled apps or browsers. A bounded local headless Edge attempt with synthetic component fixtures produced no screenshots. Temporary preview artifacts are confined to `backend/storage/logs/ledger-preview/`; no user browser profile was used.

## Reproduce automated verification

From `frontend`, run:

```powershell
npm.cmd run test:medicine
node --test src/utils/breadcrumbs.test.js
node node_modules/eslint/bin/eslint.js src/components/features/medicine/MedicineInventoryPage.jsx src/components/features/medicine/MedicineInventoryTable.jsx src/components/features/medicine/MedicineInventoryFilters.jsx src/components/features/medicine/MedicineInventoryHistory.jsx src/components/features/medicine/MedicineInventoryActionModal.jsx src/components/features/medicine/MedicineActionDialog.jsx src/pages/shared/MedicineDetailsPage.jsx src/utils/medicineLedger.js src/utils/medicineLedger.test.js src/components/features/medicine/MedicineLedger.test.js src/utils/breadcrumbs.js src/utils/breadcrumbs.test.js src/App.jsx
npm.cmd run build
```

Remaining manual verification: both inventory routes and direct Details links on desktop/mobile, opening each focused stock form, required/overdraw/expiry validation, group preselection, permission restrictions, cache refresh and history pagination/anchor navigation against an authenticated development session. Automated component coverage uses server rendering; it does not establish browser interaction or visual layout correctness.
