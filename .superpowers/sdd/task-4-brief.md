### Task 4: Backend validation + physician authority

**Files:**
- Create: `backend/app/Services/PrescriptionClinicalAuthority.php`
- Create: `backend/tests/Unit/Services/PrescriptionClinicalAuthorityTest.php`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php`
- Modify: finalize path that persists `monitoring_data` (draft finalize / store — same places `prescriptionText` is accepted today)

**Interfaces:**
- `PrescriptionClinicalAuthority::canAuthorize(?User): bool` — RHU + `staff_role === 'doctor'` + `conditions.confirm`
- `ensureCanAuthorize(User)`
- `attestation(User, array $prescriptions): array` with hash over ordered clinical fields
- Request rules for `monitoring_data.prescriptions.*` matching the spec contract
- When prescriptions non-empty on RHU ITR finalize: require authority; attach attestation; reject non-physician finalizers

- [ ] **Step 1: Write PHPUnit tests** — doctor with `conditions.confirm` OK; nurse/finalize-only rejected; empty prescriptions still allow existing finalize rules; invalid diagnosisIds rejected; authorizedQuantity without unit rejected.

- [ ] **Step 2: Run — expect FAIL**

Run: `php artisan test --filter=PrescriptionClinicalAuthorityTest`

- [ ] **Step 3: Implement authority + request/draft rules**; hook authorize into RHU ITR finalize/store validation (alongside existing TB authority patterns, without weakening them).

- [ ] **Step 4: Run focused HealthRecord draft/finalize tests plus new tests — expect PASS for touched filters. Fix regressions without discarding uncommitted TB fixes.

- [ ] **Step 5: Do not commit**

---

