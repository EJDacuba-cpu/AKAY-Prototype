# Consultation workflow revision

Implemented from Eric's September 24–25, 2026 interview decisions. The supplied ITR supports complaint, HPI, vitals, examination, assessment and plans. The Pitpitan transcript supports BHC assessment on referral and immediate RHU attendance after submission. Approval permissions, pending-availability referral state, inventory reconciliation and optional clinical fields are project decisions, not claimed as documented local clinical protocol.

## Responsibility boundaries
- React/shadcn/Tailwind: one encounter, universal consultation fields, optional program forms, read-only review and inline validation.
- TanStack Query: refresh patient, encounter, review queue, referrals and inventory caches after successful writes. It does not authorize actions or calculate stock mutations.
- Laravel: facility/permission enforcement, review edit leases, version checks, finalization validation, encrypted before/after audit, notifications, and atomic encounter/referral orchestration.
- PostgreSQL stored procedure: lock inventory rows, post the dispense ledger exactly once per record, keep displayed stock nonnegative and retain shortages as negative ledger discrepancies. SQLite implements the equivalent path for automated tests.

## Delivery / migration
Run the new 2026_09_25_000001_refine_consultation_workflow migration before running the revised application against a development database. No production or Supabase migration was executed by this code-edit task. The migration adds encrypted audit changes, a reconciliation flag, a ledger discrepancy and updates the PostgreSQL dispense function. Rollback refuses to remove discrepancy audit data after it has been posted.

## Rules
- Chief Complaint required; plain HPI and Physical Examination optional. Recorded vitals are validated; missing routine vitals do not block completion. Existing NCD-specific required readings remain program validation.
- Encoder submits incomplete program/referral details for review; while For Review the encoder is read-only. Authorized reviewers with correction permission can edit directly; Return for Correction requires a note and releases the lease back for encoding.
- Explicit finalization permission allows own-entry finalization. Referral submission additionally requires referrals.submit. Dispensing additionally requires items.dispense. Clinical account presets include dispensing; existing accounts are not retroactively granted permissions.
- BHC Assessment required for follow-up or referral. Follow-up date required at finalization; follow-up time and notes optional. Referral reason required. RHU assigns its practitioner and actual queue order; BHC sends Regular/Priority only.
- No available doctor: encounter finalized; clinical referral intent remains on the encounter and a waiting hold is recorded. No incoming referral or RHU submission is created. Availability notification prompts manual review/submission. The successful submission receives the current referral timestamp.
- Confirmed medicines and vaccine administration are posted in the same finalization transaction. Vaccine inventory mapping and stock-unit quantity are explicit: do not assume one dose equals one vial. Duplicate manual vaccine inventory entries are rejected. Unconfirmed/planned entries do not decrement inventory.
- Shortage does not block finalization: actual given quantity is recorded, displayed stock is clamped at zero, discrepancy is append-only, and Reconciliation Required remains until an authorized physical count.
- Program completion uses existing form-specific rules. The existing prenatal form has no mandatory clinical fields; this change does not invent prenatal clinical requirements without a source.

## Validation scope
Latest local verification: 10 backend regression tests / 53 assertions, 56 consultation frontend tests, production build, targeted ESLint and PHP syntax checks passed. The synthetic browser walkthrough finalized a general consultation with optional HPI/vitals/examination blank and displayed Health Record Saved. The build retains its existing large-bundle warning. PHP auto-formatting could not finish because Pint reported a file-write failure; subsequent backend tests still passed.

The synthetic browser fixture uses only in-memory API responses and synthetic patient data. Backend regression tests use an isolated SQLite database; hosted PostgreSQL execution still requires a development migration/integration check. Legacy authentication fixtures using the old access token ability fail separately and were not changed to weaken authentication.
