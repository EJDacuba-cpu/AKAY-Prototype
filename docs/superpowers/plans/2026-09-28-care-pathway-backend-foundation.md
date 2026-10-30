# Care Pathway Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded, uncommitted "NCD as a program" prototype with
a generic, configurable Care Pathway / Monitoring Pathway backend: new
enrollment tables, a config-driven registry (starting with `ncd` and
`tb_dots`), and the persistence flow that creates/continues a patient-level
enrollment inside the existing consultation-save transaction. This plan is
backend-foundation-only; it also removes the frontend's uncommitted NCD
prototype so the tree stays consistent, but the new Start Monitoring UI is a
separate follow-up plan.

**Architecture:** Four new tables (`care_pathway_enrollments`,
`care_pathway_enrollment_conditions`, `care_pathway_encounters`,
`care_pathway_enrollment_follow_up_task`) hold patient-level state that spans
consultations. A PHP config file (`config/care_pathways.php`) is the single
source of truth for which pathways and field sets exist; a thin
`CarePathwayRegistry` service reads and validates against it. A new
`CarePathwayActivationService`, modeled directly on the existing
`CurrentConditionsSync` (same file, same call site, same
transaction-scoping), turns a validated activation payload into the
enrollment/condition/encounter rows, called from
`HealthRecordController::store()` right where `CurrentConditionsSync::sync()`
already runs.

**Tech Stack:** Laravel 11 (PHP), MySQL/Postgres via existing migrations,
PHPUnit feature/unit tests; React 18 + Vite frontend, Node's built-in
`node:test` for frontend unit tests.

**Spec:** `docs/superpowers/specs/2026-09-28-care-pathway-architecture-design.md`

## Global Constraints

- No existing table, column, or stored JSON key is renamed. `health_records.category`,
  `monitoring_data.selectedPrograms`/`primaryProgram`, `health_records.tb_data`,
  and `health_record_drafts.classification` all keep their current shape and meaning.
- `selectedPrograms`/`primaryProgram` narrow to **visit services only**
  (`Maternal`, `Family Planning`, `EPI`) going forward; `TB` stays in
  `ConsultationPrograms::CLASSIFICATIONS` **unchanged in this plan** — TB's
  existing checkbox-driven flow must keep working exactly as it does today
  until a later plan cuts it over to Care Pathways alongside its frontend UI.
- `NCD_CONDITIONS` and the `'NCD' => 'NCD Monitoring'` entry in
  `ConsultationPrograms::CLASSIFICATIONS` are uncommitted from yesterday's
  session and are deleted, not migrated.
- A pathway or field set is defined in exactly one place:
  `config/care_pathways.php`. No `if ($name === 'Hypertension')`-style checks
  anywhere in this plan's code.
- Every enrollment/condition/encounter write happens inside the existing
  `DB::transaction()` in `HealthRecordController::store()` — never as a
  standalone write, never before the health record itself is created.
- `care_pathways.manage` gates every write path (activate, continue, change
  conditions, end); reads (`GET /api/care-pathways`,
  `GET /api/patients/{patient}/care-pathway-enrollments`) do not require it.
- One active enrollment per `(patient_id, pathway_key)` is a database
  constraint (partial unique index), not just an application check.

## Review Focus

- **A second "start" request for a pathway the patient is already actively
  enrolled in** (double-submit, or a stale UI) must not create a second
  active enrollment — the partial unique index must reject it, and the
  service must turn that into a clear validation error, not a 500.
- **An activation payload naming a pathway key or field-set key that is not
  in `config/care_pathways.php`** must fail validation before the transaction
  opens, with a specific field-level message — not silently ignored, not a
  generic 500 from an undefined-array-key error deep in the service.
- **A user without `care_pathways.manage` submitting an activation payload**
  must be rejected the same way `CurrentConditionsSync::assertAllowed`
  rejects an unpermitted `addToConditions: true` today — a 422 naming the
  offending field, not a 403 for the whole request (the rest of the
  consultation must still be allowed to save).
- **`GET /api/patients/{patient}/care-pathway-enrollments` for a patient
  outside the requesting user's facility** must 403 via the same
  `authorizePatient` check `PatientController::show` already uses — this is
  a new route and it is easy to forget the facility-scoping call entirely.
- **A health-record save that fails after `HealthRecord::create()` but before
  the transaction commits** (e.g. a later step throws) must leave zero
  enrollment/condition/encounter rows behind — proven with a test that forces
  a failure partway through, mirroring the existing rollback-on-failure tests
  in `HealthRecordIdempotencyTest`.
- **Completing or discontinuing one enrollment, or removing one of its
  conditions, must never affect a different active enrollment for the same
  patient** (e.g. discontinuing NCD Monitoring must leave an active TB-DOTS
  enrollment for the same patient untouched) — the spec is explicit that
  ending an enrollment and changing its conditions are in scope for this
  plan, not deferred (see Task 15).

---

## Task 1: Migrations for the four Care Pathway tables

**Files:**
- Create: `backend/database/migrations/2026_09_29_000001_create_care_pathway_enrollments_table.php`
- Create: `backend/database/migrations/2026_09_29_000002_create_care_pathway_enrollment_conditions_table.php`
- Create: `backend/database/migrations/2026_09_29_000003_create_care_pathway_encounters_table.php`
- Create: `backend/database/migrations/2026_09_29_000004_create_care_pathway_enrollment_follow_up_task_table.php`
- Test: `backend/tests/Feature/CarePathwayMigrationTest.php`

**Interfaces:**
- Produces: four tables, described below, that Task 2's Eloquent models map to exactly.

- [ ] **Step 1: Write the enrollments migration**

```php
<?php
// backend/database/migrations/2026_09_29_000001_create_care_pathway_enrollments_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A patient's enrollment in one configured Care Pathway (config/care_pathways.php),
 * e.g. "ncd" or "tb_dots". One row per (patient, pathway) that has ever been
 * started - status moves active -> completed|discontinued, never deleted.
 *
 * Written to ONLY from CarePathwayActivationService, inside the same
 * DB::transaction() that creates the health_records row which started or
 * continued it (see HealthRecordController::store). Never created by a
 * standalone API call.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_pathway_enrollments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->string('pathway_key', 50); // a config/care_pathways.php key, e.g. "ncd"
            $table->string('status', 20)->default('active'); // active|completed|discontinued
            $table->foreignId('barangay_health_center_id')->constrained()->cascadeOnDelete();
            $table->foreignId('started_health_record_id')->constrained('health_records')->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->foreignId('ended_health_record_id')->nullable()
                ->constrained('health_records')->nullOnDelete();
            $table->timestamp('ended_at')->nullable();
            $table->string('end_reason', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['patient_id', 'pathway_key'], 'care_pathway_enrollments_patient_pathway_idx');
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'ALTER TABLE public.care_pathway_enrollments ADD CONSTRAINT care_pathway_enrollments_status_check '
            ."CHECK (status IN ('active', 'completed', 'discontinued'))"
        );
        // One active enrollment per patient per pathway - the database is the
        // one place this is truly guaranteed, since two concurrent "start"
        // requests can both pass an application-level check.
        DB::statement(
            'CREATE UNIQUE INDEX care_pathway_enrollments_one_active_idx '
            .'ON public.care_pathway_enrollments (patient_id, pathway_key) '
            ."WHERE status = 'active'"
        );

        // Phase 2B posture (docs/database-exposure-containment.md): every
        // table created after that migration ran must enable RLS itself.
        DB::statement('ALTER TABLE public.care_pathway_enrollments ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('care_pathway_enrollments');
    }
};
```

- [ ] **Step 2: Write the enrollment-conditions migration**

```php
<?php
// backend/database/migrations/2026_09_29_000002_create_care_pathway_enrollment_conditions_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One condition inside a Care Pathway enrollment (e.g. "Hypertension" and
 * "Diabetes Mellitus" both inside one NCD Monitoring enrollment). Removing a
 * condition is a soft end (removed_health_record_id/removed_at), never a
 * delete, so the enrollment's history stays intact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_pathway_enrollment_conditions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enrollment_id')->constrained('care_pathway_enrollments')->cascadeOnDelete();
            $table->string('condition_name', 150); // the diagnosis text, as typed
            // The pathway's chosen field set (config/care_pathways.php field_sets
            // key), e.g. "diabetes_monitoring". Null means "None" - no
            // specialized form verified/chosen for this condition yet.
            $table->string('field_set_key', 50)->nullable();
            // The diagnosis entry's id this came from - traceability only, not
            // a foreign key (diagnoses live in health_records.diagnoses JSON).
            $table->string('diagnosis_ref', 64)->nullable();
            $table->foreignId('added_health_record_id')->constrained('health_records')->cascadeOnDelete();
            $table->foreignId('removed_health_record_id')->nullable()
                ->constrained('health_records')->nullOnDelete();
            $table->timestamp('removed_at')->nullable();
            $table->timestamps();

            $table->index(['enrollment_id', 'removed_at'], 'care_pathway_enrollment_conditions_active_idx');
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE public.care_pathway_enrollment_conditions ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('care_pathway_enrollment_conditions');
    }
};
```

- [ ] **Step 3: Write the encounters migration**

```php
<?php
// backend/database/migrations/2026_09_29_000003_create_care_pathway_encounters_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only: which health record visits belong to a Care Pathway
 * enrollment, and (for a generic pathway like NCD) that visit's field-set
 * values. A "legacy_linked" row only POINTS AT an old, unmodified TB record
 * - it never carries field_data and the linked record is never edited.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_pathway_encounters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enrollment_id')->constrained('care_pathway_enrollments')->cascadeOnDelete();
            $table->foreignId('health_record_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20); // started|continued|legacy_linked
            $table->json('field_data')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['enrollment_id', 'health_record_id'], 'care_pathway_encounters_enrollment_record_unique');
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'ALTER TABLE public.care_pathway_encounters ADD CONSTRAINT care_pathway_encounters_kind_check '
            ."CHECK (kind IN ('started', 'continued', 'legacy_linked'))"
        );
        DB::statement('ALTER TABLE public.care_pathway_encounters ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('care_pathway_encounters');
    }
};
```

- [ ] **Step 4: Write the follow-up-task pivot migration**

```php
<?php
// backend/database/migrations/2026_09_29_000004_create_care_pathway_enrollment_follow_up_task_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which Care Pathway enrollments a scheduled follow_up_tasks row is for,
 * populated only from the Disposition step's explicit "This follow-up is
 * for:" checklist (never automatic). A visit opened from a linked task
 * auto-links itself to exactly these enrollments as a "continued" encounter.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_pathway_enrollment_follow_up_task', function (Blueprint $table) {
            $table->foreignId('enrollment_id')->constrained('care_pathway_enrollments')->cascadeOnDelete();
            $table->foreignId('follow_up_task_id')->constrained()->cascadeOnDelete();
            $table->primary(['enrollment_id', 'follow_up_task_id']);
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE public.care_pathway_enrollment_follow_up_task ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('care_pathway_enrollment_follow_up_task');
    }
};
```

- [ ] **Step 5: Run the migrations**

Run: `cd backend && php artisan migrate`
Expected: all four tables created with no errors.

- [ ] **Step 6: Write a structural test proving the constraints actually work**

```php
<?php
// backend/tests/Feature/CarePathwayMigrationTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CarePathwayMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_one_active_enrollment_per_patient_per_pathway_is_enforced(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('The partial unique index is Postgres-specific.');
        }

        $rhu = RuralHealthUnit::create(['name' => 'CP RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'CP BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'A', 'last_name' => 'B', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);

        DB::table('care_pathway_enrollments')->insert([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('care_pathway_enrollments')->insert([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_completed_enrollment_does_not_block_a_new_active_one(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('The partial unique index is Postgres-specific.');
        }

        $rhu = RuralHealthUnit::create(['name' => 'CP RHU 2', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'CP BHC 2', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'C', 'last_name' => 'D', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);

        DB::table('care_pathway_enrollments')->insert([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'completed',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('care_pathway_enrollments')->insert([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertDatabaseCount('care_pathway_enrollments', 2);
    }
}
```

- [ ] **Step 7: Run the test**

Run: `cd backend && php artisan test --filter=CarePathwayMigrationTest`
Expected: PASS (2 tests) on Postgres; SKIPPED (2) on any other driver — check
`backend/.env`'s `DB_CONNECTION` first so you know which to expect.

