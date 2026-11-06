# Facility Seeder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore facilities through a dedicated missing-only Laravel seeder.

**Architecture:** FacilitySeeder owns the existing reference list and inserts missing facilities inside a transaction. DatabaseSeeder delegates to it. Ambiguous identity aborts without changing records.

**Tech Stack:** Laravel, Eloquent, PHPUnit, SQLite test database, PostgreSQL application database.

**Spec:** docs/superpowers/specs/2026-11-06-facility-seeder-design.md

## Global Constraints

- Preserve existing IDs, names, addresses, contacts, status, RHU assignments and timestamps, including intentionally blank fields.
- Never delete unrelated facilities or reset the database.
- Preserve unrelated workspace edits and leave changes uncommitted for review.
- Existing non-main workspace is used to deliver the approved fix to the running application.

## Review Focus

- Reruns must preserve every existing value and timestamp.
- A renamed BHC must not create another BHC in its barangay.
- A missing canonical RHU with existing RHUs must fail without guessing.
- Legacy BHCs with blank barangay must be preserved by canonical name.
- Ambiguous or conflicting BHC identities must roll back earlier inserts.

### Task 1: Implement, verify and run the safe facility seeder

**Files:** Create `backend/database/seeders/FacilitySeeder.php` and `backend/tests/Feature/FacilitySeederTest.php`; modify `backend/database/seeders/DatabaseSeeder.php` and `docs/ai/CURRENT.md`.

**Interfaces:** Consumes existing rural_health_units and barangay_health_centers tables and models; produces `Database\\Seeders\\FacilitySeeder::run(): void`, directly callable with `php artisan db:seed --class=FacilitySeeder` and called by DatabaseSeeder.

- [x] Write feature tests for initial 14+1 setup, unchanged reruns after edits, partial databases, legacy names, renamed RHU rejection, conflicting identities and transaction rollback.
- [x] Run `php artisan test --compact --filter=FacilitySeederTest`; confirm failing behavior before implementation.
- [x] Move the existing list into FacilitySeeder, add missing-only matching and transaction guards, and delegate from DatabaseSeeder.
- [x] Run the seeder and existing facility-related feature tests, scoped Pint and diff checks. Request a focused read-only review and resolve material findings.
- [x] Run `php artisan db:seed --class=FacilitySeeder --no-interaction` against configured PostgreSQL, verify counts/default links, and prove a second run leaves facility rows unchanged.
- [x] Document command, preservation behavior and identity-conflict recovery in CURRENT.md; report exact verification results. No commit, push or reset.

## Execution evidence

RED: the old DatabaseSeeder reset edited RHU contact/address/status, BHC RHU assignments and timestamps, and duplicated a renamed Pitpitan BHC. GREEN: 66 focused feature tests, 249 assertions; scoped Pint and PHP syntax checks passed. Two fixture snapshots needed a database refresh to include generated/default columns before comparing persisted rows; production behavior was not changed to satisfy those fixture mistakes. Independent review reported no actionable findings.

PostgreSQL: initial counts 0 BHC/0 RHU; final counts 14 active BHC/1 active RHU, 14 distinct barangays, all 14 linked to default RHU. Both list controllers return those counts. A second seeder run returned exit 0 and left all facility rows identical. Current non-main shared workspace retained; unrelated changes were preserved, no commit/push/reset. No browser refresh claim is made.
