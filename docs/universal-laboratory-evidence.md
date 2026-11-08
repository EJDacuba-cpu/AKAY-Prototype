# Universal laboratory evidence

Implemented on `Eric-Manually-Fixer`. No production migrations, commits, pushes, or deployments were performed.

## Clinical workflow

- RHU Physical Examination contains Laboratory & Diagnostic Tests immediately below General Examination Findings. Tests have independent UUIDs, so repeated names are supported. Nothing creates tests from a diagnosis.
- Test name is required at finalization. Collection/examination dates are optional. Requested and Awaiting Result can have no result; Result Available requires a nonblank result. There are up to 50 tests per consultation.
- The existing RHU encrypted clinical draft contains `laboratoryTests` and each diagnosis's evidence selection, pinned result version, attachment IDs, and explicit confirmation. Incomplete tests can autosave. Existing recovery gates, draft versions, ownership/editor leases, and flush-before-leave remain in place. There is no second draft engine.
- Attachments are associated with patient + consultation UUID + test UUID before finalization. Resuming the same draft retrieves the same authorized attachment metadata. Binary files, public URLs, and storage paths never enter the draft payload.
- Finalization creates laboratory rows and binds completed attachments inside the existing clinical transaction. A failed finalization rolls back the records and sharing together. Remaining unused staged files become cleanup candidates.
- The RHU record details panel shows results and an authorized Add Result / Addendum action. `records.correct` and clinical-history access are required at the source RHU. Each addendum requires a reason and the current result version. Original laboratory data and the finalized assessment remain unchanged. Concurrent stale updates return 409.
- Finalized attachment additions/removals/replacements require a reason and are audited immediately. Finalized files remain retained as clinical evidence; removing one withdraws it from the current test view. An already shared version keeps its original file reference until an explicit sharing update.

## Persistence and migration

Migration: `backend/database/migrations/2026_11_08_000001_create_laboratory_evidence_tables.php`.

| Structure | Purpose |
| --- | --- |
| `laboratory_tests` | Immutable initial test data, patient, RHU health record, stable client identity, creator, timestamps |
| `laboratory_addenda` | Append-only revised test data, reason, actor, timestamps |
| `laboratory_attachments` | Private object metadata, patient/consultation/test association, creator, upload/removal/purge lifecycle |
| `monitoring_laboratory_evidence` | References to selected tests, exact addendum versions and attachment IDs, sharing actor/time, withdrawal history |
| `monitoring_handoff_requests.laboratory_evidence_revision` | Optimistic concurrency for explicit sharing updates |

No existing clinical rows are reset, deleted, or destructively converted. Apply the additive migration through the normal deployment process before using the feature. Migration rollback is for an unused installation, not a way to erase recorded clinical evidence.

## Private durable storage

The standard `league/flysystem-aws-s3-v3` adapter is installed and locked. The feature uses the repository's existing S3 disk configuration. No provider or credentials were introduced.

Set `LABORATORY_FILESYSTEM_DISK=s3` only after configuring the existing S3 disk against an administrator-provisioned **private** durable bucket with appropriate credentials, encryption/backup/retention policies, and public access disabled. Existing `AWS_*` environment settings remain the configuration source. An existing differently named private S3-compatible disk can be selected instead.

Local and public disks are refused, including Render's ephemeral local filesystem. Without durable storage configuration, upload endpoints return 503 and the UI explains the blocker; text recording, drafts, addenda, and handoffs remain usable.

Files are PDF, JPEG, or PNG, validated by actual MIME/content and limited to 10 MB each and 10 active files per test. Upload File uses the native picker. Take Photo uses the native capture hint on touch-oriented devices. There is no webcam stream.

`backend/docker/laboratory-uploads.ini` aligns Docker/PHP with the 10 MiB file limit and 12 MiB multipart request limit. Other hosting environments must apply equivalent PHP/proxy request limits.

Authorized retrieval streams through the API. It never returns a bucket URL or object key. Preview uses a temporary browser Blob URL that is revoked on close. PDF preview also provides an Open PDF in a new tab fallback. Existing CSP frame sources permit Blob previews; object embedding remains disabled.

An upload intent is persisted before any durable write. Failed storage or database completion triggers cleanup; failed cleanup remains tracked for retry. Replacement uploads the new object before atomically withdrawing the old one, including at the file-count limit. Discard/expiry marks unfinished files for cleanup. Run the existing Laravel scheduler; `laboratory-attachments:prune` is scheduled daily and retries staged tombstones after a one-hour grace period. `--dry-run` lists the candidate count. Finalized evidence is never physically purged by this command.

**Current infrastructure blocker:** this workspace has local storage selected and no bucket configured. Real durable-storage connectivity and private-bucket policy could not be verified. Tests use an isolated fake disk; they do not upload clinical files to a live provider.