- [ ] **Step 8: Commit**

```bash
cd backend
git add database/migrations/2026_09_29_0000*.php tests/Feature/CarePathwayMigrationTest.php
git commit -m "feat(care-pathways): add enrollment/condition/encounter/follow-up-task tables

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Eloquent models for the four tables

**Files:**
- Create: `backend/app/Models/CarePathwayEnrollment.php`
- Create: `backend/app/Models/CarePathwayEnrollmentCondition.php`
- Create: `backend/app/Models/CarePathwayEncounter.php`
- Modify: `backend/app/Models/Patient.php` (add `carePathwayEnrollments()`)
- Modify: `backend/app/Models/FollowUpTask.php` (add `carePathwayEnrollments()`)
- Modify: `backend/app/Models/HealthRecord.php` (add the three inverse relations)
- Test: `backend/tests/Unit/Models/CarePathwayEnrollmentTest.php`

**Interfaces:**
- Consumes: the tables from Task 1.
- Produces: `CarePathwayEnrollment::query()`, `->conditions()`,
  `->encounters()`, `->activeConditionNames(): array<string>` (used by Task 7);
  `CarePathwayEnrollmentCondition::isActive(): bool` (true when
  `removed_at` is null); `Patient::carePathwayEnrollments()`;
  `FollowUpTask::carePathwayEnrollments()`.

- [ ] **Step 1: Write the failing model test**

```php
<?php
// backend/tests/Unit/Models/CarePathwayEnrollmentTest.php

namespace Tests\Unit\Models;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarePathwayEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_condition_names_excludes_removed_conditions(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'M RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'M BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'E', 'last_name' => 'F', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);

        $enrollment = CarePathwayEnrollment::create([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);
        $enrollment->conditions()->create([
            'condition_name' => 'Hypertension', 'added_health_record_id' => $record->id,
        ]);
        $enrollment->conditions()->create([
            'condition_name' => 'Diabetes Mellitus', 'field_set_key' => 'diabetes_monitoring',
            'added_health_record_id' => $record->id, 'removed_health_record_id' => $record->id,
            'removed_at' => now(),
        ]);

        $this->assertSame(['Hypertension'], $enrollment->activeConditionNames());
    }

    public function test_patient_and_follow_up_task_relations_resolve(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'N RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'N BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'G', 'last_name' => 'H', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);
        $enrollment = CarePathwayEnrollment::create([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);

        $this->assertTrue($patient->carePathwayEnrollments->contains($enrollment));

        $task = \App\Models\FollowUpTask::create([
            'health_record_id' => $record->id, 'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id, 'due_date' => now()->addWeek(),
            'state' => 'pending',
        ]);
        $task->carePathwayEnrollments()->attach($enrollment->id);

        $this->assertTrue($task->fresh()->carePathwayEnrollments->contains($enrollment));
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=CarePathwayEnrollmentTest`
Expected: FAIL — `Class "App\Models\CarePathwayEnrollment" not found`.

- [ ] **Step 3: Write the models**

```php
<?php
// backend/app/Models/CarePathwayEnrollment.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A patient's enrollment in one configured Care Pathway. See
 * docs/superpowers/specs/2026-09-28-care-pathway-architecture-design.md and
 * config/care_pathways.php for what `pathway_key` may be.
 */
class CarePathwayEnrollment extends Model
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_DISCONTINUED = 'discontinued';

    protected $fillable = [
        'patient_id', 'pathway_key', 'status', 'barangay_health_center_id',
        'started_health_record_id', 'started_at', 'ended_health_record_id',
        'ended_at', 'end_reason', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function conditions(): HasMany
    {
        return $this->hasMany(CarePathwayEnrollmentCondition::class, 'enrollment_id');
    }

    public function encounters(): HasMany
    {
        return $this->hasMany(CarePathwayEncounter::class, 'enrollment_id');
    }

    public function startedHealthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class, 'started_health_record_id');
    }

    public function followUpTasks(): BelongsToMany
    {
        return $this->belongsToMany(FollowUpTask::class, 'care_pathway_enrollment_follow_up_task', 'enrollment_id', 'follow_up_task_id');
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    /** Condition names currently part of this enrollment (not soft-removed). */
    public function activeConditionNames(): array
    {
        return $this->conditions
            ->filter(fn (CarePathwayEnrollmentCondition $condition) => $condition->isActive())
            ->pluck('condition_name')
            ->all();
    }
}
```

```php
<?php
// backend/app/Models/CarePathwayEnrollmentCondition.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CarePathwayEnrollmentCondition extends Model
{
    protected $fillable = [
        'enrollment_id', 'condition_name', 'field_set_key', 'diagnosis_ref',
        'added_health_record_id', 'removed_health_record_id', 'removed_at',
    ];

    protected $casts = [
        'removed_at' => 'datetime',
    ];

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(CarePathwayEnrollment::class, 'enrollment_id');
    }

    public function isActive(): bool
    {
        return $this->removed_at === null;
    }
}
```

```php
<?php
// backend/app/Models/CarePathwayEncounter.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CarePathwayEncounter extends Model
{
    public const KIND_STARTED = 'started';
    public const KIND_CONTINUED = 'continued';
    public const KIND_LEGACY_LINKED = 'legacy_linked';

    public $timestamps = false;

    protected $fillable = ['enrollment_id', 'health_record_id', 'kind', 'field_data', 'created_at'];

    protected $casts = [
        'field_data' => 'array',
        'created_at' => 'datetime',
    ];

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(CarePathwayEnrollment::class, 'enrollment_id');
    }

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }
}
```

Modify `backend/app/Models/Patient.php` — add this method near its other
`hasMany`-style relations (the file already has several; add alongside them):

```php
    public function carePathwayEnrollments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(CarePathwayEnrollment::class);
    }
```

Modify `backend/app/Models/FollowUpTask.php` — add after the existing
`rescheduledTo()` relation (around line 107):

```php
    public function carePathwayEnrollments(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(CarePathwayEnrollment::class, 'care_pathway_enrollment_follow_up_task', 'follow_up_task_id', 'enrollment_id');
    }
```

Modify `backend/app/Models/HealthRecord.php` — add after the existing
`dispensedMedicines()` relation (around line 116):

```php
    public function carePathwayEnrollmentsStarted(): HasMany
    {
        return $this->hasMany(CarePathwayEnrollment::class, 'started_health_record_id');
    }

    public function carePathwayEncounters(): HasMany
    {
        return $this->hasMany(CarePathwayEncounter::class, 'health_record_id');
    }
```

- [ ] **Step 4: Run the test again**

Run: `cd backend && php artisan test --filter=CarePathwayEnrollmentTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/Models/CarePathwayEnrollment.php app/Models/CarePathwayEnrollmentCondition.php app/Models/CarePathwayEncounter.php app/Models/Patient.php app/Models/FollowUpTask.php app/Models/HealthRecord.php tests/Unit/Models/CarePathwayEnrollmentTest.php
git commit -m "feat(care-pathways): add enrollment/condition/encounter models and relations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: The registry (config + service)

**Files:**
- Create: `backend/config/care_pathways.php`
- Create: `backend/app/Services/CarePathwayRegistry.php`
- Test: `backend/tests/Unit/Services/CarePathwayRegistryTest.php`

**Interfaces:**
- Produces: `CarePathwayRegistry::all(): array` (the raw config, for the API
  response), `CarePathwayRegistry::has(string $pathwayKey): bool`,
  `CarePathwayRegistry::category(string $pathwayKey): ?string`,
  `CarePathwayRegistry::fieldSetKeys(string $pathwayKey): array<string>`,
  `CarePathwayRegistry::fieldKeys(string $pathwayKey, string $fieldSetKey): array<string>`,
  `CarePathwayRegistry::usesDedicatedForm(string $pathwayKey): bool`. Task 8
  (request validation) and Task 7 (activation service) both call these —
  no other file re-reads `config('care_pathways')` directly.

- [ ] **Step 1: Write the config file**

```php
<?php
// backend/config/care_pathways.php

/**
 * The Care Pathway registry - the single source of truth for which pathways
 * and condition field sets exist. Adding a verified pathway or field set is a
 * reviewed change to this file, not a runtime/database edit. See
 * docs/superpowers/specs/2026-09-28-care-pathway-architecture-design.md.
 *
 * `category` is the health_records.category this pathway sets for a visit
 * with no Visit Service selected (see ConsultationPrograms for those).
 *
 * `field_sets` (omit entirely, or use `uses_dedicated_form: true`, for a
 * pathway whose form is not generic - see "tb_dots" below): each key is what
 * CarePathwayEnrollmentCondition.field_set_key stores; `fields` lists that
 * set's own validated fields. An empty `fields` array is still a real,
 * selectable set - it just has no specialized fields verified yet.
 */
return [
    'ncd' => [
        'label' => 'NCD Monitoring',
        'category' => 'NCD Monitoring',
        'field_sets' => [
            'hypertension_monitoring' => [
                'label' => 'Hypertension Monitoring',
                'fields' => [],
            ],
            'diabetes_monitoring' => [
                'label' => 'Diabetes Monitoring',
                'fields' => [
                    'fbs' => ['label' => 'Fasting Blood Sugar (FBS)', 'type' => 'string', 'max' => 100],
                ],
            ],
        ],
    ],
    'tb_dots' => [
        'label' => 'TB-DOTS',
        'category' => 'TB DOTS / TB Monitoring',
        // TB keeps its existing verified form and health_records.tb_data
        // column - never expressed as generic field sets.
        'uses_dedicated_form' => true,
    ],
];
```

- [ ] **Step 2: Write the failing registry test**

```php
<?php
// backend/tests/Unit/Services/CarePathwayRegistryTest.php

namespace Tests\Unit\Services;

use App\Services\CarePathwayRegistry;
use Tests\TestCase;

class CarePathwayRegistryTest extends TestCase
{
    public function test_all_returns_the_configured_pathways(): void
    {
        $registry = app(CarePathwayRegistry::class);
        $pathways = $registry->all();

        $this->assertArrayHasKey('ncd', $pathways);
        $this->assertArrayHasKey('tb_dots', $pathways);
        $this->assertSame('NCD Monitoring', $pathways['ncd']['label']);
    }

    public function test_has_is_true_only_for_configured_keys(): void
    {
        $registry = app(CarePathwayRegistry::class);

        $this->assertTrue($registry->has('ncd'));
        $this->assertTrue($registry->has('tb_dots'));
        $this->assertFalse($registry->has('made_up'));
    }

    public function test_category_resolves_per_pathway(): void
    {
        $registry = app(CarePathwayRegistry::class);

        $this->assertSame('NCD Monitoring', $registry->category('ncd'));
        $this->assertSame('TB DOTS / TB Monitoring', $registry->category('tb_dots'));
        $this->assertNull($registry->category('made_up'));
    }

    public function test_field_set_keys_and_field_keys(): void
    {
        $registry = app(CarePathwayRegistry::class);

        $this->assertSame(['hypertension_monitoring', 'diabetes_monitoring'], $registry->fieldSetKeys('ncd'));
        $this->assertSame([], $registry->fieldSetKeys('tb_dots'));
        $this->assertSame(['fbs'], $registry->fieldKeys('ncd', 'diabetes_monitoring'));
        $this->assertSame([], $registry->fieldKeys('ncd', 'hypertension_monitoring'));
        $this->assertSame([], $registry->fieldKeys('ncd', 'made_up_set'));
    }

    public function test_uses_dedicated_form(): void
    {
        $registry = app(CarePathwayRegistry::class);

        $this->assertTrue($registry->usesDedicatedForm('tb_dots'));
        $this->assertFalse($registry->usesDedicatedForm('ncd'));
        $this->assertFalse($registry->usesDedicatedForm('made_up'));
    }
}
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=CarePathwayRegistryTest`
Expected: FAIL — `Class "App\Services\CarePathwayRegistry" not found`.

- [ ] **Step 4: Write the service**

