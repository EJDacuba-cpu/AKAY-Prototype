# Missing-only facility seeder

Eric approved the dedicated, non-overwriting seeder on 2026-11-06: “so go ahead if is the safe way”. The Facilities screenshot and a read-only PostgreSQL check both showed zero BHCs and zero RHUs; the existing DatabaseSeeder still contains the reference list.

## Intent and scope

Restore the existing 14 Bulakan BHC definitions and Rural Health Unit Bulakan. Move their single definition into FacilitySeeder; DatabaseSeeder delegates to it. Laravel owns this setup operation. No controller, stored procedure, schema, frontend, dependency, or clinical workflow changes are needed.

## Approaches

- Run the old DatabaseSeeder: simplest immediate recovery, but updateOrInsert overwrites administrator-maintained values on reruns.
- Dedicated missing-only FacilitySeeder: Eric selected this approach for targeted, repeatable setup without overwriting records.

## Contract

- Insert missing records only. Preserve existing IDs, names, addresses, contacts, status, RHU assignments and timestamps, including intentionally blank fields.
- Use the existing canonical RHU name as its identity. If that name is absent but any RHU already exists, abort rather than guess whether it was renamed or create a duplicate. An administrator must resolve that identity explicitly.
- Recognize an existing BHC by its barangay or canonical name, supporting renamed BHCs and legacy records with no barangay. Abort on multiple matches or a canonical name attached to a different nonempty barangay.
- Use one transaction: conflicts or failures leave no partial inserts. This is a serial administrative setup command, not a concurrent background job.
- Retain the existing 14 names and default addresses exactly; new records are active and new BHCs link to the default RHU. Never delete unrelated facilities or reset the database.

## Validation and delivery

Use isolated SQLite feature tests for initial setup, reruns, edited/renamed/legacy facilities, partial setup, ambiguity and rollback. Run relevant existing facility tests, formatter and diff checks. After verification, run only FacilitySeeder against the configured PostgreSQL database, then verify 14 BHCs, one RHU, correct default links, and unchanged rows on a second run. Preserve unrelated workspace edits and leave changes uncommitted for review.
