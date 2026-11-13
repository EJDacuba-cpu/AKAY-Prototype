# Remove Laboratory File Attachments — Design

**Date:** 2026-11-13  
**Branch:** `Eric-Manually-Fixer`  
**Audited HEAD:** `9f8d0085607b44ea9b2d8676245d745399b0b5a0`  
**Status:** Approved (Option A — structured result only for historical shares)

## Goal

Retire laboratory file attachments (PDF/JPG/PNG upload, camera, preview, download, replace, remove) from the active AKAY application while preserving structured laboratory records, diagnosis-linked supporting tests, RHU-to-BHC evidence sharing, consultation drafts, addenda, and RHU reporting classifications (`reportIn` / `reportAs` / `includeInSurveillance`).

## Non-goals

- No deletion of `laboratory_attachments` table, historical metadata rows, or stored files
- No rewrite of historical migrations
- No changes to Morbidity / Notifiable / Community Surveillance / TCL reporting logic
- No prescription, dispensing, referral, or general PDF export changes
- No commits, pushes, merges, deployments, or destructive DB/storage ops

## Architecture

### Frontend

- Remove `LaboratoryAttachments` UI and all upload/camera/preview/download/replace/remove flows
- `Remove Test` deletes only the in-memory/unfinalized structured test (no attachment API calls)
- Evidence selection contract becomes `{ reference, version }` only
- RHU consultation drops attachment `useQueries`, attachment busy gates, and attachment-ID confirmation invalidation
- Draft recovery: strip/ignore legacy `attachmentIds`; if confirmation depended on attachment state, require explicit reconfirmation

### Backend sharing (`HandoffLaboratoryEvidence`)

- Validate patient + RHU ownership, pinned version, explicit confirmation
- Concurrent update → HTTP 409 / validation reconfirmation as today for version mismatch
- New shares store `attachment_ids: []` (schema compatibility; do not migrate/drop column)
- `present()` returns structured result + pinned version only — never load/return/display attachment metadata or files (Option A)
- Remove attachment-ID matching as a sharing prerequisite
- Retire `allowsAttachment` once attachment show routes are gone

### Backend APIs

- Unregister laboratory-attachment index/store/show/destroy routes
- Remove or retire `LaboratoryAttachmentController` and attachment-only service usage after reference audit
- Unschedule and remove `laboratory-attachments:prune` before deleting `LaboratoryAttachmentStorage`
- Leave model/table/files in place for historical rows

### Drafts / payloads

- Active save/draft contract omits attachment IDs
- Keep backward-compatible draft sanitization so Resume/Discard still works for drafts that contain `attachmentIds`
- Preserve `reportIn` / `reportAs` / `includeInSurveillance` on save and restore

## Acceptance

The structured laboratory workflow and RHU-to-BHC evidence sharing operate without uploading, loading, validating, or requiring laboratory file attachments.