```php
<?php
// backend/app/Services/CarePathwayRegistry.php

namespace App\Services;

/**
 * Reads config/care_pathways.php - the ONE place a Care Pathway or its field
 * sets are defined. Every other class asks this service; none reads
 * config('care_pathways') directly.
 */
class CarePathwayRegistry
{
    public function all(): array
    {
        return config('care_pathways', []);
    }

    public function has(string $pathwayKey): bool
    {
        return array_key_exists($pathwayKey, $this->all());
    }

    public function category(string $pathwayKey): ?string
    {
        return $this->all()[$pathwayKey]['category'] ?? null;
    }

    public function usesDedicatedForm(string $pathwayKey): bool
    {
        return (bool) ($this->all()[$pathwayKey]['uses_dedicated_form'] ?? false);
    }

    /** @return array<int, string> */
    public function fieldSetKeys(string $pathwayKey): array
    {
        return array_keys($this->all()[$pathwayKey]['field_sets'] ?? []);
    }

    public function hasFieldSet(string $pathwayKey, string $fieldSetKey): bool
    {
        return in_array($fieldSetKey, $this->fieldSetKeys($pathwayKey), true);
    }

    /** @return array<int, string> */
    public function fieldKeys(string $pathwayKey, string $fieldSetKey): array
    {
        return array_keys($this->all()[$pathwayKey]['field_sets'][$fieldSetKey]['fields'] ?? []);
    }

    public function fieldConfig(string $pathwayKey, string $fieldSetKey, string $fieldKey): ?array
    {
        return $this->all()[$pathwayKey]['field_sets'][$fieldSetKey]['fields'][$fieldKey] ?? null;
    }
}
```

- [ ] **Step 5: Run the test again**

Run: `cd backend && php artisan test --filter=CarePathwayRegistryTest`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
cd backend
git add config/care_pathways.php app/Services/CarePathwayRegistry.php tests/Unit/Services/CarePathwayRegistryTest.php
git commit -m "feat(care-pathways): add the config-driven pathway registry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `GET /api/care-pathways` (registry endpoint)

**Files:**
- Create: `backend/app/Http/Controllers/Api/CarePathwayController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/CarePathwayControllerTest.php`

**Interfaces:**
- Consumes: `CarePathwayRegistry::all()` (Task 3).
- Produces: the route `GET /api/care-pathways`, response shape
  `{"data": {"ncd": {...}, "tb_dots": {...}}}`.

- [ ] **Step 1: Write the failing feature test**

```php
<?php
// backend/tests/Feature/CarePathwayControllerTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarePathwayControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_any_authenticated_facility_user_can_read_the_registry(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Reg RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Reg BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Reg BHW', 'email' => 'reg@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/care-pathways')->assertOk()
            ->assertJsonPath('data.ncd.label', 'NCD Monitoring')
            ->assertJsonPath('data.tb_dots.label', 'TB-DOTS');
    }

    public function test_it_requires_authentication(): void
    {
        $this->getJson('/api/care-pathways')->assertUnauthorized();
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=CarePathwayControllerTest`
Expected: FAIL — 404 (route does not exist yet).

- [ ] **Step 3: Write the controller**

```php
<?php
// backend/app/Http/Controllers/Api/CarePathwayController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CarePathwayRegistry;

class CarePathwayController extends Controller
{
    public function index(CarePathwayRegistry $registry)
    {
        return response()->json(['data' => $registry->all()]);
    }
}
```

- [ ] **Step 4: Wire the route**

Modify `backend/routes/api.php`. Add the import near the other controller
imports (alphabetical, after `AuthController`):

```php
use App\Http\Controllers\Api\CarePathwayController;
```

Add the route inside the existing `['facility.assigned', 'actions.allowed']`
group (`routes/api.php:59-65`), right after the `patients`/`health-records`
resource lines so it reads:

```php
        Route::apiResource('patients', PatientController::class);
        Route::apiResource('health-records', HealthRecordController::class);
        Route::get('care-pathways', [CarePathwayController::class, 'index']);
        Route::get('health-records/{healthRecord}/corrections', [\App\Http\Controllers\Api\RecordCorrectionController::class, 'index']);
```

(`/api/care-pathways` does not contain `/patients` or `/health-records`, so
`EnforceActionPermissions`'s `match(true)` falls through to `default => null`
for it — no permission required beyond being an authenticated, facility-
assigned user, matching the spec.)

- [ ] **Step 5: Run the test again**

Run: `cd backend && php artisan test --filter=CarePathwayControllerTest`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/Http/Controllers/Api/CarePathwayController.php routes/api.php tests/Feature/CarePathwayControllerTest.php
git commit -m "feat(care-pathways): add GET /api/care-pathways

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `care_pathways.manage` permission

**Files:**
- Modify: `backend/app/Services/ActionPermissions.php`
- Modify: `backend/app/Http/Middleware/EnforceActionPermissions.php`
- Test: `backend/tests/Unit/Services/ActionPermissionsCarePathwayTest.php`

**Interfaces:**
- Produces: `ActionPermissions::ALL` and `ActionPermissions::PRESETS['clinical']`
  both include `'care_pathways.manage'`; `ActionPermissions::allows($user, 'care_pathways.manage')`.

- [ ] **Step 1: Write the failing test**

```php
<?php
// backend/tests/Unit/Services/ActionPermissionsCarePathwayTest.php

namespace Tests\Unit\Services;

use App\Services\ActionPermissions;
use Tests\TestCase;

class ActionPermissionsCarePathwayTest extends TestCase
{
    public function test_care_pathways_manage_is_a_known_permission_in_the_clinical_preset(): void
    {
        $this->assertContains('care_pathways.manage', ActionPermissions::ALL);
        $this->assertContains('care_pathways.manage', ActionPermissions::PRESETS['clinical']);
        $this->assertNotContains('care_pathways.manage', ActionPermissions::PRESETS['encoder']);
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=ActionPermissionsCarePathwayTest`
Expected: FAIL — assertion on `ActionPermissions::ALL` not containing it.

- [ ] **Step 3: Add the permission**

Modify `backend/app/Services/ActionPermissions.php:10` (the `ALL` constant) —
add `'care_pathways.manage'` to the array:

```php
    public const ALL = ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize', 'records.correct', 'followups.manage', 'referrals.submit', 'inventory.view', 'inventory.manage', 'items.dispense', 'rhu.manage', 'reports.view', 'care_pathways.manage'];
```

Modify line 13 (the `'clinical'` preset) — add it there too:

```php
        'clinical' => ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize', 'records.correct', 'followups.manage', 'referrals.submit', 'items.dispense', 'inventory.view', 'reports.view', 'care_pathways.manage'],
```

- [ ] **Step 4: Route the new patient-scoped read past the generic `/patients` check**

Modify `backend/app/Http/Middleware/EnforceActionPermissions.php:17-21` — add
one new match arm **before** the existing `/patients` line (Task 6 needs this
so `GET /api/patients/{patient}/care-pathway-enrollments` is gated by
`clinical.history`, not `patients.register`):

```php
            str_contains($path, '/corrections') => $read ? 'clinical.history' : 'records.correct',
            str_contains($path, 'dispensed-medicines') => 'items.dispense',
            str_contains($path, '/health-record-drafts') => 'consultations.encode',
            str_contains($path, '/health-records') => $read ? 'clinical.history' : 'consultations.finalize',
            str_contains($path, '/care-pathway-enrollments') => 'clinical.history',
            str_contains($path, '/patients') => $read ? 'patients.register' : 'patients.register',
```

- [ ] **Step 5: Run the test again**

Run: `cd backend && php artisan test --filter=ActionPermissionsCarePathwayTest`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/Services/ActionPermissions.php app/Http/Middleware/EnforceActionPermissions.php tests/Unit/Services/ActionPermissionsCarePathwayTest.php
git commit -m "feat(care-pathways): add care_pathways.manage permission

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `GET /api/patients/{patient}/care-pathway-enrollments`

**Files:**
- Create: `backend/app/Http/Controllers/Api/CarePathwayEnrollmentController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/CarePathwayEnrollmentControllerTest.php`

**Interfaces:**
- Consumes: `Patient::carePathwayEnrollments()` (Task 2),
  `FacilityAccessService::authorizePatient(User, Patient)` (existing,
  `backend/app/Services/FacilityAccessService.php`, same call
  `PatientController::show` already makes).
- Produces: `GET /api/patients/{patient}/care-pathway-enrollments` →
  `{"data": [{"id", "pathway_key", "status", "started_at", "ended_at", "conditions": [{"condition_name", "field_set_key"}]}]}`,
  ordered newest-first, conditions filtered to active-only per enrollment.

- [ ] **Step 1: Write the failing feature test**

```php
<?php
// backend/tests/Feature/CarePathwayEnrollmentControllerTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarePathwayEnrollmentControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_lists_active_conditions_for_the_patients_enrollments(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Enr RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Enr BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = \App\Models\User::create(['name' => 'Enr BHW', 'email' => 'enr@example.test', 'password' => bcrypt('test-password'), 'role' => \App\Models\User::ROLE_BHW, 'status' => \App\Models\User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'I', 'last_name' => 'J', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);
        $enrollment = CarePathwayEnrollment::create([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);
        $enrollment->conditions()->create(['condition_name' => 'Hypertension', 'added_health_record_id' => $record->id]);
        $enrollment->conditions()->create([
            'condition_name' => 'Removed One', 'added_health_record_id' => $record->id,
            'removed_health_record_id' => $record->id, 'removed_at' => now(),
        ]);
        $this->actingAs($user, 'sanctum');

        $this->getJson("/api/patients/{$patient->id}/care-pathway-enrollments")->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.pathway_key', 'ncd')
            ->assertJsonPath('data.0.status', 'active')
            ->assertJsonCount(1, 'data.0.conditions')
            ->assertJsonPath('data.0.conditions.0.condition_name', 'Hypertension');
    }

    public function test_a_patient_outside_the_users_facility_is_forbidden(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Enr RHU 2', 'status' => 'active']);
        $bhcA = BarangayHealthCenter::create(['name' => 'Enr BHC A', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $bhcB = BarangayHealthCenter::create(['name' => 'Enr BHC B', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = \App\Models\User::create(['name' => 'Outside BHW', 'email' => 'outside@example.test', 'password' => bcrypt('test-password'), 'role' => \App\Models\User::ROLE_BHW, 'status' => \App\Models\User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhcA->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'K', 'last_name' => 'L', 'sex' => 'Male', 'barangay_health_center_id' => $bhcB->id]);
        $this->actingAs($user, 'sanctum');

        $this->getJson("/api/patients/{$patient->id}/care-pathway-enrollments")->assertForbidden();
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=CarePathwayEnrollmentControllerTest`
Expected: FAIL — 404 (route/controller do not exist yet).

- [ ] **Step 3: Write the controller**

```php
<?php
// backend/app/Http/Controllers/Api/CarePathwayEnrollmentController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Services\FacilityAccessService;
use Illuminate\Http\Request;

class CarePathwayEnrollmentController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function index(Request $request, Patient $patient)
    {
        $this->facilityAccess->authorizePatient($request->user(), $patient);

        $enrollments = $patient->carePathwayEnrollments()
            ->with(['conditions' => fn ($query) => $query->whereNull('removed_at')])
            ->latest('started_at')
            ->get();

        return response()->json(['data' => $enrollments->map(fn ($enrollment) => [
            'id' => $enrollment->id,
            'pathway_key' => $enrollment->pathway_key,
            'status' => $enrollment->status,
            'started_at' => $enrollment->started_at,
            'ended_at' => $enrollment->ended_at,
            'conditions' => $enrollment->conditions->map(fn ($condition) => [
                'condition_name' => $condition->condition_name,
                'field_set_key' => $condition->field_set_key,
            ])->values(),
        ])]);
    }
}
```

- [ ] **Step 4: Wire the route**

Modify `backend/routes/api.php` — add the import:

```php
use App\Http\Controllers\Api\CarePathwayEnrollmentController;
```

Add the route right after the `care-pathways` line added in Task 4:

```php
        Route::get('care-pathways', [CarePathwayController::class, 'index']);
        Route::get('patients/{patient}/care-pathway-enrollments', [CarePathwayEnrollmentController::class, 'index']);
```

- [ ] **Step 5: Run the test again**

Run: `cd backend && php artisan test --filter=CarePathwayEnrollmentControllerTest`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/Http/Controllers/Api/CarePathwayEnrollmentController.php routes/api.php tests/Feature/CarePathwayEnrollmentControllerTest.php
git commit -m "feat(care-pathways): add GET /api/patients/{patient}/care-pathway-enrollments

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `CarePathwayActivationService` — the persistence core

