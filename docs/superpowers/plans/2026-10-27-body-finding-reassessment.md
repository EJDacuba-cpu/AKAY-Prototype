# Persistent Body Findings Implementation Plan

> Execute inline using superpowers:executing-plans. Approved scope: the user's persistent findings brief and legacy safeguards confirmed on 2026-10-27.

**Goal:** Reuse Body Preview, drafts, Overview, and Health Record Details for individual finding reassessment.

**Architecture:** Keep original `body_findings` immutable. Append validated reassessments to the new consultation's existing `monitoring_data.bodyFindingReassessments` JSON. Identity is original record ID plus immutable array position, including records with missing/duplicate finding UUIDs. Never match by text/location. Laravel validates authorization and source identity in the existing finalization transaction; TanStack Query supplies scoped record history. No migration or stored procedure is needed.

**Alternatives:** Updating original findings would destroy historical truth. A separate status table adds migration and synchronization work without a demonstrated need. Append-only consultation metadata fits the existing architecture.

**Constraints:** Legacy and untouched findings are Not Yet Reassessed, never confirmed conditions. One marker per side/region. New findings retain existing save behavior and limits. Only successful finalization commits reassessment events. Diagnoses, reporting, and follow-up outcomes remain independent.

## Tasks

- [x] Test and implement ongoing summaries, stable legacy identities, independent pending decisions, and resolved/history behavior.
- [x] Test and implement backend event validation, canonical source snapshots, draft round trips, patient locking, stale revision rejection, replay, and rollback.
- [x] Reuse shared Body Preview and lists in BHC/RHU; wire pending decisions through drafts/finalization and show history in record details. Add inline error/loading recovery and refresh record caches after save.
- [x] Run focused frontend/backend regression tests and frontend build; inspect desktop/mobile if available; review final diff.

## Review focus

- Missing or duplicate legacy UUIDs must never merge findings or generate unstable references.
- A second staff member's stale decision must not reopen an already closed finding.
- Client-forged source data, another patient's record, or unauthorized facility records must fail atomically.
- Draft restore, omitted decisions, failed finalization, and idempotent retry must not change the ongoing state.
- Backdated visits must not reorder committed reassessment history; history loads every accessible page.

## Limitations to disclose

Legacy entries across visits can describe the same real-world observation but remain independent until explicitly reassessed. Historical absence is not proof of resolution. Visibility remains restricted by existing facility authorization. At most 500 explicit reassessments per consultation; no limit is placed on displayed historical findings. PostgreSQL concurrency needs live database verification beyond SQLite feature tests.

## Completion evidence

See docs/body-finding-reassessment-implementation.md for all changed files, review fixes, 181 backend / 190 frontend test results, final build and lint verification, and remaining browser/PostgreSQL limitations.
