Implementation completed on `Eric-Manually-Fixer` for both requests.

**Prescription form and drafts**

- Medicine name, strength, and dose remain manual text fields. Names are trimmed; strength and dose require an amount and a unit without calculating or recommending doses.
- Route, frequency, duration unit, and dispensing unit use the requested options plus Other (Specify). Custom text appears below its dropdown. Switching to a standard option clears the unused custom text. Explicit Other selections stay open while typing and survive recovery.
- Duration uses a positive numeric value and a unit, serialized to the existing duration string. Safe legacy strings such as `2 weeks` restore into the controls. Ambiguous text such as `until review` remains visible and must be clarified before completion.
- Instructions are labeled Additional Instructions and remain optional multiline text, including PRN instructions. Quantity to Dispense and Dispensing Unit retain the existing authorizedQuantity/authorizedUnit API keys. Positive decimals are supported; known countable units require whole numbers.
- The open editor is now owned by the consultation workspace and included in the existing draft payload. Incomplete fields, custom selections, duration parts, and an existing prescription being edited survive recovery. Validation messages are not persisted. The existing autosave, encrypted local recovery, conflict handling, and leave-save mechanisms are reused.
- Existing prescription lists, IDs, ordering, and legacy free-text values remain usable. No draft or historical order is deleted. New draft metadata is optional. Saved orders contain only the existing effective clinical fields; editor metadata does not reach inventory.
- An open editor must be saved or cancelled before consultation completion. Starting another editor cannot silently discard its contents. Saving an edit merges by ID into the latest list.
- To Dispense continues to use finalized health-record prescriptions. Doctor-entered medicine names, inventory selection, actual release quantities, stock deduction, and permissions are unchanged. Decimal authorized quantities now survive backend persistence and display summaries.
- Existing prescription display/print text continues to use effective clinical fields, including decimal quantities. No new Print Prescription feature or automatic signature was added.

**Doctor PRC License No.**

- The Doctor-only text input appears directly below Specialization in account creation and profile editing, using the existing Field/Input error styling. It also appears in Review and account details.
- Continue (the existing Next button), the review-step shortcut, and final submission validate the field. Empty and whitespace-only values show `PRC License No. is required for Doctor accounts.` immediately beneath the input. Valid entry clears the error, and Back/Continue preserves it.
- Validation requires a trimmed string of at most 255 characters, matching the storage limit. No unsupported digit count or official PRC format is assumed, and accepting the value does not authenticate a license. Laravel rejects missing, blank, non-string, and overlong values on doctor creation, including direct API attempts.
- Authorized admin profile updates require a recorded license. An omitted field preserves an existing valid license; explicit clearing is rejected. Legacy doctors remain readable and usable until their profile is updated. Status-only administrative operations remain available. Nurse and RHU Staff creation do not require the field and reject supplied doctor license data.
- The existing user record is the source of doctor identity, alongside name and specialization. `users.prc_license_number` is a nullable string; leading zeros are preserved, and the existing authorized account API returns the value with the correct user ID. No duplicate roster identity storage, invitation changes, or permission changes were introduced.
- Migration: `backend/database/migrations/2026_11_17_000001_add_prc_license_number_to_users_table.php`. It adds one nullable column without backfilling or removing existing records. Applied only in the automated test database; deploy the migration before serving the updated application.

**Verification**

- 85 targeted frontend tests passed across prescription utilities, care-plan DOM interactions, workspace integration checks, dispensing UI checks, account validation, and account-form DOM interactions.
- 85 targeted Laravel tests passed (547 assertions), covering draft payload recovery, prescription authority and finalization, decimal display, To Dispense, doctor account validation/editing, account invitations, and roster synchronization.
- After the final custom-selection fix, all 26 affected frontend tests and all 21 draft-payload tests passed again. After the strength/dose Unicode validation refinement, all 14 prescription authority tests passed again.
- Targeted ESLint checks passed. The final Vite production build passed; it reports the existing large-chunk warning.
- No live Supabase/PostgreSQL deployment, real mailbox invitation delivery, real browser refresh/network-conflict session, physical stock release, or physical printout was performed. DOM, serializer, request, and database tests cover the relevant boundaries; a deployed end-to-end smoke test is still needed.

**Modified and added files**

- `backend/app/Http/Requests/HealthRecordRequest.php`
- `backend/app/Http/Requests/UserRequest.php`
- `backend/app/Models/HealthRecord.php`
- `backend/app/Models/User.php`
- `backend/app/Services/HealthRecordDraftPayloadService.php`
- `backend/app/Services/PrescriptionClinicalAuthority.php`
- `backend/tests/Feature/RhuDoctorRosterTest.php`
- `backend/tests/Feature/StaffRoleAccountTest.php`
- `backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php`
- `backend/tests/Unit/Services/PrescriptionClinicalAuthorityTest.php`
- `frontend/src/components/features/accounts/AccountDetailsModal.jsx`
- `frontend/src/components/features/accounts/EditAccountModal.jsx`
- `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx`
- `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js`
- `frontend/src/components/features/health-records/wizard/RhuPrescriptionsSection.jsx`
- `frontend/src/pages/admin/AddUser.jsx`
- `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- `frontend/src/utils/accountForm.js`
- `frontend/src/utils/accountForm.test.js`
- `frontend/src/utils/rhuPrescriptions.js`
- `frontend/src/utils/rhuPrescriptions.test.js`
- `backend/database/migrations/2026_11_17_000001_add_prc_license_number_to_users_table.php`
- `frontend/src/pages/admin/DoctorLicenseForm.test.js`
- `frontend/src/utils/prescriptionFields.js`
- `frontend/src/utils/prescriptionFields.test.js`
- `docs/2026-11-17-prescription-and-doctor-license-changes.md` (this report)