**Files:**
- Create: `backend/app/Services/CarePathwayActivationService.php`
- Test: `backend/tests/Feature/CarePathwayActivationServiceTest.php`

**Interfaces:**
- Consumes: `CarePathwayRegistry` (Task 3), `CarePathwayEnrollment`/
  `CarePathwayEnrollmentCondition`/`CarePathwayEncounter` (Task 2).
- Produces:
  - `assertAllowed(User $user, array $activations): void` — mirrors
    `CurrentConditionsSync::assertAllowed` exactly: throws
    `ValidationException` naming the offending array index when a
    non-permitted user submits a non-empty `$activations` array.
  - `activate(Patient $patient, HealthRecord $record, array $activations, User $user): void`
    where each `$activations[]` is shaped
    `['pathway_key' => string, 'conditions' => [['condition_name' => string, 'field_set_key' => ?string, 'diagnosis_ref' => ?string, 'field_values' => array]], 'link_legacy_health_record_ids' => int[]]`.
    Called inside the existing save transaction, after `HealthRecord::create()`.
    This is the exact function signature Task 9 calls.

- [ ] **Step 1: Write the failing feature test**

```php
<?php
// backend/tests/Feature/CarePathwayActivationServiceTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\CarePathwayActivationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CarePathwayActivationServiceTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;
    private HealthRecord $record;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Act RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Act BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'M', 'last_name' => 'N', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);
    }

    public function test_starting_a_pathway_creates_enrollment_conditions_and_a_started_encounter(): void
    {
        app(CarePathwayActivationService::class)->activate($this->patient, $this->record, [[
            'pathway_key' => 'ncd',
            'conditions' => [
                ['condition_name' => 'Hypertension', 'field_set_key' => 'hypertension_monitoring', 'diagnosis_ref' => 'd1', 'field_values' => []],
                ['condition_name' => 'Diabetes Mellitus', 'field_set_key' => 'diabetes_monitoring', 'diagnosis_ref' => 'd2', 'field_values' => ['fbs' => '126 mg/dL']],
            ],
        ]], User::factory()->make());

        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->sole();
        $this->assertSame('active', $enrollment->status);
        $this->assertSame($this->record->id, $enrollment->started_health_record_id);
        $this->assertEqualsCanonicalizing(['Hypertension', 'Diabetes Mellitus'], $enrollment->activeConditionNames());

        $encounter = $enrollment->encounters()->sole();
        $this->assertSame('started', $encounter->kind);
        $this->assertSame(['fbs' => '126 mg/dL'], $encounter->field_data['diabetes_monitoring'] ?? null);
    }

    public function test_a_second_start_for_an_already_active_pathway_reuses_it_as_continued(): void
    {
        $service = app(CarePathwayActivationService::class);
        $service->activate($this->patient, $this->record, [[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]], User::factory()->make());

        $laterRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $service->activate($this->patient, $laterRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]], User::factory()->make());

        $this->assertSame(1, CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->count());
        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->sole();
        $this->assertSame(2, $enrollment->encounters()->count());
        $this->assertSame('continued', $enrollment->encounters()->latest('id')->first()->kind);
    }

    public function test_unknown_pathway_key_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        app(CarePathwayActivationService::class)->activate($this->patient, $this->record, [[
            'pathway_key' => 'made_up',
            'conditions' => [['condition_name' => 'X', 'field_set_key' => null, 'diagnosis_ref' => null, 'field_values' => []]],
        ]], User::factory()->make());
    }

    public function test_unknown_field_set_key_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        app(CarePathwayActivationService::class)->activate($this->patient, $this->record, [[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'made_up_set', 'diagnosis_ref' => null, 'field_values' => []]],
        ]], User::factory()->make());
    }

    public function test_legacy_tb_records_can_be_linked_as_encounters_without_being_modified(): void
    {
        $legacyTb = HealthRecord::create([
            'patient_id' => $this->patient->id, 'category' => 'TB DOTS / TB Monitoring',
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'OLD-1']],
        ]);

        app(CarePathwayActivationService::class)->activate($this->patient, $this->record, [[
            'pathway_key' => 'tb_dots',
            'conditions' => [['condition_name' => 'Tuberculosis', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
            'link_legacy_health_record_ids' => [$legacyTb->id],
        ]], User::factory()->make());

        $enrollment = CarePathwayEnrollment::where('pathway_key', 'tb_dots')->sole();
        $this->assertSame(2, $enrollment->encounters()->count());
        $legacyEncounter = $enrollment->encounters()->where('health_record_id', $legacyTb->id)->sole();
        $this->assertSame('legacy_linked', $legacyEncounter->kind);
        $this->assertNull($legacyEncounter->field_data);
        $this->assertSame('OLD-1', $legacyTb->fresh()->tb_data['diagnosis']['tbCaseNumber']);
    }

    public function test_assert_allowed_blocks_a_user_without_care_pathways_manage(): void
    {
        $bhw = User::create(['name' => 'No Perm', 'email' => 'noperm@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE]);
        $service = app(CarePathwayActivationService::class);
        if ($service->canManage($bhw)) {
            $this->markTestSkipped('The default BHW role has care_pathways.manage in this configuration.');
        }

        $this->expectException(ValidationException::class);
        $service->assertAllowed($bhw, [['pathway_key' => 'ncd', 'conditions' => []]]);
    }

    public function test_assert_allowed_is_silent_when_nothing_is_being_activated(): void
    {
        $bhw = User::create(['name' => 'No Perm 2', 'email' => 'noperm2@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE]);

        app(CarePathwayActivationService::class)->assertAllowed($bhw, []);
        $this->addToAssertionCount(1); // did not throw
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=CarePathwayActivationServiceTest`
Expected: FAIL — `Class "App\Services\CarePathwayActivationService" not found`.

- [ ] **Step 3: Write the service**

```php
<?php
// backend/app/Services/CarePathwayActivationService.php

namespace App\Services;

use App\Models\CarePathwayEncounter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Turns a validated "start/continue a Care Pathway" activation into
 * enrollment/condition/encounter rows. Called ONLY from
 * HealthRecordController::store(), inside its existing DB::transaction(),
 * right where CurrentConditionsSync::sync() already runs - same pattern,
 * same file, same transaction. Never a standalone write.
 */
class CarePathwayActivationService
{
    public function __construct(private readonly CarePathwayRegistry $registry) {}

    public function canManage(User $user): bool
    {
        return $user->isAdmin() || ActionPermissions::allows($user, 'care_pathways.manage');
    }

    /**
     * Mirrors CurrentConditionsSync::assertAllowed exactly: a user who may
     * not manage Care Pathways may still save a consultation with none.
     */
    public function assertAllowed(User $user, array $activations): void
    {
        if ($this->canManage($user) || $activations === []) {
            return;
        }

        throw ValidationException::withMessages([
            'monitoring_data.activeCarePathways.0' => 'You do not have permission to start or continue a care pathway.',
        ]);
    }

    /**
     * @param array<int, array{pathway_key: string, conditions: array<int, array{condition_name: string, field_set_key: ?string, diagnosis_ref: ?string, field_values: array}>, link_legacy_health_record_ids?: array<int, int>}> $activations
     */
    public function activate(Patient $patient, HealthRecord $record, array $activations, User $user): void
    {
        foreach ($activations as $index => $activation) {
            $this->activateOne($patient, $record, $activation, $user, $index);
        }
    }

    private function activateOne(Patient $patient, HealthRecord $record, array $activation, User $user, int $index): void
    {
        $pathwayKey = $activation['pathway_key'] ?? null;
        if (! is_string($pathwayKey) || ! $this->registry->has($pathwayKey)) {
            throw ValidationException::withMessages([
                "monitoring_data.activeCarePathways.$index.pathway_key" => 'This care pathway is not configured.',
            ]);
        }

        foreach ($activation['conditions'] ?? [] as $conditionIndex => $condition) {
            $fieldSetKey = $condition['field_set_key'] ?? null;
            if ($fieldSetKey !== null && ! $this->registry->hasFieldSet($pathwayKey, $fieldSetKey)) {
                throw ValidationException::withMessages([
                    "monitoring_data.activeCarePathways.$index.conditions.$conditionIndex.field_set_key" => 'This monitoring form is not configured for this pathway.',
                ]);
            }
        }

        $enrollment = CarePathwayEnrollment::query()
            ->where('patient_id', $patient->id)
            ->where('pathway_key', $pathwayKey)
            ->where('status', CarePathwayEnrollment::STATUS_ACTIVE)
            ->lockForUpdate()
            ->first();

        $kind = CarePathwayEncounter::KIND_STARTED;
        if ($enrollment === null) {
            $enrollment = CarePathwayEnrollment::create([
                'patient_id' => $patient->id,
                'pathway_key' => $pathwayKey,
                'status' => CarePathwayEnrollment::STATUS_ACTIVE,
                'barangay_health_center_id' => $patient->barangay_health_center_id,
                'started_health_record_id' => $record->id,
                'started_at' => $record->date_recorded ?? now(),
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);
        } else {
            $kind = CarePathwayEncounter::KIND_CONTINUED;
        }

        $fieldData = [];
        foreach ($activation['conditions'] ?? [] as $condition) {
            $enrollment->conditions()->firstOrCreate(
                ['condition_name' => $condition['condition_name'], 'removed_at' => null],
                [
                    'field_set_key' => $condition['field_set_key'] ?? null,
                    'diagnosis_ref' => $condition['diagnosis_ref'] ?? null,
                    'added_health_record_id' => $record->id,
                ]
            );
            if (($condition['field_set_key'] ?? null) !== null && ($condition['field_values'] ?? []) !== []) {
                $fieldData[$condition['field_set_key']] = $condition['field_values'];
            }
        }

        $enrollment->encounters()->create([
            'health_record_id' => $record->id,
            'kind' => $kind,
            'field_data' => $fieldData !== [] ? $fieldData : null,
            'created_at' => now(),
        ]);

        foreach ($activation['link_legacy_health_record_ids'] ?? [] as $legacyRecordId) {
            $enrollment->encounters()->firstOrCreate(
                ['health_record_id' => $legacyRecordId],
                ['kind' => CarePathwayEncounter::KIND_LEGACY_LINKED, 'field_data' => null, 'created_at' => now()]
            );
        }
    }
}
```

- [ ] **Step 4: Run the test again**

Run: `cd backend && php artisan test --filter=CarePathwayActivationServiceTest`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/Services/CarePathwayActivationService.php tests/Feature/CarePathwayActivationServiceTest.php
git commit -m "feat(care-pathways): add CarePathwayActivationService

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Request validation for `activeCarePathways`, and removing `ncdData`

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Test: `backend/tests/Feature/HealthRecordCarePathwayValidationTest.php`

**Interfaces:**
- Consumes: `CarePathwayRegistry` (Task 3).
- Produces: `$request->validated()['monitoring_data']['activeCarePathways']`
  reaching the controller as an array shaped exactly as
  `CarePathwayActivationService::activate()` expects (Task 7) — this task's
  job is making sure only a well-formed array gets that far.

- [ ] **Step 1: Write the failing feature test**

```php
<?php
// backend/tests/Feature/HealthRecordCarePathwayValidationTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class HealthRecordCarePathwayValidationTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Val RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Val BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Val BHW', 'email' => 'val@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'O', 'last_name' => 'P', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function store(array $activeCarePathways)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => ['activeCarePathways' => $activeCarePathways],
        ]);
    }

    public function test_a_valid_activation_saves(): void
    {
        $this->store([[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'hypertension_monitoring', 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]])->assertCreated();
    }

    public function test_an_unknown_pathway_key_is_rejected(): void
    {
        $this->store([[
            'pathway_key' => 'made_up',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.activeCarePathways.0.pathway_key']);
    }

    public function test_an_unknown_field_set_key_is_rejected(): void
    {
        $this->store([[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'made_up_set', 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.activeCarePathways.0.conditions.0.field_set_key']);
    }

    public function test_a_blank_condition_name_is_rejected(): void
    {
        $this->store([[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => '', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.activeCarePathways.0.conditions.0.condition_name']);
    }

    public function test_the_old_ncddata_shape_is_no_longer_accepted(): void
    {
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'x',
            'monitoring_data' => ['ncdData' => ['conditions' => ['Hypertension'], 'diabetes' => ['fbs' => '95']]],
        ])->assertCreated(); // ncdData is simply an unrecognized key now - it is dropped, not rejected (no validation rule owns it), same as any other stray key.
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=HealthRecordCarePathwayValidationTest`
Expected: FAIL — `test_a_valid_activation_saves`, `test_an_unknown_pathway_key_is_rejected`
etc. all fail because there is no rule for `activeCarePathways` yet (an
unvalidated key is silently dropped, so the "valid" case creates a record
with no pathway saved — but the "invalid" cases wrongly succeed with 201
instead of failing validation).