## Maternal and TB compatibility

`PrenatalAssessmentForm` uses an RHU-only laboratory context: new laboratory controls disappear, while read-only universal references and prior prenatal results remain visible. BHC retains its existing prenatal laboratory controls. OB history, LMP, AOG, FHT, risk assessment, ultrasound, and immunization controls are preserved.

The RHU TB card references universal tests and displays historical `tb_data.laboratory` read-only. Existing diagnosis/classification/registration logic remains. BHC uses the treatment-support `dots` mode and does not receive editable RHU registration controls.

The Form 4B Blade template keeps its historical laboratory rows and additionally prints universal results from the same health record. Existing `maternal_data.laboratoryEntries` and `tb_data.laboratory` remain intact and readable; they are not silently migrated into universal tests.

## RHU to BHC sharing

Relevant Laboratory Evidence appears on each eligible condition's Manage to BHC action. The clinician selects any subset of current or previous same-patient, same-RHU tests and explicitly confirms the displayed versions and attachments. An unfinished draft does not share anything.

Sharing stores references, not copied clinical results or files. Result-version or attachment changes since review are rejected until the clinician reviews and confirms again. Source RHU record details provides Update Shared Evidence with a reason and a sharing revision. New results and files do not silently update an existing BHC share.

The BHC Monitoring Request Review presents only the pinned shared versions. Evidence requires clinical-history permission, the receiving facility, a verified active linked patient at that BHC, and a pending-review/accepted/active handoff status. Linkage-needed, declined, or redirected requests do not disclose evidence. Redirecting an existing handoff does not automatically authorize evidence for the new receiving BHC.

Accept, Decline, Link Patient, and Start Monitoring retain their existing behavior. Associated BHC monitoring consultations display read-only evidence for their selected condition IDs. The source RHU laboratory listing and all laboratory writes are unavailable to BHC users.

## Changed source inventory

- Backend: new laboratory models, `LaboratoryEvidenceService`, `HandoffLaboratoryEvidence`, `LaboratoryAttachmentStorage`, laboratory controllers/config/migration, and `UniversalLaboratoryTest`.
- Existing backend integrations: `HealthRecordController`, `HealthRecordRequest`, `HealthRecord`, `HealthRecordDraftPayloadService`, `HealthRecordDraftService`, `FormDraftRecoveryKeyService`, `MonitoringHandoffService`/controller, `CareOverviewController`, permission middleware, API/console routes, CSP config, Form 4B template, `.env.example`, and Composer manifests.
- Deployment source: `backend/Dockerfile` and `backend/docker/laboratory-uploads.ini` align request limits; the container was not built or deployed in this session.
- Frontend: new `LaboratoryEvidence`, `LaboratoryRecordPanel`, `MonitoringLaboratoryEvidence`, laboratory service/utilities and tests; integration into RHU workspace/details, BHC handoff review/workspace, Maternal/TB forms, care-plan selection, record serialization, draft normalization/error ownership, monitoring identities, API Blob handling, privacy cleanup, and Vite CSP.
- Development-only fixture: `frontend/tests/fixtures/laboratory-preview.html` and `.jsx`. It contains synthetic data and intercepts its attachment requests; it is not part of the production application bundle.

## Verification and limits

Tests cover draft create/update/resume/discard/finalize and stale revisions, repeated names and conditional validation, exact backend draft whitelisting, old drafts, explicit/version-pinned sharing, attachment MIME/size/count limits, replacement, authorization, storage/database failure cleanup, late attachments, audit entries, legacy Maternal/TB rendering, and Form 4B PDF generation. Frontend checks also cover the existing recovery gate and Back to Queue flush integration. They are backend HTTP and component/unit tests, not a completed browser end-to-end session.

PHP tests use the installed SQLite extensions enabled **only for the test process**:

```powershell
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/phpunit --filter=UniversalLaboratoryTest --no-progress
```

Live checks at 375, 390, 768, and 1366 px remain unverified. Computer Use stopped because it could not confidently determine the current Windows browser URL; no further UI automation was attempted. The development fixture is available for that manual verification. Real camera-device behavior and live private-storage delivery also remain unverified.

Composer audit reports 48 advisories in 12 existing locked dependencies; none of the newly added S3 adapter/SDK dependencies are listed. Their existing versions were not upgraded in this feature. The production build reports its existing large-bundle warning. Focused lint reports no errors, with existing RHU workspace hook-dependency warnings.

Final verification: 259 backend regression tests passed (1,580 assertions); 328 frontend unit/component/regression tests passed. The focused laboratory backend suite comprises 18 tests, including deterministic finalization-during-upload cleanup. Frontend production build and `git diff --check` passed. No production database was accessed for these tests.