- [ ] **Step 3: Remove the `ncdData` rules**

Modify `backend/app/Http/Requests/HealthRecordRequest.php:158-164` — delete
these six lines entirely (the uncommitted NCD-specific rules superseded by
the generic model):

```php
            // NCD Monitoring: only NCD-specific data, keyed by condition so
            // another condition's fields can sit beside `diabetes` later.
            'monitoring_data.ncdData' => ['nullable', 'array:conditions,diabetes'],
            'monitoring_data.ncdData.conditions' => ['nullable', 'array', 'list', 'max:'.count(ConsultationPrograms::NCD_CONDITIONS)],
            'monitoring_data.ncdData.conditions.*' => ['required', 'string', 'distinct', Rule::in(ConsultationPrograms::NCD_CONDITIONS)],
            'monitoring_data.ncdData.diabetes' => ['nullable', 'array:fbs'],
            'monitoring_data.ncdData.diabetes.fbs' => ['nullable', 'string', 'max:100'],
```

- [ ] **Step 4: Add the static shape rules**

In the same file, right after the line you just left in place
(`'monitoring_data.attending_staff' => ['nullable', 'string', 'max:150'],`,
now at line 157), add:

```php
            'monitoring_data.activeCarePathways' => ['nullable', 'array'],
            'monitoring_data.activeCarePathways.*.pathway_key' => ['required', 'string'],
            'monitoring_data.activeCarePathways.*.conditions' => ['required', 'array', 'min:1'],
            'monitoring_data.activeCarePathways.*.conditions.*.condition_name' => ['required', 'string', 'max:150'],
            'monitoring_data.activeCarePathways.*.conditions.*.field_set_key' => ['nullable', 'string'],
            'monitoring_data.activeCarePathways.*.conditions.*.diagnosis_ref' => ['nullable', 'string', 'max:64'],
            'monitoring_data.activeCarePathways.*.conditions.*.field_values' => ['nullable', 'array'],
            'monitoring_data.activeCarePathways.*.link_legacy_health_record_ids' => ['nullable', 'array'],
            'monitoring_data.activeCarePathways.*.link_legacy_health_record_ids.*' => ['integer', 'exists:health_records,id'],
```

- [ ] **Step 5: Add the registry-backed dynamic checks**

Modify the `withValidator` closure (`backend/app/Http/Requests/HealthRecordRequest.php:345-445`).
Add this block right after the existing `ConsultationPrograms::validateSelection(...)`
call (currently ending at line 357):

```php
            $registry = app(\App\Services\CarePathwayRegistry::class);
            foreach ($this->input('monitoring_data.activeCarePathways', []) as $index => $activation) {
                $pathwayKey = $activation['pathway_key'] ?? null;
                if (! is_string($pathwayKey) || ! $registry->has($pathwayKey)) {
                    $validator->errors()->add("monitoring_data.activeCarePathways.$index.pathway_key", 'This care pathway is not configured.');
                    continue;
                }
                foreach ($activation['conditions'] ?? [] as $conditionIndex => $condition) {
                    $fieldSetKey = $condition['field_set_key'] ?? null;
                    if ($fieldSetKey !== null && ! $registry->hasFieldSet($pathwayKey, $fieldSetKey)) {
                        $validator->errors()->add("monitoring_data.activeCarePathways.$index.conditions.$conditionIndex.field_set_key", 'This monitoring form is not configured for this pathway.');
                    }
                }
            }
```

- [ ] **Step 6: Also remove the `use App\Services\ConsultationPrograms;` reference to `NCD_CONDITIONS`**

The `ConsultationPrograms` import at the top of the file (line 7) stays — it
is still used for `ConsultationPrograms::rules('monitoring_data')` and
`::validateSelection(...)`. Only the `NCD_CONDITIONS` reference you deleted
in Step 3 is gone; no import changes needed here (Task 12 removes the
constant itself from `ConsultationPrograms`).

- [ ] **Step 7: Run the test again**

Run: `cd backend && php artisan test --filter=HealthRecordCarePathwayValidationTest`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
cd backend
git add app/Http/Requests/HealthRecordRequest.php tests/Feature/HealthRecordCarePathwayValidationTest.php
git commit -m "feat(care-pathways): validate activeCarePathways, drop ncdData rules

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Wire activation into `HealthRecordController::store()`

**Files:**
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php`
- Test: `backend/tests/Feature/HealthRecordCarePathwayActivationTest.php`

**Interfaces:**
- Consumes: `CarePathwayActivationService::assertAllowed`/`::activate`
  (Task 7).

- [ ] **Step 1: Write the failing feature test**

```php
<?php
// backend/tests/Feature/HealthRecordCarePathwayActivationTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class HealthRecordCarePathwayActivationTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Wire RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Wire BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Wire BHW', 'email' => 'wire@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'Q', 'last_name' => 'R', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    public function test_saving_a_consultation_with_an_activation_creates_the_enrollment_in_the_same_request(): void
    {
        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => ['activeCarePathways' => [[
                'pathway_key' => 'ncd',
                'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'hypertension_monitoring', 'diagnosis_ref' => 'd1', 'field_values' => []]],
            ]]],
        ])->assertCreated()->json('data.id');

        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->sole();
        $this->assertSame($id, $enrollment->started_health_record_id);
        $this->assertSame(['Hypertension'], $enrollment->activeConditionNames());
    }

    public function test_a_user_without_care_pathways_manage_cannot_activate_one(): void
    {
        $encoder = User::create(['name' => 'Encoder', 'email' => 'encoder@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'permissions' => ActionPermissions::PRESETS['encoder']]);
        $this->actingAs($encoder, 'sanctum');

        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'monitoring_data' => ['activeCarePathways' => [[
                'pathway_key' => 'ncd',
                'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
            ]]],
        ])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.activeCarePathways.0']);

        $this->assertDatabaseCount('care_pathway_enrollments', 0);
    }

    public function test_a_failed_save_leaves_no_enrollment_behind(): void
    {
        // An idempotency replay of a DIFFERENT payload under the same key is
        // rejected before the transaction runs a second time - reuse that
        // existing guard to prove nothing partial was written.
        $key = (string) Str::uuid();
        $payload = [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'monitoring_data' => ['activeCarePathways' => [[
                'pathway_key' => 'ncd',
                'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
            ]]],
            'dispensed_medicines' => [['medicine_id' => 999999, 'quantity' => 1]], // does not exist -> validation fails
        ];

        $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)
            ->assertUnprocessable();

        $this->assertDatabaseCount('care_pathway_enrollments', 0);
        $this->assertDatabaseCount('health_records', 0);
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=HealthRecordCarePathwayActivationTest`
Expected: FAIL — `test_saving_a_consultation_with_an_activation_creates_the_enrollment_in_the_same_request`
fails (`care_pathway_enrollments` stays empty); the permission test fails
because nothing checks `care_pathways.manage` yet.

- [ ] **Step 3: Wire the service into the controller**

Modify `backend/app/Http/Controllers/Api/HealthRecordController.php`.

Add the import near the other `use App\Services\...` lines (`:15`, after
`CurrentConditionsSync`):

```php
use App\Services\CarePathwayActivationService;
```

Add the new constructor-injected dependency to `store()`'s parameter list
(`:75-83`), alongside `CurrentConditionsSync $currentConditions`:

```php
    public function store(
        HealthRecordRequest $request,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks,
        HealthRecordIdempotencyService $idempotency,
        ReferralCreationService $referralCreation,
        HealthRecordDraftService $drafts,
        CurrentConditionsSync $currentConditions,
        CarePathwayActivationService $carePathways
    ) {
```

Right after the existing permission check on line 87
(`$currentConditions->assertAllowed($request->user(), $data['diagnoses'] ?? []);`),
add:

```php
        $carePathways->assertAllowed($request->user(), $data['monitoring_data']['activeCarePathways'] ?? []);
```

In the `DB::transaction()` closure's `use (...)` list (`:153-166`), add
`$carePathways` alongside `$currentConditions`.

Right after the existing sync call inside the transaction (`:181-182`,
`$currentConditions->sync($patient, $data['diagnoses'] ?? [], $record->date_recorded->toDateString());`),
add:

```php
                $carePathways->activate($patient, $record, $data['monitoring_data']['activeCarePathways'] ?? [], $request->user());
```

- [ ] **Step 4: Run the test again**

Run: `cd backend && php artisan test --filter=HealthRecordCarePathwayActivationTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full HealthRecordController-adjacent suites to check for regressions**

Run: `cd backend && php artisan test --filter='HealthRecordCarePathway|CarePathway|CurrentConditionsSyncTest'`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/Http/Controllers/Api/HealthRecordController.php tests/Feature/HealthRecordCarePathwayActivationTest.php
git commit -m "feat(care-pathways): activate pathways inside the health-record save transaction

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Disposition follow-up-task pathway linking

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php`
- Test: `backend/tests/Feature/CarePathwayFollowUpLinkTest.php`

**Interfaces:**
- Consumes: `FollowUpTask::carePathwayEnrollments()` (Task 2),
  `CarePathwayEnrollment` (Task 2). Depends on Task 9's transaction wiring
  (the follow-up task must already exist via `$followUpTasks->syncRecord(...)`
  before this task's linking code runs).

- [ ] **Step 1: Write the failing feature test**

```php
<?php
// backend/tests/Feature/CarePathwayFollowUpLinkTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CarePathwayFollowUpLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_scheduled_follow_up_links_only_the_ticked_pathways(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Link RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Link BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Link BHW', 'email' => 'link@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'S', 'last_name' => 'T', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => [
                'activeCarePathways' => [[
                    'pathway_key' => 'ncd',
                    'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
                ]],
                'followUpForPathways' => ['ncd'],
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeek()->toDateString(),
            ],
        ])->assertCreated()->json('data.id');

        $enrollment = CarePathwayEnrollment::where('patient_id', $patient->id)->sole();
        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertTrue($task->carePathwayEnrollments->contains($enrollment));
    }

    public function test_an_unticked_pathway_is_not_linked(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Link RHU 2', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Link BHC 2', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Link BHW 2', 'email' => 'link2@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'U', 'last_name' => 'V', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => [
                'activeCarePathways' => [[
                    'pathway_key' => 'ncd',
                    'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
                ]],
                'followUpForPathways' => [],
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeek()->toDateString(),
            ],
        ])->assertCreated()->json('data.id');

        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertCount(0, $task->carePathwayEnrollments);
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=CarePathwayFollowUpLinkTest`
Expected: FAIL — the pivot table stays empty (nothing links it yet).

- [ ] **Step 3: Add the validation rule**

Modify `backend/app/Http/Requests/HealthRecordRequest.php` — add right after
the `activeCarePathways.*.link_legacy_health_record_ids.*` rule added in
Task 8:

```php
            'monitoring_data.followUpForPathways' => ['nullable', 'array'],
            'monitoring_data.followUpForPathways.*' => ['string'],
```

- [ ] **Step 4: Link the task after it is synced**

Modify `backend/app/Http/Controllers/Api/HealthRecordController.php`. Right
after the existing `$followUpTasks->syncRecord($record, $request->user(), $lockedFollowUpTask);`
call (the line directly below where Task 9 added the `$carePathways->activate(...)`
call), add:

```php
                $pathwaysForFollowUp = $data['monitoring_data']['followUpForPathways'] ?? [];
                if ($pathwaysForFollowUp !== []) {
                    $task = \App\Models\FollowUpTask::where('health_record_id', $record->id)
                        ->whereNull('rescheduled_to_id')
                        ->first();
                    if ($task !== null) {
                        $enrollmentIds = \App\Models\CarePathwayEnrollment::query()
                            ->where('patient_id', $patient->id)
                            ->whereIn('pathway_key', $pathwaysForFollowUp)
                            ->where('status', \App\Models\CarePathwayEnrollment::STATUS_ACTIVE)
                            ->pluck('id');
                        $task->carePathwayEnrollments()->syncWithoutDetaching($enrollmentIds);
                    }
                }
```

(This reads the task `$followUpTasks->syncRecord(...)` just created/updated
for this exact record — it is looked up the same way `upsertTask` does
internally, by `health_record_id` + `rescheduled_to_id IS NULL` — so it
always finds the current task for this visit, never a stale one.)

- [ ] **Step 5: Run the test again**

Run: `cd backend && php artisan test --filter=CarePathwayFollowUpLinkTest`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/Http/Requests/HealthRecordRequest.php app/Http/Controllers/Api/HealthRecordController.php tests/Feature/CarePathwayFollowUpLinkTest.php
git commit -m "feat(care-pathways): link follow-up tasks to ticked pathways only

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Draft payload schema — add `activeCarePathways`, remove `ncdData`

**Files:**
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php`
- Test: `backend/tests/Feature/CarePathwayDraftTest.php`

- [ ] **Step 1: Write the failing feature test**

```php
<?php
// backend/tests/Feature/CarePathwayDraftTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CarePathwayDraftTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_care_pathways_round_trip_through_a_draft(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Draft RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Draft BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Draft BHW', 'email' => 'draft@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'W', 'last_name' => 'X', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $patient->id, 'classification' => 'NCD Monitoring',
            'payload' => [
                'chiefComplaint' => 'BP check',
                'activeCarePathways' => [[
                    'pathway_key' => 'ncd',
                    'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'hypertension_monitoring', 'diagnosis_ref' => 'd1', 'field_values' => []]],
                ]],
                'followUpForPathways' => ['ncd'],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.activeCarePathways.0.pathway_key', 'ncd')
            ->assertJsonPath('data.payload.followUpForPathways.0', 'ncd');
    }

    public function test_the_old_ncddata_shaped_draft_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        (new \App\Services\HealthRecordDraftPayloadService)->sanitize(['ncdData' => ['conditions' => ['Hypertension']]]);
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=CarePathwayDraftTest`
Expected: FAIL — `activeCarePathways`/`followUpForPathways` are unknown keys
and get stripped by `sanitizeNode()` (so the round-trip assertions fail);
`ncdData` is currently still accepted (so the rejection test fails too).

- [ ] **Step 3: Update the schema**

Modify `backend/app/Services/HealthRecordDraftPayloadService.php:349-355` —
replace the `'ncdData'` block with:

```php
        // Care Pathway activation staged on this consultation - see
        // CarePathwayActivationService for what each key means. No vitals:
        // those are the draft's systolicBp/diastolicBp/... above.
        'activeCarePathways' => ['*' => [
            'pathway_key' => self::SCALAR,
            'conditions' => ['*' => [
                'condition_name' => self::SCALAR,
                'field_set_key' => self::SCALAR,
                'diagnosis_ref' => self::SCALAR,
                'field_values' => ['*' => self::SCALAR],
            ]],
            'link_legacy_health_record_ids' => ['*' => self::SCALAR],
        ]],
        'followUpForPathways' => ['*' => self::SCALAR],
```

- [ ] **Step 4: Run the test again**

Run: `cd backend && php artisan test --filter=CarePathwayDraftTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/Services/HealthRecordDraftPayloadService.php tests/Feature/CarePathwayDraftTest.php
git commit -m "feat(care-pathways): add draft schema for activeCarePathways, drop ncdData

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Retire the uncommitted `NCD` program entry

**Files:**
- Modify: `backend/app/Services/ConsultationPrograms.php`
- Modify: `backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php`
- Delete: `backend/tests/Feature/NcdMonitoringProgramTest.php`

**Interfaces:**
- Produces: `ConsultationPrograms::CLASSIFICATIONS` back to exactly
  `['Maternal', 'TB', 'Family Planning', 'EPI']` (TB untouched, per the
  Global Constraints — only the uncommitted `NCD` entry goes).

- [ ] **Step 1: Remove the NCD entry and constant**

Modify `backend/app/Services/ConsultationPrograms.php` — the current file
(after yesterday's uncommitted change) reads:

```php
    public const CLASSIFICATIONS = [
        'Maternal' => 'Maternal',
        'TB' => 'TB DOTS / TB Monitoring',
        'Family Planning' => 'Family Planning',
        'EPI' => 'Immunization',
        // Offered by the consultation's care-pathway suggestion when an NCD
        // diagnosis is recorded; the worker starts it, never the system.
        'NCD' => 'NCD Monitoring',
    ];

    /**
     * Conditions NCD Monitoring covers - the frontend registry's structured
     * diagnoses for the NCD pathway (utils/carePathways.js). Its data lives in
     * monitoring_data.ncdData; vital signs stay in vital_signs.
     */
    public const NCD_CONDITIONS = ['Hypertension', 'Diabetes Mellitus'];
```

Replace with:

```php
    public const CLASSIFICATIONS = [
        'Maternal' => 'Maternal',
        'TB' => 'TB DOTS / TB Monitoring',
        'Family Planning' => 'Family Planning',
        'EPI' => 'Immunization',
    ];
```

(`rules()`'s `'max:'.count(self::CLASSIFICATIONS)` already adjusts itself
back to 4 automatically — no other change needed in this file.)

- [ ] **Step 2: Update the removal-history test's exact-list assertion**

Modify `backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php` —
the current assertion (added yesterday) reads:

```php
        // NCD Monitoring is the redesigned successor (started from a diagnosis'
        // care-pathway suggestion, data in ncdData); the old keys stay gone.
        $this->assertSame(['Maternal', 'TB', 'Family Planning', 'EPI', 'NCD'], array_keys(ConsultationPrograms::CLASSIFICATIONS));
```

Replace with:

```php
        // NCD Monitoring is now a generic Care Pathway (CarePathwayRegistry,
        // "ncd"), not a ConsultationPrograms entry; the old removed keys stay
        // gone from this list either way.
        $this->assertSame(['Maternal', 'TB', 'Family Planning', 'EPI'], array_keys(ConsultationPrograms::CLASSIFICATIONS));
```

- [ ] **Step 3: Delete the superseded test file**

```bash
cd backend
git rm tests/Feature/NcdMonitoringProgramTest.php
```

(Its coverage — activation, vitals never duplicated, unknown-condition
rejection — is now in `CarePathwayActivationServiceTest` and
`HealthRecordCarePathwayValidationTest` from Tasks 7–8.)

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: no failures attributable to this change. (Pre-existing unrelated
failures — the 403-vs-expected-status ones on `/api/health-records` from the
default BHW/encoder preset lacking `consultations.finalize`, tracked
separately — are not this task's concern; every test this plan added or
touched uses the `clinical` preset specifically to avoid them.)

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/Services/ConsultationPrograms.php tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php
git commit -m "refactor(care-pathways): retire the uncommitted NCD program entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Frontend cleanup — remove the uncommitted NCD prototype

**Files:**
- Delete: `frontend/src/components/features/health-records/wizard/CarePathwaySuggestions.jsx`
- Delete: `frontend/src/components/features/health-records/wizard/NcdMonitoringForm.jsx`
- Delete: `frontend/src/utils/ncdMonitoring.js`
- Delete: `frontend/src/utils/ncdMonitoring.test.js`
- Delete: `frontend/src/utils/carePathways.js`
- Delete: `frontend/src/utils/carePathways.test.js`
- Modify: `frontend/src/utils/diagnoses.js`
- Modify: `frontend/src/components/features/health-records/wizard/DiagnosisListField.jsx`
- Modify: `frontend/src/utils/consultationPrograms.js`
- Modify: `frontend/src/utils/consultationPrograms.test.js`
- Modify: `frontend/src/utils/consultationSteps.js`
- Modify: `frontend/src/components/features/health-records/wizard/ConsultationProgramPanel.jsx`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`

**Interfaces:**
- Produces: `DiagnosisListField` with no `selectedPrograms` prop and no
  pathway awareness at all — plain add/edit/remove/star chips, exactly the
  shape it had before any Care Pathway work started. `DIAGNOSIS_SUGGESTIONS`
  stays exported from `diagnoses.js` as a plain local list (Hypertension,
  Diabetes Mellitus) — still typing suggestions, now with zero pathway
  linkage, matching the spec's "no mapping at all" decision.

- [ ] **Step 1: Delete the five superseded files**

```bash
cd frontend
git rm src/components/features/health-records/wizard/CarePathwaySuggestions.jsx
git rm src/components/features/health-records/wizard/NcdMonitoringForm.jsx
git rm src/utils/ncdMonitoring.js src/utils/ncdMonitoring.test.js
git rm src/utils/carePathways.js src/utils/carePathways.test.js
```

- [ ] **Step 2: Fold the structured-diagnosis list back into `diagnoses.js`**

Modify `frontend/src/utils/diagnoses.js`. Replace the current top of the file:

```js
/**
 * Structured diagnoses typed on the consultation's Assessment step. Every
 * entry is chosen by the user - nothing is inferred - and only
 * entries with addToConditions go to the patient's Current Conditions, when
 * the consultation is saved (see CurrentConditionsSync on the backend).
 *
 * The record's plain-text `diagnosis` stays the copy every existing reader
 * uses (reports, referrals, follow-ups): it is the names joined with "; ".
 */
import { findStructuredDiagnosis, getStructuredDiagnosisNames, normalizeNameKey } from "./carePathways.js";

export { normalizeNameKey };

/** Same statuses as the Patient Profile's Current Conditions editor. */
export const CONDITION_STATUSES = ["Active", "Controlled", "Resolved"];

export const DIAGNOSIS_LIMITS = { name: 150, count: 20, notes: 5000 };

/**
 * Structured suggestions offered while typing a diagnosis - the registry's
 * structured diagnoses (carePathways.js), never a second list. Picking one is
 * a shortcut for typing it; any other diagnosis (Asthma, UTI, ...) is typed
 * and saved exactly as entered. No fuzzy matching, autocorrection or
 * automatic inference is layered on top of this list.
 */
export const DIAGNOSIS_SUGGESTIONS = Object.freeze(getStructuredDiagnosisNames());
```

with:

```js
/**
 * Structured diagnoses typed on the consultation's Assessment step. Every
 * entry is chosen by the user - nothing is inferred - and only
 * entries with addToConditions go to the patient's Current Conditions, when
 * the consultation is saved (see CurrentConditionsSync on the backend).
 *
 * The record's plain-text `diagnosis` stays the copy every existing reader
 * uses (reports, referrals, follow-ups): it is the names joined with "; ".
 *
 * Diagnosis and Care Pathway are separate concepts (see
 * docs/superpowers/specs/2026-09-28-care-pathway-architecture-design.md):
 * DIAGNOSIS_SUGGESTIONS below is only a typing shortcut and carries no
 * pathway linkage of any kind.
 */

/** Case/whitespace-insensitive key for comparing diagnosis or condition names. */
export function normalizeNameKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Same statuses as the Patient Profile's Current Conditions editor. */
export const CONDITION_STATUSES = ["Active", "Controlled", "Resolved"];

export const DIAGNOSIS_LIMITS = { name: 150, count: 20, notes: 5000 };

/**
 * Structured suggestions offered while typing a diagnosis - currently
 * standardized diagnosis names. Picking one is a shortcut for typing it; any
 * other diagnosis (Asthma, UTI, ...) is typed and saved exactly as entered.
 * No fuzzy matching, autocorrection or automatic inference is layered on top
 * of this list, and it does not imply any care pathway.
 */
export const DIAGNOSIS_SUGGESTIONS = Object.freeze(["Hypertension", "Diabetes Mellitus"]);

/** Exact match ignoring case/extra spaces - used to keep a structured name's one spelling. */
function findStructuredDiagnosisName(name) {
  const key = normalizeNameKey(name);
  return DIAGNOSIS_SUGGESTIONS.find((suggestion) => normalizeNameKey(suggestion) === key) || null;
}
```

Modify the `addDiagnosis` function further down in the same file — it
currently reads `findStructuredDiagnosis(text)?.name || text`; change that
one call to:

```js
      name: findStructuredDiagnosisName(text) || text,
```

- [ ] **Step 3: Run the diagnoses unit tests**

Run: `cd frontend && node --test src/utils/diagnoses.test.js`
Expected: PASS — no test in this file referenced `carePathways.js` directly,
only `DIAGNOSIS_SUGGESTIONS`'s values, which are unchanged.

- [ ] **Step 4: Remove pathway awareness from `DiagnosisListField.jsx`**

Modify `frontend/src/components/features/health-records/wizard/DiagnosisListField.jsx`.

Update the file's top doc-comment: it currently says the suggestions come
from "(carePathways.js)" and that "Care pathways are not chosen here (see
CarePathwaySuggestions)" — both now refer to deleted files. Replace those two
sentences with: "Care pathways are a separate, later step (see
docs/superpowers/specs/2026-09-28-care-pathway-architecture-design.md) — this
component only adds, marks and removes diagnoses."

Remove the import:

```js
import { findOrphanedPathway, findStructuredDiagnosis } from "../../../../utils/carePathways";
```

Remove the `selectedPrograms = []` prop from the component's destructured
props, and its JSDoc line (`@param selectedPrograms ...`).

Remove the `pendingRemoval`/`PathwayConfirm` state, component, and rendering
block entirely (the orphan-removal guard — there is nothing to check against
until a later plan wires this to real enrollment data per the spec's
"Removing that mapping also retires the guard..." note). Concretely:
- Delete the `const [pendingRemoval, setPendingRemoval] = useState(null);` line.
- Delete the `PathwayConfirm` function component.
- In the `remove(item)` function, replace its body (which currently checks
  `findOrphanedPathway` and may set `pendingRemoval`) with simply:
  ```js
  function remove(item) {
    onChange(removeDiagnosis(diagnoses, item.id));
  }
  ```
- In the `<ul>` row-rendering, delete the
  `if (pending?.item.id === item.id) { return <PathwayConfirm ... /> }`
  branch (there is no longer a `pending` variable at all — only the removed
  `pendingRemoval` existed, and this branch template referenced it under a
  shorter local name in some drafts; make sure any leftover reference to
  `pendingRemoval`/`pending` in this file is gone before moving on — search
  the file for both names to confirm zero remaining occurrences).

Also remove `findStructuredDiagnosis` usage: the "Use ... as diagnosis"
dropdown option's condition currently reads
`trimmed && !findStructuredDiagnosis(trimmed)`. Since `findStructuredDiagnosis`
no longer exists, and `diagnoses.js`'s suggestion list is plain text now with
no exported matcher, simplify this to a case/whitespace-insensitive check
against `filterDiagnosisSuggestions`'s own full list instead. Add this local
helper near the top of the file (after the existing imports):

```js
import { DIAGNOSIS_SUGGESTIONS, /* ...existing named imports stay... */ } from "../../../../utils/diagnoses";
```

and where the dropdown options are built, replace:

```js
    ...(trimmed && !findStructuredDiagnosis(trimmed) ? [{ kind: "custom", value: trimmed }] : []),
```

with:

```js
    ...(trimmed && !DIAGNOSIS_SUGGESTIONS.some((s) => s.toLowerCase().trim() === trimmed.toLowerCase()) ? [{ kind: "custom", value: trimmed }] : []),
```

- [ ] **Step 5: Remove `NCD` from `consultationPrograms.js`**

Modify `frontend/src/utils/consultationPrograms.js` — remove these three
lines from `PROGRAM_CLASSIFICATIONS`:

```js
  // Started from a diagnosis' care-pathway suggestion (see carePathways.js)
  // or from the Programs & Monitoring panel, like any other program.
  NCD: "NCD Monitoring",
```

Modify `frontend/src/utils/consultationPrograms.test.js:18-20` — revert to:

```js
test("the selectable programs", () => {
  assert.deepEqual(Object.keys(PROGRAM_CLASSIFICATIONS), ["Maternal", "TB", "Family Planning", "EPI"]);
});
```

- [ ] **Step 6: Remove `NCD Monitoring` from `consultationSteps.js`**

Modify `frontend/src/utils/consultationSteps.js` — remove this block from
`PROGRAM_STEP_DETAILS`:

```js
  "NCD Monitoring": {
    label: "NCD Monitoring",
    description: "Record NCD monitoring details for the conditions diagnosed at this visit.",
  },
```

Remove this line from `getErrorOwnerStepKey`:

```js
  if (key.startsWith("ncdData.") || key.startsWith("monitoring_data.ncdData.")) return programStepKey("NCD Monitoring");
```

- [ ] **Step 7: Remove `NCD` from `ConsultationProgramPanel.jsx`**

Modify `frontend/src/components/features/health-records/wizard/ConsultationProgramPanel.jsx:18` —
change `programs: ["TB", "NCD"],` back to `programs: ["TB"],`.

- [ ] **Step 8: Remove all NCD wiring from `ConsultationWorkspace.jsx`**

Modify `frontend/src/pages/bhc/ConsultationWorkspace.jsx`. Remove each of the
following (line numbers as of this plan's writing — search for the exact
text if they have shifted):

- The imports at `:99` and `:102`:
  ```js
  import NcdMonitoringForm from "../../components/features/health-records/wizard/NcdMonitoringForm";
  ```
  ```js
  import { EMPTY_NCD_DATA, buildNcdData, ncdReviewRows, normalizeNcdData } from "../../utils/ncdMonitoring";
  ```
- Also remove `import CarePathwaySuggestions from "../../components/features/health-records/wizard/CarePathwaySuggestions";`
  and `import { CARE_PATHWAYS } from "../../utils/carePathways";` (search the
  import block near the top of the file for these — they sit alongside the
  `DiagnosisListField` import).
- The `RECORD_TYPE_DETAILS["NCD Monitoring"]` entry (`:258-262`):
  ```js
  "NCD Monitoring": {
    title: "NCD Monitoring",
    description: "Ongoing monitoring for hypertension and diabetes mellitus.",
    icon: Activity,
  },
  ```
  (Leave the `Activity` icon import alone even if now unused elsewhere —
  check with a quick `grep -n "Activity" frontend/src/pages/bhc/ConsultationWorkspace.jsx`
  after this edit; remove the import too if this was its only use, to keep
  lint clean.)
- The state declarations (`:1173-1174`):
  ```js
  // NCD Monitoring's own fields; saved as monitoring_data.ncdData.
  const [ncdData, setNcdData] = useState(EMPTY_NCD_DATA);
  ```
- The `dismissedCarePathways` state and its setter (search for
  `dismissedCarePathways` — it was declared alongside `ncdData`).
- The load-from-record line (`:1333`):
  ```js
  setNcdData(normalizeNcdData(found.monitoringData?.ncdData || found.monitoring_data?.ncdData));
  ```
- The `isNcd` derivation (`:1521`):
  ```js
  const isNcd = recordTypeKey === "ncd monitoring" || selectedPrograms.includes("NCD");
  ```
- The draft-payload line (`:1841`):
  ```js
  ncdData: normalizeNcdData(ncdData),
  ```
- The draft-restore line (`:1932`):
  ```js
  setNcdData(normalizeNcdData(payload.ncdData));
  ```
- The save-payload block (`:3534-3535`):
  ```js
  // Only NCD-specific data; vital signs stay in vital_signs.
  ...(isNcd ? { ncdData: buildNcdData(ncdData, diagnoses) } : {}),
  ```
- The `handleStartCarePathway` function (search for its definition — it
  called `handleProgramSelect(pathway.programKey)`).
- The review-rows conditional (`:4455`) — replace:
  ```js
  rows: step.classification === "NCD Monitoring" ? ncdReviewRows(ncdData, diagnoses) : programReviewRows({
  ```
  with the plain call it wraps:
  ```js
  rows: programReviewRows({
  ```
- The `CarePathwaySuggestions` render block in the Assessment section (search
  for `<CarePathwaySuggestions` — remove the whole element and its props).
- The `NCD Monitoring` `FormSection` block (`:5488-5497` and its closing
  tags) — the whole
  `{!patientGateLocked && isNcd && showProgramBlock("NCD Monitoring") && (...)}`
  block, including the `<NcdMonitoringForm ... />` inside it.
- Remove the `selectedPrograms={selectedPrograms}` prop from the
  `<DiagnosisListField ... />` element, since that prop no longer exists on
  the component (Step 4 above).

- [ ] **Step 9: Run the full frontend test suite**

Run: `cd frontend && node --test src/utils/*.test.js`
Expected: PASS, with `carePathways.test.js` and `ncdMonitoring.test.js` gone
from the file list (they were deleted in Step 1) and
`consultationPrograms.test.js`'s updated assertion passing.

- [ ] **Step 10: Lint and build**

Run: `cd frontend && npx eslint src/components/features/health-records/wizard/DiagnosisListField.jsx src/utils/diagnoses.js src/utils/consultationPrograms.js src/utils/consultationSteps.js src/components/features/health-records/wizard/ConsultationProgramPanel.jsx src/pages/bhc/ConsultationWorkspace.jsx`
Expected: no errors (this will surface any leftover unused import from
Step 8, e.g. `Activity` or `CARE_PATHWAYS`, as an `no-unused-vars` error —
remove it if so).

Run: `cd frontend && npx vite build`
Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
cd frontend
git add -A src/components/features/health-records/wizard/DiagnosisListField.jsx src/components/features/health-records/wizard/ConsultationProgramPanel.jsx src/utils/diagnoses.js src/utils/consultationPrograms.js src/utils/consultationPrograms.test.js src/utils/consultationSteps.js src/pages/bhc/ConsultationWorkspace.jsx
git commit -m "refactor(care-pathways): remove the uncommitted NCD prototype from the frontend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: Admin permission editors list `care_pathways.manage`

**Files:**
- Modify: `frontend/src/pages/admin/StaffAssignments.jsx`
- Modify: `frontend/src/pages/admin/AddUser.jsx`

**Interfaces:**
- Consumes: nothing new — both files already enumerate a fixed permission
  list matching backend `ActionPermissions::ALL` (Task 5). Find the exact
  array/label-map each file uses (grep the file for an existing permission
  like `'clinical.history'` to locate it) and add one entry:
  `{ value: 'care_pathways.manage', label: 'Care Pathways (start/continue/end monitoring)' }`
  (match whichever literal shape — array of strings with a separate label
  map, or array of `{value, label}` objects — the surrounding code already
  uses in that file, rather than introducing a new shape).

- [ ] **Step 1: Locate the exact pattern in `StaffAssignments.jsx`**

Run: `cd frontend && grep -n "clinical.history" src/pages/admin/StaffAssignments.jsx`

- [ ] **Step 2: Add the new permission there, matching that exact pattern**

(No single code block is given here because the two files may structure this
list differently — copy the shape the grep in Step 1 reveals exactly, adding
one entry for `care_pathways.manage` with the label
`"Care Pathways (start/continue/end monitoring)"`.)

- [ ] **Step 3: Repeat for `AddUser.jsx`**

Run: `cd frontend && grep -n "clinical.history" src/pages/admin/AddUser.jsx`

Add the same entry there, matching that file's own existing pattern.

- [ ] **Step 4: Manually verify in the running app**

Run the frontend dev server, open the admin "Add User" and "Staff
Assignments" screens, and confirm "Care Pathways (start/continue/end
monitoring)" appears as a checkable permission alongside the existing ones.
(No automated test exists for these admin screens' permission lists today —
follow the existing convention in each file rather than introducing one.)

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/pages/admin/StaffAssignments.jsx src/pages/admin/AddUser.jsx
git commit -m "feat(care-pathways): list care_pathways.manage in admin permission editors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Complete/discontinue an enrollment and remove a condition from it

The spec requires this to be in scope now, not deferred: "During a pathway
encounter the worker can Complete or Discontinue the pathway (with a reason)
and add/remove conditions; it takes effect when that consultation saves, same
transaction, audited." This extends the same activation payload shape from
Task 7 rather than adding a new endpoint — ending or editing an enrollment is
still only ever a side effect of saving a consultation.

**Files:**
- Modify: `backend/app/Services/CarePathwayActivationService.php`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Test: `backend/tests/Feature/CarePathwayEnrollmentLifecycleTest.php`

**Interfaces:**
- Consumes: `CarePathwayEnrollment`, `CarePathwayEnrollmentCondition` (Task 2).
- Produces: `CarePathwayActivationService::activate()`'s per-activation array
  gains three new optional keys: `status` (`?string`, one of
  `active|completed|discontinued`), `end_reason` (`?string`), and
  `remove_condition_names` (`?array<int, string>`). Passing `status` as
  `completed`/`discontinued` on an activation whose pathway has an active
  enrollment ends that specific enrollment; `remove_condition_names`
  soft-removes those exact condition names from it. Neither key is required
  by any existing caller — every test from Tasks 7–10 keeps passing unchanged.

- [ ] **Step 1: Write the failing feature test**

```php
<?php
// backend/tests/Feature/CarePathwayEnrollmentLifecycleTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\CarePathwayActivationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CarePathwayEnrollmentLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;
    private HealthRecord $startRecord;
    private CarePathwayActivationService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Life RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Life BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'Y', 'last_name' => 'Z', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->startRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);
        $this->service = app(CarePathwayActivationService::class);
        $this->service->activate($this->patient, $this->startRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [
                ['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []],
                ['condition_name' => 'Diabetes Mellitus', 'field_set_key' => 'diabetes_monitoring', 'diagnosis_ref' => 'd2', 'field_values' => []],
            ],
        ]], User::factory()->make());
    }

    public function test_discontinuing_ends_the_enrollment_with_its_reason(): void
    {
        $laterRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);

        $this->service->activate($this->patient, $laterRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [],
            'status' => 'discontinued',
            'end_reason' => 'Patient transferred to another facility.',
        ]], User::factory()->make());

        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->sole();
        $this->assertSame('discontinued', $enrollment->status);
        $this->assertSame($laterRecord->id, $enrollment->ended_health_record_id);
        $this->assertSame('Patient transferred to another facility.', $enrollment->end_reason);
        $this->assertNotNull($enrollment->ended_at);
    }

    public function test_removing_a_condition_soft_removes_it_without_ending_the_enrollment(): void
    {
        $laterRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);

        $this->service->activate($this->patient, $laterRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [],
            'remove_condition_names' => ['Diabetes Mellitus'],
        ]], User::factory()->make());

        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->sole();
        $this->assertSame('active', $enrollment->status);
        $this->assertSame(['Hypertension'], $enrollment->activeConditionNames());
        $removed = $enrollment->conditions()->where('condition_name', 'Diabetes Mellitus')->sole();
        $this->assertSame($laterRecord->id, $removed->removed_health_record_id);
        $this->assertNotNull($removed->removed_at);
    }

    public function test_completing_one_pathway_does_not_touch_a_different_active_pathway_for_the_same_patient(): void
    {
        $this->service->activate($this->patient, $this->startRecord, [[
            'pathway_key' => 'tb_dots',
            'conditions' => [['condition_name' => 'Tuberculosis', 'field_set_key' => null, 'diagnosis_ref' => 'd3', 'field_values' => []]],
        ]], User::factory()->make());

        $laterRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $this->service->activate($this->patient, $laterRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [],
            'status' => 'completed',
            'end_reason' => 'Blood pressure and blood sugar stable for 6 months.',
        ]], User::factory()->make());

        $ncd = CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->sole();
        $tb = CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'tb_dots')->sole();
        $this->assertSame('completed', $ncd->status);
        $this->assertSame('active', $tb->status);
    }

    public function test_ending_a_pathway_with_no_active_enrollment_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->activate($this->patient, $this->startRecord, [[
            'pathway_key' => 'tb_dots',
            'conditions' => [],
            'status' => 'discontinued',
            'end_reason' => 'No such enrollment exists yet.',
        ]], User::factory()->make());
    }

    public function test_after_discontinuing_a_new_start_creates_a_fresh_enrollment(): void
    {
        $endRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $this->service->activate($this->patient, $endRecord, [[
            'pathway_key' => 'ncd', 'conditions' => [], 'status' => 'discontinued', 'end_reason' => 'Lost to follow-up.',
        ]], User::factory()->make());

        $restartRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $this->service->activate($this->patient, $restartRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]], User::factory()->make());

        $this->assertSame(2, CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->count());
        $active = CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->where('status', 'active')->sole();
        $this->assertSame($restartRecord->id, $active->started_health_record_id);
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && php artisan test --filter=CarePathwayEnrollmentLifecycleTest`
Expected: FAIL — `status`/`end_reason`/`remove_condition_names` are not read
by `activateOne()` yet, so every enrollment stays `active` and no condition
is ever soft-removed; `test_ending_a_pathway_with_no_active_enrollment_is_rejected`
fails because nothing throws today.

- [ ] **Step 3: Extend the service**

Modify `backend/app/Services/CarePathwayActivationService.php`. Replace the
`activateOne` method's body (written in Task 7) with this extended version,
which finds-or-creates the enrollment exactly as before, then additionally
applies condition removals and a status change when present:

```php
    private function activateOne(Patient $patient, HealthRecord $record, array $activation, User $user, int $index): void
    {
        $pathwayKey = $activation['pathway_key'] ?? null;
        if (! is_string($pathwayKey) || ! $this->registry->has($pathwayKey)) {
            throw ValidationException::withMessages([
                "monitoring_data.activeCarePathways.$index.pathway_key" => 'This care pathway is not configured.',
            ]);
        }

        foreach ($activation['conditions'] ?? [] as $conditionIndex => $condition) {
            $fieldSetKey = $condition['field_set_key'] ?? null;
            if ($fieldSetKey !== null && ! $this->registry->hasFieldSet($pathwayKey, $fieldSetKey)) {
                throw ValidationException::withMessages([
                    "monitoring_data.activeCarePathways.$index.conditions.$conditionIndex.field_set_key" => 'This monitoring form is not configured for this pathway.',
                ]);
            }
        }

        $status = $activation['status'] ?? null;
        $isEnding = in_array($status, [CarePathwayEnrollment::STATUS_COMPLETED, CarePathwayEnrollment::STATUS_DISCONTINUED], true);

        $enrollment = CarePathwayEnrollment::query()
            ->where('patient_id', $patient->id)
            ->where('pathway_key', $pathwayKey)
            ->where('status', CarePathwayEnrollment::STATUS_ACTIVE)
            ->lockForUpdate()
            ->first();

        if ($enrollment === null && $isEnding) {
            throw ValidationException::withMessages([
                "monitoring_data.activeCarePathways.$index.status" => 'There is no active enrollment in this pathway to end.',
            ]);
        }

        $kind = CarePathwayEncounter::KIND_STARTED;
        if ($enrollment === null) {
            $enrollment = CarePathwayEnrollment::create([
                'patient_id' => $patient->id,
                'pathway_key' => $pathwayKey,
                'status' => CarePathwayEnrollment::STATUS_ACTIVE,
                'barangay_health_center_id' => $patient->barangay_health_center_id,
                'started_health_record_id' => $record->id,
                'started_at' => $record->date_recorded ?? now(),
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);
        } else {
            $kind = CarePathwayEncounter::KIND_CONTINUED;
        }

        foreach ($activation['remove_condition_names'] ?? [] as $conditionName) {
            $enrollment->conditions()
                ->where('condition_name', $conditionName)
                ->whereNull('removed_at')
                ->update(['removed_health_record_id' => $record->id, 'removed_at' => now()]);
        }

        $fieldData = [];
        foreach ($activation['conditions'] ?? [] as $condition) {
            $enrollment->conditions()->firstOrCreate(
                ['condition_name' => $condition['condition_name'], 'removed_at' => null],
                [
                    'field_set_key' => $condition['field_set_key'] ?? null,
                    'diagnosis_ref' => $condition['diagnosis_ref'] ?? null,
                    'added_health_record_id' => $record->id,
                ]
            );
            if (($condition['field_set_key'] ?? null) !== null && ($condition['field_values'] ?? []) !== []) {
                $fieldData[$condition['field_set_key']] = $condition['field_values'];
            }
        }

        if ($isEnding) {
            $enrollment->update([
                'status' => $status,
                'ended_health_record_id' => $record->id,
                'ended_at' => $record->date_recorded ?? now(),
                'end_reason' => $activation['end_reason'] ?? null,
                'updated_by' => $user->id,
            ]);
        }

        $enrollment->encounters()->create([
            'health_record_id' => $record->id,
            'kind' => $kind,
            'field_data' => $fieldData !== [] ? $fieldData : null,
            'created_at' => now(),
        ]);

        foreach ($activation['link_legacy_health_record_ids'] ?? [] as $legacyRecordId) {
            $enrollment->encounters()->firstOrCreate(
                ['health_record_id' => $legacyRecordId],
                ['kind' => CarePathwayEncounter::KIND_LEGACY_LINKED, 'field_data' => null, 'created_at' => now()]
            );
        }
    }
```

(The only real change from Task 7's version: the `$isEnding`/`no active
enrollment to end` guard right after resolving `$enrollment`, the
`remove_condition_names` loop before conditions are added, and the
`if ($isEnding) { $enrollment->update(...) }` block before the encounter is
created. Everything else — the pathway/field-set checks, the started-vs-
continued logic, the encounter and legacy-link creation — is unchanged.)

- [ ] **Step 4: Add validation for the new keys**

Modify `backend/app/Http/Requests/HealthRecordRequest.php` — add right after
the `activeCarePathways.*.conditions.*.field_values` rule added in Task 8:

```php
            'monitoring_data.activeCarePathways.*.status' => ['nullable', 'string', Rule::in(['active', 'completed', 'discontinued'])],
            'monitoring_data.activeCarePathways.*.end_reason' => ['required_if:monitoring_data.activeCarePathways.*.status,completed,discontinued', 'nullable', 'string', 'max:500'],
            'monitoring_data.activeCarePathways.*.remove_condition_names' => ['nullable', 'array'],
            'monitoring_data.activeCarePathways.*.remove_condition_names.*' => ['string', 'max:150'],
```

- [ ] **Step 5: Run the test again**

Run: `cd backend && php artisan test --filter=CarePathwayEnrollmentLifecycleTest`
Expected: PASS (5 tests).

- [ ] **Step 6: Run every Care Pathway test together to confirm nothing regressed**

Run: `cd backend && php artisan test --filter=CarePathway`
Expected: all PASS — this re-runs every test from Tasks 1, 3, 4, 6, 7, 8, 9,
10, 11 and 15 in one pass.

- [ ] **Step 7: Commit**

```bash
cd backend
git add app/Services/CarePathwayActivationService.php app/Http/Requests/HealthRecordRequest.php tests/Feature/CarePathwayEnrollmentLifecycleTest.php
git commit -m "feat(care-pathways): support completing/discontinuing an enrollment and removing a condition

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: every test this plan added or touched passes. Pre-existing
unrelated failures (the `/api/health-records` 403s from the default
BHW/encoder permission preset, and the handful of other failures noted in
prior session summaries — user-admin `permissions_confirmed`, medicine
response fields, notification counts, follow-up rescheduling) are not
regressions from this plan; confirm the failure count matches the baseline
by running `git stash`, `php artisan test`, then `git stash pop` if there is
any doubt about which failures are new.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && node --test src/utils/*.test.js`
Expected: all PASS.

- [ ] **Step 3: Lint and build the frontend**

Run: `cd frontend && npx eslint . && npx vite build`
Expected: no lint errors, build succeeds.

- [ ] **Step 4: Confirm nothing references the deleted files**

Run: `cd frontend && grep -rn "ncdMonitoring\|NcdMonitoringForm\|CarePathwaySuggestions\|utils/carePathways" src/`
Expected: no output.

Run: `cd backend && grep -rn "NCD_CONDITIONS\|ncdData" app/ tests/`
Expected: no output (the old `RemoveHypertensionDiabetesProgramMigrationTest.php`
fixtures for the 2026-09-27 migration may still legitimately reference
historical `hypertensionDiabeticData` — that is a different, older key and is
out of scope; only `ncdData`/`NCD_CONDITIONS` from yesterday's uncommitted
work should be gone).

- [ ] **Step 5: Final commit (if Step 4 found anything to clean up) or none**

If Step 4 surfaced a stray reference, fix it and commit
`fix(care-pathways): remove a leftover reference to the retired NCD prototype`.
Otherwise this task produces no commit — it is a verification gate only.
